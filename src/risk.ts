import type {
  EvaluateOptions,
  PackageInfo,
  RiskGrade,
  RiskSignal,
  RiskVerdict,
  Rule,
} from './types';
import { BUILTIN_RULES, DEFAULT_ALLOWLIST, PROTECTED_PATTERNS } from './data/rules';
import { blastRadius, buildDependencyGraph, type DependencyEdge, type DependencyGraph } from './revdep';

/**
 * 风险评分引擎（自研，可解释）
 *
 * 与「静态黑名单」工具的本质区别：
 *  1. 每个结论都由多条加权信号叠加而成，输出中给出命中的正则与证据；
 *  2. 引入反向依赖爆炸半径作为「负向信号」，显式建模禁用代价；
 *  3. 保护名单拥有一票否决权，任何信号都无法推翻；
 *  4. 纯函数实现：相同 snapshot + 相同 options ⇒ 相同 verdict，完全可复现。
 */

/** 分区权重：越"核心"的分区，禁用代价越高，作为独立信号计入 */
const PARTITION_WEIGHT: Record<string, number> = {
  'system-priv-app': 10,
  'system-app': 9,
  'system-framework': 8,
  'system-ext-app': 8,
  'product-app': 8,
  'vendor-app': 7,
  'oem-app': 7,
  'data-app': 2,
  unknown: 4,
};

const PARTITION_LABEL: Record<string, string> = {
  'system-priv-app': '位于 /system/priv-app（特权预装）',
  'system-app': '位于 /system/app（系统预装）',
  'system-framework': '位于 /system/framework（框架层）',
  'system-ext-app': '位于 /system_ext（系统扩展预装）',
  'product-app': '位于 /product（产品分区预装）',
  'vendor-app': '位于 /vendor（厂商分区预装）',
  'oem-app': '位于 /oem（OEM 预装）',
  'data-app': '位于 /data/app（用户后装）',
  unknown: '分区未知',
};

/** 敏感权限权重 */
const PERMISSION_WEIGHT = 8;

/** 交叉印证加成权重 */
const SYNERGY_WEIGHT = 20;

function compile(pattern: string): RegExp | null {
  try {
    return new RegExp(pattern, 'i');
  } catch {
    return null;
  }
}

function applies(rule: Rule, brand: string, isTv: boolean): boolean {
  if (rule.tvOnly && !isTv) return false;
  if (rule.brands && rule.brands.length > 0 && !rule.brands.includes(brand)) return false;
  return true;
}

/** 计算单包的信号集合 */
export function collectSignals(
  pkg: PackageInfo,
  ctx: { brand: string; isTv: boolean; rules: Rule[] }
): RiskSignal[] {
  const signals: RiskSignal[] = [];

  for (const rule of ctx.rules) {
    if (!applies(rule, ctx.brand, ctx.isTv)) continue;
    const re = compile(rule.pattern);
    if (!re) continue;

    // autostart 分类使用 __autostart__ 哨兵，改由包属性触发
    if (rule.category === 'autostart') {
      if (pkg.autostart) {
        signals.push({ id: rule.id, label: rule.label, weight: rule.weight, evidence: ['BOOT_COMPLETED'] });
      }
      continue;
    }

    const m = re.exec(pkg.name);
    if (m) {
      signals.push({
        id: rule.id,
        label: rule.label,
        weight: rule.weight,
        evidence: [m[0]],
      });
    }
  }

  // 分区信号
  const pw = PARTITION_WEIGHT[pkg.partition] ?? 4;
  signals.push({
    id: 'partition.preset',
    label: PARTITION_LABEL[pkg.partition] ?? '分区未知',
    weight: pw,
    evidence: [pkg.path || pkg.partition],
  });

  // 敏感权限信号
  if (pkg.permissions.length > 0) {
    signals.push({
      id: 'permission.sensitive',
      label: `声明 ${pkg.permissions.length} 类敏感权限`,
      weight: Math.min(PERMISSION_WEIGHT * 2, PERMISSION_WEIGHT + pkg.permissions.length * 2),
      evidence: pkg.permissions,
    });
  }

  // 交叉印证加成（synergy）：
  // 「特征词根」+「厂商命名空间」+「预装分区」三者同时成立时，
  // 说明这是一个由厂商预装、且职责明确指向遥测/广告/推广的组件，
  // 误判概率显著下降，因此给予额外置信加成。
  const hasCategory = signals.some((s) =>
    ['telemetry', 'advertising', 'bloat-feature', 'ota'].includes(s.id.split('.')[0]) ||
    s.id.startsWith('telemetry.') ||
    s.id.startsWith('ads.') ||
    s.id.startsWith('bloat.') ||
    s.id.startsWith('ota.')
  );
  const hasNamespace = signals.some((s) => s.id.startsWith('ns.'));
  if (hasCategory && hasNamespace && pkg.preinstalled) {
    signals.push({
      id: 'synergy.vendor-preinstall-bloat',
      label: '厂商预装 + 特征词根交叉印证（置信度提升）',
      weight: SYNERGY_WEIGHT,
      evidence: [`${pkg.partition}`, pkg.name],
    });
  }

  // 已禁用的包不再评估
  if (pkg.state === 'disabled' || pkg.state === 'uninstalled') {
    return [];
  }

  return signals;
}

/** 判定是否被强制保护 */
export function protectionFor(pkg: PackageInfo, opts: EvaluateOptions): { protected: boolean; reason: string | null } {
  if (opts.disableBuiltinProtection !== true) {
    for (const { pattern, reason } of PROTECTED_PATTERNS) {
      const re = compile(pattern);
      if (re && re.test(pkg.name)) return { protected: true, reason };
    }
  }
  const allow = new Set([...(opts.allowlist ?? []), ...DEFAULT_ALLOWLIST]);
  if (allow.has(pkg.name)) return { protected: true, reason: '用户白名单 / 默认保留名单' };
  return { protected: false, reason: null };
}

function gradeOf(net: number, opts: EvaluateOptions): RiskGrade {
  const safe = opts.safeThreshold ?? 70;
  const caution = opts.cautionThreshold ?? 45;
  if (net >= safe) return 'safe';
  if (net >= caution) return 'caution';
  if (net >= 20) return 'risky';
  return 'keep';
}

/**
 * 对整份快照做风险评估。
 */
export function evaluate(
  snapshot: { profile: { brand: string; isTv: boolean }; packages: PackageInfo[] },
  opts: EvaluateOptions = {}
): { verdicts: RiskVerdict[]; graph: DependencyGraph } {
  const rules: Rule[] = [...BUILTIN_RULES, ...(opts.extraRules ?? [])];
  const ctx = { brand: snapshot.profile.brand, isTv: snapshot.profile.isTv, rules };

  const graph = buildDependencyGraph(snapshot.packages);
  const alive = (name: string) => {
    const p = snapshot.packages.find((x) => x.name === name);
    return !!p && p.state !== 'disabled' && p.state !== 'uninstalled';
  };

  const denylist = new Set(opts.denylist ?? []);
  const verdicts: RiskVerdict[] = [];

  for (const pkg of snapshot.packages) {
    const signals = collectSignals(pkg, ctx);
    const rawScore = signals.reduce((acc, s) => acc + s.weight, 0);
    const score = Math.min(100, rawScore);

    const blast = opts.useBlastRadius === false
      ? { direct: [] as string[], transitive: [] as string[], penalty: 0 }
      : blastRadius(graph, pkg.name, { aliveFilter: alive });

    const { protected: isProtected, reason: protectedReason } = protectionFor(pkg, opts);

    let netScore = Math.max(0, Math.min(100, score - blast.penalty));
    let grade = gradeOf(netScore, opts);

    if (isProtected) {
      netScore = 0;
      grade = 'keep';
    } else if (denylist.has(pkg.name)) {
      // 用户显式要求清理：强制提升到 safe（仍在报告中保留真实分数与爆炸半径）
      netScore = Math.max(netScore, opts.safeThreshold ?? 70);
      grade = 'safe';
      signals.push({
        id: 'user.denylist',
        label: '用户强制清理名单',
        weight: 0,
        evidence: ['--deny'],
      });
    }

    let reason: string;
    if (isProtected) {
      reason = `受保护：${protectedReason}`;
    } else if (pkg.state === 'disabled') {
      reason = '已禁用，跳过';
    } else if (blast.penalty >= 24) {
      reason = `存在 ${blast.direct.length} 个直接依赖方（爆炸半径 ${blast.transitive.length}），禁用代价高`;
    } else if (grade === 'safe') {
      reason = `${signals.length} 条信号命中，无可观测依赖项，建议禁用`;
    } else if (grade === 'caution') {
      reason = `信号命中但证据中等，建议先观察`;
    } else {
      reason = '信号不足，保持启用';
    }

    verdicts.push({
      package: pkg,
      score,
      blastPenalty: blast.penalty,
      netScore,
      grade,
      protected: isProtected,
      protectedReason,
      signals,
      dependents: blast.direct,
      reason,
    });
  }

  // 稳定排序：先按 netScore 降序，再按包名升序，保证输出可复现
  verdicts.sort((a, b) => b.netScore - a.netScore || a.package.name.localeCompare(b.package.name));
  return { verdicts, graph };
}

export type { DependencyEdge };
