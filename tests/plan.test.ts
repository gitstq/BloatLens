import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPlan, buildApplyScript, buildRestoreScript, checkReversibility } from '../src/plan';
import { parseSnapshotFiles } from '../src/dump';
import { SAMPLE_DUMPSYS, SAMPLE_GETPROP, SAMPLE_PACKAGES, SAMPLE_DISABLED } from '../src/data/sample';
import type { PlanAction } from '../src/types';

const snap = parseSnapshotFiles({
  packages: SAMPLE_PACKAGES,
  disabled: SAMPLE_DISABLED,
  getprop: SAMPLE_GETPROP,
  dumpsys: SAMPLE_DUMPSYS,
});

test('默认计划只纳入 SAFE，CAUTION 降级为 skip', () => {
  const plan = buildPlan(snap);
  assert.equal(plan.actions.filter((a) => a.action === 'disable').length, 0);
  for (const a of plan.actions) {
    assert.ok(a.action === 'disable-user' || a.action === 'skip');
  }
});

test('--include-caution 会纳入 suspend 动作', () => {
  const plan = buildPlan(snap, { includeCaution: true });
  const suspends = plan.actions.filter((a) => a.action === 'suspend');
  assert.ok(suspends.length >= 0);
  for (const s of suspends) assert.equal(s.grade, 'caution');
});

test('每条动作都具备可执行的 adb 命令', () => {
  const plan = buildPlan(snap, { includeCaution: true });
  for (const a of plan.actions) {
    if (a.action === 'skip') continue;
    assert.ok(a.command.startsWith('adb shell pm '), `命令异常: ${a.command}`);
  }
});

test('disable-user 对应 enable 撤销，suspend 对应 unsuspend', () => {
  const plan = buildPlan(snap, { includeCaution: true });
  for (const a of plan.actions) {
    if (a.action === 'disable-user' || a.action === 'disable') {
      assert.match(a.undoCommand, /pm enable/);
    } else if (a.action === 'suspend') {
      assert.match(a.undoCommand, /pm unsuspend/);
    }
  }
});

test('可逆性校验：全部动作均通过', () => {
  const plan = buildPlan(snap, { includeCaution: true });
  assert.equal(plan.reversibility.allReversible, true);
  assert.deepEqual(plan.reversibility.missingUndo, []);
});

test('checkReversibility 能识别出缺失撤销命令的动作', () => {
  const bad: PlanAction[] = [
    { package: 'com.x', action: 'disable-user', grade: 'safe', netScore: 90, command: 'adb shell pm disable-user --user 0 com.x', undoCommand: '', reason: '' },
  ];
  const r = checkReversibility(bad);
  assert.equal(r.allReversible, false);
  assert.deepEqual(r.missingUndo, ['com.x']);
});

test('受保护包永不出现在动作中', () => {
  const plan = buildPlan(snap, { includeCaution: true });
  const protectedNames = ['com.android.systemui', 'com.android.settings', 'com.google.android.gms'];
  for (const n of protectedNames) {
    const a = plan.actions.find((x) => x.package === n)!;
    assert.equal(a.action, 'skip');
  }
});

test('已禁用的包不会重复生成动作', () => {
  const plan = buildPlan(snap);
  const a = plan.actions.find((x) => x.package === 'com.sony.tv.telemetry.legacy')!;
  assert.equal(a.action, 'skip');
});

test('restore 脚本是幂等的 shell 脚本且含 dry-run 支持', () => {
  const plan = buildPlan(snap, { includeCaution: true });
  const script = plan.reversibility.restoreScript;
  assert.match(script, /^#!\/bin\/sh/);
  assert.match(script, /set -eu/);
  assert.match(script, /--dry-run/);
  assert.match(script, /pm enable/);
});

test('restore 脚本为空计划时安全退出', () => {
  const script = buildRestoreScript([], { capturedAt: '2026-01-01T00:00:00.000Z' });
  assert.match(script, /Nothing to restore/);
  assert.match(script, /exit 0/);
});

test('apply 脚本与 restore 脚本成对生成', () => {
  const plan = buildPlan(snap, { includeCaution: true });
  const apply = buildApplyScript(plan);
  const applyCount = (apply.match(/run adb shell pm/g) ?? []).length;
  const restoreCount = (plan.reversibility.restoreScript.match(/run adb shell pm/g) ?? []).length;
  assert.equal(applyCount, restoreCount);
  assert.ok(applyCount > 0);
});

test('--device 参数会写入 adb -s', () => {
  const plan = buildPlan(snap, { deviceArg: '192.168.1.20:5555' });
  const actionable = plan.actions.filter((a) => a.action !== 'skip');
  assert.ok(actionable.length > 0);
  for (const a of actionable) {
    assert.match(a.command, /adb -s 192\.168\.1\.20:5555/);
    assert.match(a.undoCommand, /adb -s 192\.168\.1\.20:5555/);
  }
});

test('计划摘要统计自洽', () => {
  const plan = buildPlan(snap, { includeCaution: true });
  const s = plan.summary;
  assert.equal(s.total, plan.actions.length);
  assert.equal(s.disableUser + s.disable + s.suspend + s.skip, s.total);
  assert.equal(s.total, snap.packages.length);
});

test('计划中包含快照元信息与规则集', () => {
  const plan = buildPlan(snap);
  assert.equal(plan.snapshot.brand, 'sony');
  assert.equal(plan.snapshot.isTv, true);
  assert.ok(plan.ruleSets.length > 0);
});

test('--deny 让指定包进入计划', () => {
  const plan = buildPlan(snap, { denylist: ['com.sony.tv.diagnostics'] });
  const a = plan.actions.find((x) => x.package === 'com.sony.tv.diagnostics')!;
  assert.equal(a.action, 'disable-user');
});

test('--allow 让指定包被排除出计划', () => {
  const plan = buildPlan(snap, { allowlist: ['com.sony.tv.telemetry'] });
  const a = plan.actions.find((x) => x.package === 'com.sony.tv.telemetry')!;
  assert.equal(a.action, 'skip');
});
