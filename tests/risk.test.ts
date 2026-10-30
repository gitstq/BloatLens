import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, collectSignals, protectionFor } from '../src/risk';
import { parseSnapshotFiles } from '../src/dump';
import { BUILTIN_RULES } from '../src/data/rules';
import { SAMPLE_DUMPSYS, SAMPLE_GETPROP, SAMPLE_PACKAGES, SAMPLE_DISABLED } from '../src/data/sample';
import type { PackageInfo } from '../src/types';

function pkg(name: string, extra: Partial<PackageInfo> = {}): PackageInfo {
  return {
    name,
    path: '',
    partition: 'system-app',
    state: 'enabled',
    systemSigned: false,
    preinstalled: true,
    permissions: [],
    usesLibraries: [],
    sharedUserId: null,
    autostart: false,
    ...extra,
  };
}

const snap = parseSnapshotFiles({
  packages: SAMPLE_PACKAGES,
  disabled: SAMPLE_DISABLED,
  getprop: SAMPLE_GETPROP,
  dumpsys: SAMPLE_DUMPSYS,
});

function verdictOf(name: string) {
  const { verdicts } = evaluate(snap);
  const v = verdicts.find((x) => x.package.name === name);
  assert.ok(v, `未找到 ${name} 的评估结论`);
  return v;
}

test('遥测包命中 telemetry 信号且评分显著', () => {
  const v = verdictOf('com.sony.tv.telemetry');
  assert.ok(v.signals.some((s) => s.id === 'telemetry.core'));
  assert.ok(v.score >= 30, `期望原始分 >= 30，实际 ${v.score}`);
});

test('广告包命中 advertising 信号', () => {
  const v = verdictOf('com.sony.tv.adservice');
  assert.ok(v.signals.some((s) => s.id.startsWith('ads.')), '未命中广告类信号');
});

test('追踪 / 归因包分别命中对应信号', () => {
  assert.ok(verdictOf('com.sony.tv.tracking').signals.some((s) => s.id === 'telemetry.tracking'));
  assert.ok(verdictOf('com.sony.tv.attribution').signals.some((s) => s.id === 'ads.attribution'));
});

test('系统关键组件被强制保护且 net 归零', () => {
  for (const name of ['com.android.systemui', 'com.android.settings', 'com.google.android.gms', 'android']) {
    const v = verdictOf(name);
    assert.equal(v.protected, true, `${name} 应受保护`);
    assert.equal(v.netScore, 0);
    assert.equal(v.grade, 'keep');
    assert.ok(v.protectedReason && v.protectedReason.length > 0);
  }
});

test('launcher 类包名被保护（防桌面失效）', () => {
  const v = verdictOf('com.google.android.tungsten.home');
  assert.equal(v.protected, true);
});

test('已禁用包不产生信号，保持 keep', () => {
  const v = verdictOf('com.sony.tv.telemetry.legacy');
  assert.equal(v.signals.length, 0);
  assert.equal(v.grade, 'keep');
});

test('用户安装的应用不会被建议禁用', () => {
  const v = verdictOf('com.netflix.ninja');
  assert.notEqual(v.grade, 'safe');
  assert.ok(v.netScore < 70, `net=${v.netScore} 过高`);
  assert.equal(v.protected, true, '常见用户主动安装的应用应位于默认保留名单');
});

test('默认白名单生效', () => {
  const { protected: p } = protectionFor(pkg('com.google.android.youtube'), {});
  assert.equal(p, true);
});

test('--allow 追加白名单生效', () => {
  const { protected: p } = protectionFor(pkg('com.sony.tv.telemetry'), { allowlist: ['com.sony.tv.telemetry'] });
  assert.equal(p, true);
});

test('--deny 强制提升到 safe', () => {
  const { verdicts } = evaluate(snap, { denylist: ['com.sony.tv.diagnostics'] });
  const v = verdicts.find((x) => x.package.name === 'com.sony.tv.diagnostics')!;
  assert.equal(v.grade, 'safe');
  assert.ok(v.signals.some((s) => s.id === 'user.denylist'));
});

test('爆炸半径会拉低 netScore', () => {
  const withBlast = evaluate(snap, { useBlastRadius: true });
  const without = evaluate(snap, { useBlastRadius: false });
  const a = withBlast.verdicts.find((v) => v.package.name === 'com.sony.tv.contentrow')!;
  const b = without.verdicts.find((v) => v.package.name === 'com.sony.tv.contentrow')!;
  assert.ok(a.blastPenalty > 0, 'sharedUserId 耦合应产生爆炸惩罚');
  assert.ok(a.netScore < b.netScore, `期望 net(${a.netScore}) < net(${b.netScore})`);
});

test('共享 uid 的包双方都获得爆炸惩罚', () => {
  const { verdicts } = evaluate(snap);
  const a = verdicts.find((v) => v.package.name === 'com.sony.tv.contentrow')!;
  const b = verdicts.find((v) => v.package.name === 'com.sony.tv.partner.app')!;
  assert.ok(a.blastPenalty > 0 && b.blastPenalty > 0);
  assert.ok(a.dependents.includes('com.sony.tv.partner.app'));
});

test('阈值可配置：提高 safeThreshold 会减少 safe 数量', () => {
  const low = evaluate(snap, { safeThreshold: 40 });
  const high = evaluate(snap, { safeThreshold: 95 });
  const count = (vs: typeof low.verdicts) => vs.filter((v) => v.grade === 'safe').length;
  assert.ok(count(low.verdicts) >= count(high.verdicts));
});

test('分区信号：预装包得分高于用户后装包', () => {
  const sys = collectSignals(pkg('com.x.foo', { partition: 'system-priv-app' }), { brand: 'unknown', isTv: true, rules: BUILTIN_RULES });
  const usr = collectSignals(pkg('com.x.foo', { partition: 'data-app' }), { brand: 'unknown', isTv: true, rules: BUILTIN_RULES });
  const sysW = sys.filter((s) => s.id === 'partition.preset').reduce((a, s) => a + s.weight, 0);
  const usrW = usr.filter((s) => s.id === 'partition.preset').reduce((a, s) => a + s.weight, 0);
  assert.ok(sysW > usrW, `期望系统分区权重(${sysW}) > 用户分区权重(${usrW})`);
});

test('敏感权限与自启产生信号', () => {
  const signals = collectSignals(
    pkg('com.x.foo', { permissions: ['location', 'phone'], autostart: true }),
    { brand: 'unknown', isTv: false, rules: BUILTIN_RULES }
  );
  assert.ok(signals.some((s) => s.id === 'permission.sensitive'));
  assert.ok(signals.some((s) => s.id === 'autostart.boot'));
});

test('品牌限定规则只在对应品牌生效', () => {
  const sony = collectSignals(pkg('com.sony.tv.foo'), { brand: 'sony', isTv: true, rules: BUILTIN_RULES });
  const other = collectSignals(pkg('com.sony.tv.foo'), { brand: 'tcl', isTv: true, rules: BUILTIN_RULES });
  assert.ok(sony.some((s) => s.id === 'ns.sony'));
  assert.ok(!other.some((s) => s.id === 'ns.sony'));
});

test('评估结果是稳定可复现的', () => {
  const a = evaluate(snap).verdicts.map((v) => `${v.package.name}:${v.netScore}:${v.grade}`);
  const b = evaluate(snap).verdicts.map((v) => `${v.package.name}:${v.netScore}:${v.grade}`);
  assert.deepEqual(a, b);
});

test('所有 verdict 都携带可解释理由', () => {
  const { verdicts } = evaluate(snap);
  for (const v of verdicts) {
    assert.ok(v.reason.length > 0, `${v.package.name} 缺少理由`);
    assert.ok(v.netScore >= 0 && v.netScore <= 100);
  }
});

test('排序：net 降序，同分按包名升序', () => {
  const { verdicts } = evaluate(snap);
  for (let i = 1; i < verdicts.length; i++) {
    const prev = verdicts[i - 1];
    const cur = verdicts[i];
    assert.ok(
      prev.netScore > cur.netScore ||
        (prev.netScore === cur.netScore && prev.package.name.localeCompare(cur.package.name) <= 0)
    );
  }
});
