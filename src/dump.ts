import type {
  DeviceProfile,
  DeviceSnapshot,
  PackageInfo,
  PackageState,
  Partition,
} from './types';

/**
 * adb 输出解析器
 *
 * 支持三种输入，全部为纯文本解析，零依赖、完全离线：
 *  1. `adb shell pm list packages -f [-u] [-d] [-e] [-3] [-s]` 的输出
 *  2. `adb shell getprop` 的输出（用于推断设备画像）
 *  3. `adb shell dumpsys package` 的输出（用于提取权限 / uses-library / sharedUserId）
 *
 * 所有解析函数都是纯函数：相同输入必然得到相同输出，便于测试与复现。
 */

const PARTITION_MAP: Array<{ prefix: string; partition: Partition }> = [
  { prefix: '/system/priv-app/', partition: 'system-priv-app' },
  { prefix: '/system/framework/', partition: 'system-framework' },
  { prefix: '/system_ext/', partition: 'system-ext-app' },
  { prefix: '/system/product/', partition: 'product-app' },
  { prefix: '/product/', partition: 'product-app' },
  { prefix: '/system/vendor/', partition: 'vendor-app' },
  { prefix: '/vendor/', partition: 'vendor-app' },
  { prefix: '/oem/', partition: 'oem-app' },
  { prefix: '/system/app/', partition: 'system-app' },
  { prefix: '/system/', partition: 'system-app' },
  { prefix: '/data/app/', partition: 'data-app' },
];

/** 由 APK 路径推断所在分区 */
export function inferPartition(path: string): Partition {
  const p = (path || '').replace(/\\/g, '/');
  for (const { prefix, partition } of PARTITION_MAP) {
    if (p.startsWith(prefix)) return partition;
  }
  return 'unknown';
}

/** 预装判定：不在 /data/app 下的都视为预装 */
export function isPreinstalled(partition: Partition): boolean {
  return partition !== 'data-app' && partition !== 'unknown';
}

const SYSTEM_NS = /^(com\.android\.|com\.google\.android\.|android$|com\.qualcomm\.|com\.mediatek\.)/;

/**
 * 解析 `pm list packages -f` 输出。
 *
 * 例：`package:/system/priv-app/TelemetrySvc/TelemetrySvc.apk=com.sony.tv.telemetry`
 */
export function parsePackageList(raw: string, opts: { disabledAs?: PackageState } = {}): PackageInfo[] {
  const out: PackageInfo[] = [];
  const seen = new Set<string>();
  for (const rawLine of raw.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let path = '';
    let name = '';
    let state: PackageState = 'enabled';

    if (line.startsWith('package:')) {
      const body = line.slice('package:'.length);
      const eq = body.lastIndexOf('=');
      if (eq < 0) continue;
      path = body.slice(0, eq).trim();
      name = body.slice(eq + 1).trim();
    } else if (line.startsWith('Package [')) {
      // dumpsys 风格的块头
      const m = /Package \[([^\]]+)\]/.exec(line);
      if (!m) continue;
      name = m[1];
      path = '';
    } else {
      // 纯包名列表（无 -f）
      if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z0-9_]+)+$/.test(line)) {
        name = line;
      } else {
        continue;
      }
    }
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const partition = inferPartition(path);
    out.push({
      name,
      path,
      partition,
      state,
      systemSigned: path ? /^\/(system|system_ext|product|vendor)\//.test(path.replace(/\\/g, '/')) && SYSTEM_NS.test(name) : SYSTEM_NS.test(name),
      preinstalled: isPreinstalled(partition),
      permissions: [],
      usesLibraries: [],
      sharedUserId: null,
      autostart: false,
    });
  }
  // 若调用方传入了禁用态标记（例如来自 `pm list packages -d` 的输出），统一标记
  if (opts.disabledAs && opts.disabledAs !== 'enabled') {
    for (const p of out) p.state = opts.disabledAs;
  }
  return out;
}

/**
 * 合并 `pm list packages -d`（已禁用）与 `-e`（已启用）的输出，标记真实状态。
 */
export function mergeStates(enabled: PackageInfo[], disabledNames: Iterable<string>): PackageInfo[] {
  const set = new Set(disabledNames);
  for (const p of enabled) {
    if (set.has(p.name)) p.state = 'disabled';
  }
  return enabled;
}

/** 敏感权限归一化： permission.XXX 权限名 → 保护组 */
const SENSITIVE_GROUPS: Array<{ re: RegExp; group: string }> = [
  { re: /ACCESS_(FINE|COARSE|BACKGROUND)_LOCATION/, group: 'location' },
  { re: /READ_PHONE_STATE|READ_PHONE_NUMBERS|CALL_PHONE|READ_CALL_LOG/, group: 'phone' },
  { re: /READ_CONTACTS|WRITE_CONTACTS|GET_ACCOUNTS/, group: 'contacts' },
  { re: /SEND_SMS|READ_SMS|RECEIVE_SMS/, group: 'sms' },
  { re: /CAMERA/, group: 'camera' },
  { re: /RECORD_AUDIO/, group: 'microphone' },
  { re: /READ_EXTERNAL_STORAGE|WRITE_EXTERNAL_STORAGE|MANAGE_EXTERNAL_STORAGE/, group: 'storage' },
  { re: /READ_CALENDAR|WRITE_CALENDAR/, group: 'calendar' },
  { re: /BODY_SENSORS|ACTIVITY_RECOGNITION/, group: 'sensors' },
];

/**
 * 解析 `dumpsys package` 输出，为包补充权限、uses-library、sharedUserId 与自启信息。
 *
 * 只做文本解析，不执行任何命令；无法识别的字段保持默认值。
 */
export function enrichFromDumpsys(packages: PackageInfo[], dumpsysRaw: string): PackageInfo[] {
  const byName = new Map(packages.map((p) => [p.name, p]));
  let current: PackageInfo | null = null;
  let inRequestedPerms = false;
  let inInstallPerms = false;
  let inLibs = false;
  let pendingLibTarget: PackageInfo | null = null;

  for (const rawLine of dumpsysRaw.split(/\r?\n/)) {
    const line = rawLine.trimEnd();
    const trimmed = line.trim();

    const headMatch = /Package \[([^\]]+)\]/.exec(trimmed);
    if (headMatch) {
      current = byName.get(headMatch[1]) ?? null;
      inRequestedPerms = false;
      inInstallPerms = false;
      continue;
    }
    if (!current) continue;

    // sharedUserId
    const suid = /sharedUserId=(\S+)/.exec(trimmed);
    if (suid) {
      current.sharedUserId = suid[1];
      continue;
    }
    // usesLibraries / usesOptionalLibraries
    // dumpsys 有两种排版：`usesLibraries: a, b`（同行）与 `usesLibraries:\n    a\n    b`（换行缩进）
    const libBlock = /uses(Libraries|OptionalLibraries):\s*(.*)$/.exec(trimmed);
    if (libBlock) {
      const inlineLibs = libBlock[2]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      current.usesLibraries.push(...inlineLibs);
      // 若同行没有内容，说明库名在后续缩进行中
      inLibs = inlineLibs.length === 0;
      if (inLibs) pendingLibTarget = current;
      continue;
    }
    if (inLibs && pendingLibTarget === current) {
      // 缩进行且形如包名的，视为库名；遇到下一个字段块（形如 `xxx:`）则退出
      if (/^[a-zA-Z][a-zA-Z0-9_.]*$/.test(trimmed)) {
        current.usesLibraries.push(trimmed);
        continue;
      }
      inLibs = false;
      pendingLibTarget = null;
    }

    // requested permissions 区块
    if (/^requested permissions:/.test(trimmed)) {
      inRequestedPerms = true;
      inInstallPerms = false;
      continue;
    }
    if (/^install permissions:/.test(trimmed)) {
      inInstallPerms = true;
      inRequestedPerms = false;
      continue;
    }
    if (/^[A-Za-z][A-Za-z0-9 ]+:$/.test(trimmed) && !/permissions:/.test(trimmed)) {
      inRequestedPerms = false;
      inInstallPerms = false;
    }
    if (inRequestedPerms || inInstallPerms) {
      const perm = /android\.permission\.([A-Z_0-9]+)/.exec(trimmed);
      if (perm) {
        const full = `android.permission.${perm[1]}`;
        for (const { re, group } of SENSITIVE_GROUPS) {
          if (re.test(full) && !current.permissions.includes(group)) {
            current.permissions.push(group);
          }
        }
      }
    }

    // 开机自启：BOOT_COMPLETED 接收器
    if (/android\.intent\.action\.BOOT_COMPLETED/.test(trimmed)) {
      current.autostart = true;
    }
  }

  // 去重并稳定排序（保证可复现）
  for (const p of packages) {
    p.permissions = Array.from(new Set(p.permissions)).sort();
    p.usesLibraries = Array.from(new Set(p.usesLibraries)).sort();
  }
  return packages;
}

const TV_HINTS = /(bravia|androidtv|googletv|tv[_-]?stick|smarttv|mi tv|mitv|tv[_-]?box|shield|firetv|kids tv)/i;

/**
 * 解析 `getprop` 输出并推断设备画像。
 *
 * getprop 行格式示例：`[ro.product.brand]: [Sony]`
 */
export function parseProfile(raw: string): DeviceProfile {
  const props: Record<string, string> = {};
  for (const rawLine of raw.split(/\r?\n/)) {
    const m = /\[([^\]]+)\]:\s*\[([^\]]*)\]/.exec(rawLine);
    if (m) {
      props[m[1].trim()] = m[2].trim();
      continue;
    }
    const m2 = /^([a-zA-Z0-9._-]+)=(.*)$/.exec(rawLine.trim());
    if (m2) props[m2[1]] = m2[2].trim();
  }

  const brandRaw = props['ro.product.brand'] || props['ro.product.product.brand'] || '';
  const manufacturer = props['ro.product.manufacturer'] || props['ro.product.product.manufacturer'] || '';
  const model = props['ro.product.model'] || props['ro.product.product.model'] || '';
  const device = props['ro.product.device'] || props['ro.product.product.device'] || '';
  const apiRaw = props['ro.build.version.sdk'] || props['ro.system.build.version.sdk'] || '';
  const api = /^\d+$/.test(apiRaw) ? Number(apiRaw) : null;
  const characteristics = props['ro.build.characteristics'] || '';
  const features = props['ro.product.system.brand'] || '';

  const evidence: string[] = [];
  const brand = normalizeBrand(brandRaw || manufacturer, evidence);

  const haystack = `${brandRaw} ${manufacturer} ${model} ${device} ${characteristics}`.toLowerCase();
  const isTvByChar = characteristics.includes('tv');
  const isTvByHint = TV_HINTS.test(model) || TV_HINTS.test(device) || TV_HINTS.test(haystack);
  const isTv = isTvByChar || isTvByHint;
  if (isTvByChar) evidence.push(`ro.build.characteristics 含 tv`);
  if (isTvByHint) evidence.push(`型号/设备名命中 TV 特征`);
  if (features) evidence.push(`system.brand=${features}`);
  if (api !== null) evidence.push(`SDK=${api}`);

  let formFactor: DeviceProfile['formFactor'] = 'unknown';
  if (isTv) formFactor = 'tv';
  else if (/(tablet|pad|tab[_-]?\d)/i.test(model)) formFactor = 'tablet';
  else if (/(phone|pixel|mi \d|redmi|galaxy s)/i.test(model)) formFactor = 'phone';

  return { brand, manufacturer, model, device, formFactor, androidApi: api, isTv, evidence };
}

const BRAND_ALIASES: Array<{ re: RegExp; id: string }> = [
  { re: /^sony|bravia/i, id: 'sony' },
  { re: /^xiaomi|^redmi|^miui|^mi\b/i, id: 'xiaomi' },
  { re: /^tcl|^tct/i, id: 'tcl' },
  { re: /^hisense|^vidaa/i, id: 'hisense' },
  { re: /^philips|^tp ?vision|^tpv/i, id: 'philips' },
  { re: /^google|^googletv/i, id: 'google' },
  { re: /^amazon|^firetv/i, id: 'amazon' },
  { re: /^nvidia|^shield/i, id: 'nvidia' },
  { re: /^samsung/i, id: 'samsung' },
  { re: /^skyworth|^coocaa/i, id: 'skyworth' },
  { re: /^changhong|^changhong/i, id: 'changhong' },
  { re: /^sharp|^aquos/i, id: 'sharp' },
  { re: /^lg\b/i, id: 'lg' },
  { re: /^honor|^huawei/i, id: 'huawei' },
];

function normalizeBrand(raw: string, evidence: string[]): string {
  const v = (raw || '').trim();
  if (!v) return 'unknown';
  for (const { re, id } of BRAND_ALIASES) {
    if (re.test(v)) {
      evidence.push(`品牌别名映射 ${v} → ${id}`);
      return id;
    }
  }
  const slug = v.toLowerCase().replace(/[^a-z0-9]+/g, '');
  evidence.push(`品牌归一化为 ${slug}`);
  return slug || 'unknown';
}

/** 组装快照 */
export function buildSnapshot(
  profile: DeviceProfile,
  packages: PackageInfo[],
  source = 'file',
  capturedAt = new Date().toISOString()
): DeviceSnapshot {
  const sorted = [...packages].sort((a, b) => a.name.localeCompare(b.name));
  return { profile, packages: sorted, source, capturedAt };
}

/**
 * 一次性解析「pm list packages -f」+「getprop」+可选「dumpsys package」三份文本。
 * 这是最常用的入口，任何一份缺失都允许为空串。
 */
export function parseSnapshotFiles(input: {
  packages?: string;
  disabled?: string;
  getprop?: string;
  dumpsys?: string;
  source?: string;
}): DeviceSnapshot {
  const pkgs = parsePackageList(input.packages ?? '');
  if (input.disabled) {
    const disabledNames = new Set(
      input.disabled
        .split(/\r?\n/)
        .map((l) => {
          let s = l.trim();
          if (!s) return '';
          // 兼容 `pm list packages -d` 的两种输出：package:<name> 与 package:<path>=<name>
          if (s.startsWith('package:')) s = s.slice('package:'.length).trim();
          const eq = s.lastIndexOf('=');
          return eq >= 0 ? s.slice(eq + 1).trim() : s;
        })
        .filter(Boolean)
    );
    mergeStates(pkgs, disabledNames);
  }
  if (input.dumpsys) enrichFromDumpsys(pkgs, input.dumpsys);
  const profile = parseProfile(input.getprop ?? '');
  return buildSnapshot(profile, pkgs, input.source ?? 'file');
}
