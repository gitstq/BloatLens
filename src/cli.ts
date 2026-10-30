#!/usr/bin/env node
/**
 * BloatLens CLI
 *
 * 设计原则：
 *  - 默认**只读**：不传 --apply 绝不改动设备；
 *  - 默认**可撤销**：任何计划都伴随 restore 脚本；
 *  - 默认**可离线**：不依赖网络，规则全部内置；
 *  - 退出码语义化，可直接作为 CI 门禁使用。
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildApplyScript,
  buildPlan,
  evaluate,
  parseSnapshotFiles,
  render,
  dependenciesOf,
  blastRadius,
  BUILTIN_RULES,
  VERSION,
  type DeviceSnapshot,
  type EvaluateOptions,
  type ReportFormat,
  type Rule,
} from './index';
import { AdbClient, isAdbAvailable } from './adb';
import { SAMPLE_DISABLED, SAMPLE_DUMPSYS, SAMPLE_GETPROP, SAMPLE_PACKAGES } from './data/sample';

const HELP = `🔍 BloatLens v${VERSION} — 零依赖·离线优先的 Android / Android TV 臃肿软件审计与可逆清理编排引擎

用法:
  bloatlens <command> [options]

命令:
  demo                     使用内置合成样本一键体验（无需设备、无需联网）
  scan                     通过 adb 扫描真实设备并生成审计报告
  audit                    从本地快照文件离线审计（无需设备）
  plan                     生成清理计划与 restore 脚本
  explain <package>        解释某个包的评分依据（可解释性输出）
  depends <package>        查看某个包的依赖与爆炸半径
  rules                    列出内置规则库
  version                  输出版本号
  help                     显示本帮助

通用选项:
  --format <fmt>           报告格式: terminal | json | markdown | html   (默认 terminal)
  --out <file>             报告写入文件（默认 stdout）
  --device <serial>        指定 adb 设备序列号
  --getprop <file>         getprop 快照文件
  --packages <file>        pm list packages -f 快照文件
  --disabled <file>        pm list packages -d 快照文件
  --dumpsys <file>         dumpsys package 快照文件（启用依赖图）
  --with-dumpsys           scan 时一并抓取 dumpsys（较慢但依赖图更完整）
  --rules <file>           额外规则文件（JSON 数组）
  --allow <pkg>[,<pkg>]    追加白名单（永不建议禁用）
  --deny <pkg>[,<pkg>]     追加强制清理名单
  --include-caution        计划中纳入 CAUTION 级别（默认仅 SAFE）
  --safe-threshold <n>     SAFE 阈值，默认 70
  --caution-threshold <n>  CAUTION 阈值，默认 45
  --no-blast-radius        关闭反向依赖爆炸半径惩罚（不推荐）
  --fail-on <grade>        CI 门禁：出现该级别及以上时返回非零退出码 (safe|caution|risky)
  --limit <n>              终端报告展示条数，默认 20
  --no-color               关闭 ANSI 颜色

审计示例:
  adb shell pm list packages -f > packages.txt
  adb shell getprop > getprop.txt
  bloatlens audit --packages packages.txt --getprop getprop.txt --format html --out report.html

扫描示例:
  bloatlens scan --with-dumpsys --format markdown --out report.md

计划示例:
  bloatlens plan --packages packages.txt --getprop getprop.txt --out plan.json
`;

interface Flags {
  _: string[];
  [k: string]: string | boolean | string[] | undefined;
}

function parseArgs(argv: string[]): Flags {
  const flags: Flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const next = argv[i + 1];
      if (next !== undefined && !next.startsWith('--')) {
        flags[key] = next;
        i++;
      } else {
        flags[key] = true;
      }
    } else {
      flags._.push(a);
    }
  }
  return flags;
}

function str(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return typeof v === 'string' ? v : undefined;
}
function bool(flags: Flags, key: string): boolean {
  return flags[key] === true || flags[key] === 'true';
}
function num(flags: Flags, key: string, dflt: number): number {
  const v = str(flags, key);
  if (v === undefined) return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}
function list(flags: Flags, key: string): string[] {
  const v = str(flags, key);
  if (!v) return [];
  return v.split(',').map((s) => s.trim()).filter(Boolean);
}

function readMaybe(path?: string): string {
  if (!path) return '';
  const p = resolve(path);
  if (!existsSync(p)) throw new Error(`文件不存在: ${p}`);
  return readFileSync(p, 'utf8');
}

function loadExtraRules(path?: string): Rule[] {
  if (!path) return [];
  const raw = readMaybe(path);
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error('规则文件必须是 JSON 数组');
  return parsed as Rule[];
}

function optsFrom(flags: Flags): EvaluateOptions {
  return {
    safeThreshold: num(flags, 'safe-threshold', 70),
    cautionThreshold: num(flags, 'caution-threshold', 45),
    useBlastRadius: !bool(flags, 'no-blast-radius'),
    allowlist: list(flags, 'allow'),
    denylist: list(flags, 'deny'),
    extraRules: loadExtraRules(str(flags, 'rules')),
  };
}

function buildSnapshotFromFlags(flags: Flags): DeviceSnapshot {
  return parseSnapshotFiles({
    packages: readMaybe(str(flags, 'packages')),
    disabled: readMaybe(str(flags, 'disabled')),
    getprop: readMaybe(str(flags, 'getprop')),
    dumpsys: readMaybe(str(flags, 'dumpsys')),
    source: 'file',
  });
}

function sampleSnapshot(): DeviceSnapshot {
  return parseSnapshotFiles({
    packages: SAMPLE_PACKAGES,
    disabled: SAMPLE_DISABLED,
    getprop: SAMPLE_GETPROP,
    dumpsys: SAMPLE_DUMPSYS,
    source: 'builtin-sample',
  });
}

function formatOf(flags: Flags): ReportFormat {
  const f = (str(flags, 'format') || 'terminal').toLowerCase();
  if (f === 'json' || f === 'markdown' || f === 'html' || f === 'terminal') return f;
  return 'terminal';
}

function renderOpts(flags: Flags): { color?: boolean; limit?: number } {
  return { color: !bool(flags, 'no-color'), limit: num(flags, 'limit', 20) };
}

function emit(content: string, out?: string): void {
  if (out) {
    const p = resolve(out);
    writeFileSync(p, content, 'utf8');
    process.stdout.write(`✅ 已写入 ${p}\n`);
    return;
  }
  process.stdout.write(content.endsWith('\n') ? content : content + '\n');
}

/** CI 门禁判定 */
function gateExitCode(grade: string | undefined, verdicts: { grade: string }[]): number {
  if (!grade) return 0;
  const order = ['keep', 'risky', 'caution', 'safe'];
  const idx = order.indexOf(grade);
  if (idx < 0) return 0;
  const hit = verdicts.some((v) => order.indexOf(v.grade) >= idx && v.grade !== 'keep');
  return hit ? 3 : 0;
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const flags = parseArgs(argv);
  const cmd = (flags._[0] || 'help').toLowerCase();

  if (bool(flags, 'help') || cmd === 'help' || argv.length === 0) {
    process.stdout.write(HELP);
    return 0;
  }
  if (cmd === 'version' || bool(flags, 'version')) {
    process.stdout.write(`BloatLens v${VERSION}\n`);
    return 0;
  }

  if (cmd === 'rules') {
    const rows = BUILTIN_RULES.map((r) => `${r.id.padEnd(26)} ${r.category.padEnd(18)} w=${String(r.weight).padStart(3)}  ${r.label}`);
    process.stdout.write(`内置规则共 ${BUILTIN_RULES.length} 条：\n\n` + rows.join('\n') + '\n');
    return 0;
  }

  if (cmd === 'demo') {
    const snap = sampleSnapshot();
    const opts = optsFrom(flags);
    const { verdicts } = evaluate(snap, opts);
    const plan = buildPlan(snap, { ...opts, includeCaution: bool(flags, 'include-caution') });
    const fmt = formatOf(flags);
    if (fmt === 'terminal') {
      const head = [
        `🔍 BloatLens v${VERSION} — 内置样本演示（合成数据，非真实设备）`,
        `   设备画像: ${snap.profile.brand} / ${snap.profile.model} ${snap.profile.isTv ? '(Android TV)' : ''}  SDK=${snap.profile.androidApi ?? '?'}`,
        `   画像证据: ${snap.profile.evidence.join('; ') || '—'}`,
        `   包数量: ${snap.packages.length}`,
        '',
      ].join('\n');
      emit(head + render(fmt, plan, verdicts, renderOpts(flags)), str(flags, 'out'));
    } else {
      emit(render(fmt, plan, verdicts, renderOpts(flags)), str(flags, 'out'));
    }
    process.stdout.write(
      `\n💡 restore 脚本预览（前 12 行）:\n` +
        plan.reversibility.restoreScript.split('\n').slice(0, 12).join('\n') +
        '\n'
    );
    return 0;
  }

  if (cmd === 'scan') {
    const available = await isAdbAvailable();
    if (!available) {
      process.stderr.write(
        '❌ 未检测到可用的 adb。请先安装 Android platform-tools 并确保 adb 在 PATH 中，\n' +
          '   或改用离线模式：adb shell pm list packages -f > packages.txt && bloatlens audit --packages packages.txt\n'
      );
      return 1;
    }
    const client = new AdbClient({ device: str(flags, 'device') });
    const raw = await client.collectRaw({ withDumpsys: bool(flags, 'with-dumpsys') });
    const snap = parseSnapshotFiles({ ...raw, source: 'adb' });
    const opts = optsFrom(flags);
    const { verdicts } = evaluate(snap, opts);
    const plan = buildPlan(snap, { ...opts, includeCaution: bool(flags, 'include-caution'), deviceArg: str(flags, 'device') });
    emit(render(formatOf(flags), plan, verdicts, renderOpts(flags)), str(flags, 'out'));
    return gateExitCode(str(flags, 'fail-on'), verdicts);
  }

  if (cmd === 'audit') {
    if (!str(flags, 'packages')) {
      process.stderr.write('❌ audit 需要 --packages <file>（adb shell pm list packages -f 的输出）\n');
      return 1;
    }
    const snap = buildSnapshotFromFlags(flags);
    const opts = optsFrom(flags);
    const { verdicts } = evaluate(snap, opts);
    const plan = buildPlan(snap, { ...opts, includeCaution: bool(flags, 'include-caution'), deviceArg: str(flags, 'device') });
    emit(render(formatOf(flags), plan, verdicts, renderOpts(flags)), str(flags, 'out'));
    if (!plan.reversibility.allReversible) {
      process.stderr.write(`⚠️  存在缺失撤销命令的动作: ${plan.reversibility.missingUndo.join(', ')}\n`);
      return 2;
    }
    return gateExitCode(str(flags, 'fail-on'), verdicts);
  }

  if (cmd === 'plan') {
    if (!str(flags, 'packages')) {
      process.stderr.write('❌ plan 需要 --packages <file>\n');
      return 1;
    }
    const snap = buildSnapshotFromFlags(flags);
    const opts = optsFrom(flags);
    const plan = buildPlan(snap, { ...opts, includeCaution: bool(flags, 'include-caution'), deviceArg: str(flags, 'device') });
    const out = str(flags, 'out');
    const payload = JSON.stringify(
      {
        plan,
        applyScript: buildApplyScript(plan, { device: str(flags, 'device') }),
      },
      null,
      2
    );
    if (out) {
      emit(payload, out);
      const base = out.replace(/\.json$/i, '');
      writeFileSync(base + '.restore.sh', plan.reversibility.restoreScript, 'utf8');
      writeFileSync(base + '.apply.sh', buildApplyScript(plan, { device: str(flags, 'device') }), 'utf8');
      process.stdout.write(`✅ 已写入 ${base}.restore.sh 与 ${base}.apply.sh\n`);
    } else {
      process.stdout.write(payload + '\n');
    }
    if (!plan.reversibility.allReversible) {
      process.stderr.write(`⚠️  存在缺失撤销命令的动作: ${plan.reversibility.missingUndo.join(', ')}\n`);
      return 2;
    }
    return 0;
  }

  if (cmd === 'explain') {
    const pkg = flags._[1];
    if (!pkg) {
      process.stderr.write('❌ explain 需要包名参数\n');
      return 1;
    }
    const hasFile = !!str(flags, 'packages');
    const snap = hasFile ? buildSnapshotFromFlags(flags) : sampleSnapshot();
    const opts = optsFrom(flags);
    const { verdicts, graph } = evaluate(snap, opts);
    const v = verdicts.find((x) => x.package.name === pkg);
    if (!v) {
      process.stderr.write(`❌ 快照中未找到包: ${pkg}\n`);
      return 1;
    }
    const lines: string[] = [];
    lines.push(`📦 ${v.package.name}`);
    lines.push(`   路径:      ${v.package.path || '(未知)'}`);
    lines.push(`   分区:      ${v.package.partition}`);
    lines.push(`   状态:      ${v.package.state}`);
    lines.push(`   预装:      ${v.package.preinstalled ? '是' : '否'}`);
    lines.push(`   自启:      ${v.package.autostart ? '是' : '否'}`);
    lines.push(`   敏感权限:  ${v.package.permissions.join(', ') || '无'}`);
    lines.push(`   sharedUid: ${v.package.sharedUserId ?? '无'}`);
    lines.push('');
    lines.push(`   原始分:    ${v.score}`);
    lines.push(`   爆炸惩罚:  -${v.blastPenalty}`);
    lines.push(`   最终 net:  ${v.netScore}  (${v.grade.toUpperCase()})`);
    lines.push(`   受保护:    ${v.protected ? `是 — ${v.protectedReason}` : '否'}`);
    lines.push('');
    lines.push('   命中信号:');
    if (v.signals.length === 0) lines.push('     （无）');
    for (const s of v.signals) {
      lines.push(`     • [${s.id}] ${s.label}  (+${s.weight})  证据: ${s.evidence.join(' / ')}`);
    }
    lines.push('');
    lines.push(`   直接依赖方: ${v.dependents.length ? v.dependents.join(', ') : '无'}`);
    lines.push(`   自身依赖:   ${dependenciesOf(graph, pkg).join(', ') || '无'}`);
    lines.push('');
    lines.push(`   结论: ${v.reason}`);
    emit(lines.join('\n'), str(flags, 'out'));
    return 0;
  }

  if (cmd === 'depends') {
    const pkg = flags._[1];
    if (!pkg) {
      process.stderr.write('❌ depends 需要包名参数\n');
      return 1;
    }
    const hasFile = !!str(flags, 'packages');
    const snap = hasFile ? buildSnapshotFromFlags(flags) : sampleSnapshot();
    const { graph } = evaluate(snap, optsFrom(flags));
    const alive = (n: string) => {
      const p = snap.packages.find((x) => x.name === n);
      return !!p && p.state !== 'disabled' && p.state !== 'uninstalled';
    };
    const b = blastRadius(graph, pkg, { aliveFilter: alive });
    const deps = dependenciesOf(graph, pkg);
    const lines = [
      `🔗 ${pkg}`,
      `   依赖（它需要的）: ${deps.length ? deps.join(', ') : '无'}`,
      `   直接依赖方（需要它的）: ${b.direct.length ? b.direct.join(', ') : '无'}`,
      `   传递影响范围: ${b.transitive.length} 个包`,
      `   爆炸半径惩罚: ${b.penalty}`,
      b.penalty >= 24 ? '   ⚠️  禁用此包影响面较大，建议保持启用。' : '   ✅ 影响面可控。',
    ];
    emit(lines.join('\n'), str(flags, 'out'));
    return 0;
  }

  process.stderr.write(`❌ 未知命令: ${cmd}\n\n`);
  process.stdout.write(HELP);
  return 1;
}

main()
  .then((code) => {
    process.exitCode = code;
  })
  .catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    process.stderr.write(`❌ ${msg}\n`);
    process.exitCode = 1;
  });
