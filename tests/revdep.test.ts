import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildDependencyGraph, blastRadius, dependenciesOf } from '../src/revdep';
import { parseSnapshotFiles } from '../src/dump';
import { SAMPLE_DUMPSYS, SAMPLE_GETPROP, SAMPLE_PACKAGES } from '../src/data/sample';
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

test('sharedUserId 相同的包互相建立双向依赖', () => {
  const g = buildDependencyGraph([
    pkg('com.a.one', { sharedUserId: 'com.shared' }),
    pkg('com.a.two', { sharedUserId: 'com.shared' }),
  ]);
  assert.ok((g.reverse.get('com.a.one') ?? []).includes('com.a.two'));
  assert.ok((g.reverse.get('com.a.two') ?? []).includes('com.a.one'));
});

test('uses-library 建立正向依赖', () => {
  const g = buildDependencyGraph([pkg('com.consumer', { usesLibraries: ['com.lib'] }), pkg('com.lib')]);
  assert.deepEqual(dependenciesOf(g, 'com.consumer'), ['com.lib']);
  assert.deepEqual(g.reverse.get('com.lib'), ['com.consumer']);
});

test('不存在的 library 不产生边', () => {
  const g = buildDependencyGraph([pkg('com.consumer', { usesLibraries: ['com.missing.lib'] })]);
  assert.equal(g.edges.length, 0);
});

test('自依赖被忽略', () => {
  const g = buildDependencyGraph([pkg('com.self', { usesLibraries: ['com.self'] })]);
  assert.equal(g.edges.length, 0);
});

test('内置 GMS 耦合表生效', () => {
  const g = buildDependencyGraph([
    pkg('com.google.android.gms'),
    pkg('com.google.android.youtube.tv'),
  ]);
  assert.ok((g.reverse.get('com.google.android.gms') ?? []).includes('com.google.android.youtube.tv'));
});

test('blastRadius 计算直接依赖与传递依赖', () => {
  const g = buildDependencyGraph([
    pkg('com.base'),
    pkg('com.mid', { usesLibraries: ['com.base'] }),
    pkg('com.top', { usesLibraries: ['com.mid'] }),
  ]);
  const b = blastRadius(g, 'com.base');
  assert.deepEqual(b.direct, ['com.mid']);
  assert.deepEqual(b.transitive, ['com.mid', 'com.top']);
  assert.ok(b.penalty > 0);
});

test('blastRadius 支持 aliveFilter 排除已禁用包', () => {
  const g = buildDependencyGraph([
    pkg('com.base'),
    pkg('com.mid', { usesLibraries: ['com.base'] }),
    pkg('com.dead', { usesLibraries: ['com.base'], state: 'disabled' }),
  ]);
  const alive = (n: string) => n !== 'com.dead';
  const b = blastRadius(g, 'com.base', { aliveFilter: alive });
  assert.deepEqual(b.direct, ['com.mid']);
  assert.ok(!b.transitive.includes('com.dead'));
});

test('无依赖的包爆炸半径为 0', () => {
  const g = buildDependencyGraph([pkg('com.lonely')]);
  const b = blastRadius(g, 'com.lonely');
  assert.equal(b.direct.length, 0);
  assert.equal(b.transitive.length, 0);
  assert.equal(b.penalty, 0);
});

test('maxDepth 限制传递层数', () => {
  const g = buildDependencyGraph([
    pkg('com.l0'),
    pkg('com.l1', { usesLibraries: ['com.l0'] }),
    pkg('com.l2', { usesLibraries: ['com.l1'] }),
    pkg('com.l3', { usesLibraries: ['com.l2'] }),
  ]);
  const shallow = blastRadius(g, 'com.l0', { maxDepth: 2 });
  assert.ok(!shallow.transitive.includes('com.l3'));
  const deep = blastRadius(g, 'com.l0', { maxDepth: 5 });
  assert.ok(deep.transitive.includes('com.l3'));
});

test('示例快照中桌面依赖 GMS，形成真实爆炸半径', () => {
  const snap = parseSnapshotFiles({ packages: SAMPLE_PACKAGES, getprop: SAMPLE_GETPROP, dumpsys: SAMPLE_DUMPSYS });
  const g = buildDependencyGraph(snap.packages);
  const b = blastRadius(g, 'com.google.android.gms');
  assert.ok(b.penalty >= 12, `期望 GMS 存在依赖惩罚，实际 ${b.penalty}`);
});
