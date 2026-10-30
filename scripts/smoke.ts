/**
 * 端到端冒烟测试
 *
 * 覆盖从「原始 adb 文本 → 快照 → 风险评估 → 清理计划 → 四种报告 → 撤销脚本」
 * 的完整链路，并额外校验仓库中不存在任何凭据残留。
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import {
  parseSnapshotFiles,
  evaluate,
  buildPlan,
  buildApplyScript,
  render,
  blastRadius,
  VERSION,
} from '../src/index';
import { SAMPLE_DISABLED, SAMPLE_DUMPSYS, SAMPLE_GETPROP, SAMPLE_PACKAGES } from '../src/data/sample';

let passed = 0;
let failed = 0;

function check(name: string, fn: () => boolean | void): void {
  try {
    const r = fn();
    if (r === false) throw new Error('返回 false');
    console.log(`  ✅ ${name}`);
    passed++;
  } catch (err) {
    console.log(`  ❌ ${name} — ${err instanceof Error ? err.message : String(err)}`);
    failed++;
  }
}

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

console.log(`🔍 BloatLens v${VERSION} 端到端冒烟测试\n`);
console.log('[1] 快照解析');
const snap = parseSnapshotFiles({
  packages: SAMPLE_PACKAGES,
  disabled: SAMPLE_DISABLED,
  getprop: SAMPLE_GETPROP,
  dumpsys: SAMPLE_DUMPSYS,
});

check('设备画像识别为 Sony Android TV', () => snap.profile.brand === 'sony' && snap.profile.isTv === true);
check('解析出 25 个包', () => assert(snap.packages.length === 25, `实际 ${snap.packages.length}`));
check('已禁用包状态正确', () => {
  const p = snap.packages.find((x) => x.name === 'com.sony.tv.telemetry.legacy');
  assert(p?.state === 'disabled', '状态错误');
});

console.log('\n[2] 风险评估');
const { verdicts, graph } = evaluate(snap);

check('遥测包被识别且 net 分较高', () => {
  const v = verdicts.find((x) => x.package.name === 'com.sony.tv.telemetry');
  assert(v !== undefined && v.netScore >= 30, `net=${v?.netScore}`);
});
check('系统组件被强制保护', () => {
  for (const n of ['com.android.systemui', 'com.android.settings', 'com.google.android.gms']) {
    const v = verdicts.find((x) => x.package.name === n);
    assert(v?.protected === true, `${n} 未受保护`);
  }
});
check('共享 uid 产生爆炸半径惩罚', () => {
  const v = verdicts.find((x) => x.package.name === 'com.sony.tv.contentrow');
  assert(v !== undefined && v.blastPenalty > 0, 'blaskPenalty 为 0');
});
check('GMS 爆炸半径可查询', () => {
  const b = blastRadius(graph, 'com.google.android.gms');
  assert(b.penalty > 0, 'GMS 无依赖惩罚');
});
check('每个结论都带理由', () => {
  for (const v of verdicts) assert(v.reason.length > 0, `${v.package.name} 无理由`);
});

console.log('\n[3] 清理计划');
const plan = buildPlan(snap, { includeCaution: true });

check('生成计划且包含动作', () => assert(plan.actions.length === snap.packages.length, '动作数不匹配'));
check('可逆性校验全部通过', () => assert(plan.reversibility.allReversible === true, '存在缺失撤销项'));
check('restore 脚本可执行且含 dry-run', () => {
  const s = plan.reversibility.restoreScript;
  assert(s.startsWith('#!/bin/sh'), '缺少 shebang');
  assert(s.includes('--dry-run'), '缺少 dry-run');
});
check('apply 脚本与 restore 命令数一致', () => {
  const apply = buildApplyScript(plan);
  const a = (apply.match(/run adb shell pm/g) ?? []).length;
  const b = (plan.reversibility.restoreScript.match(/run adb shell pm/g) ?? []).length;
  assert(a === b && a > 0, `apply=${a} restore=${b}`);
});

console.log('\n[4] 报告生成');
for (const fmt of ['terminal', 'json', 'markdown', 'html'] as const) {
  check(`${fmt} 报告生成成功且非空`, () => {
    const out = render(fmt, plan, verdicts, { color: false });
    assert(out.length > 100, '输出过短');
    if (fmt === 'json') JSON.parse(out);
  });
}

console.log('\n[5] 安全检查');
check('源码与示例中无凭据残留', () => {
  const patterns = [/(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}/, /github_pat_[A-Za-z0-9_]{20,}/, /-----BEGIN [A-Z ]*PRIVATE KEY-----/];
  const roots = ['src', 'tests', 'scripts', 'examples', 'README.md', 'README.en.md', 'README.zh-TW.md', 'CONTRIBUTING.md', 'package.json'];
  const walk = (dir: string): string[] => {
    if (!existsSync(dir)) return [];
    return readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? walk(p) : [p];
    });
  };
  const files = roots.flatMap((r) => (statSync(r, { throwIfNoEntry: false })?.isDirectory() ? walk(r) : existsSync(r) ? [r] : []));
  for (const f of files) {
    if (!/\.(ts|js|json|md|txt|sh|yml|yaml)$/i.test(f)) continue;
    const content = readFileSync(f, 'utf8');
    for (const re of patterns) {
      assert(!re.test(content), `文件 ${f} 命中凭据模式 ${re}`);
    }
  }
});
check('编译产物存在（dist）', () => {
  assert(existsSync('dist/index.js'), 'dist/index.js 不存在，请先 npm run build');
});

console.log('\n[6] CLI 可执行性');
check('bloatlens demo 正常退出', () => {
  const out = execFileSync(process.execPath, ['dist/cli.js', 'demo', '--no-color'], { encoding: 'utf8' });
  assert(out.includes('BloatLens'), '输出缺少标识');
  assert(out.includes('清理计划'), '输出缺少计划');
});
check('bloatlens explain 输出可解释信息', () => {
  const out = execFileSync(process.execPath, ['dist/cli.js', 'explain', 'com.sony.tv.telemetry'], { encoding: 'utf8' });
  assert(out.includes('命中信号'), '缺少信号明细');
});
check('bloatlens depends 输出爆炸半径', () => {
  const out = execFileSync(process.execPath, ['dist/cli.js', 'depends', 'com.google.android.gms'], { encoding: 'utf8' });
  assert(out.includes('爆炸半径'), '缺少爆炸半径');
});
check('bloatlens rules 列出规则库', () => {
  const out = execFileSync(process.execPath, ['dist/cli.js', 'rules'], { encoding: 'utf8' });
  assert(out.includes('内置规则'), '缺少规则列表');
});
check('bloatlens version 输出版本号', () => {
  const out = execFileSync(process.execPath, ['dist/cli.js', 'version'], { encoding: 'utf8' });
  assert(out.trim() === `BloatLens v${VERSION}`, `实际: ${out.trim()}`);
});

console.log(`\n${'─'.repeat(50)}`);
console.log(`冒烟测试：${passed} 通过 / ${failed} 失败`);
if (failed > 0) {
  process.exitCode = 1;
}
