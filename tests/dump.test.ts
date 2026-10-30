import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parsePackageList,
  parseProfile,
  parseSnapshotFiles,
  enrichFromDumpsys,
  inferPartition,
  isPreinstalled,
  mergeStates,
} from '../src/dump';
import { SAMPLE_DISABLED, SAMPLE_DUMPSYS, SAMPLE_GETPROP, SAMPLE_PACKAGES } from '../src/data/sample';

test('inferPartition 正确识别各分区', () => {
  assert.equal(inferPartition('/system/priv-app/A/A.apk'), 'system-priv-app');
  assert.equal(inferPartition('/system/app/B/B.apk'), 'system-app');
  assert.equal(inferPartition('/system/framework/framework-res.apk'), 'system-framework');
  assert.equal(inferPartition('/vendor/app/C/C.apk'), 'vendor-app');
  assert.equal(inferPartition('/product/app/D/D.apk'), 'product-app');
  assert.equal(inferPartition('/system_ext/app/E/E.apk'), 'system-ext-app');
  assert.equal(inferPartition('/oem/app/F/F.apk'), 'oem-app');
  assert.equal(inferPartition('/data/app/com.x-1/base.apk'), 'data-app');
  assert.equal(inferPartition(''), 'unknown');
});

test('isPreinstalled 仅 data-app 与 unknown 视为非预装', () => {
  assert.equal(isPreinstalled('system-priv-app'), true);
  assert.equal(isPreinstalled('system-app'), true);
  assert.equal(isPreinstalled('data-app'), false);
  assert.equal(isPreinstalled('unknown'), false);
});

test('parsePackageList 解析 pm list packages -f 标准输出', () => {
  const raw = [
    'package:/system/priv-app/TelemetrySvc/TelemetrySvc.apk=com.sony.tv.telemetry',
    'package:/data/app/com.netflix.ninja-1/base.apk=com.netflix.ninja',
    'package:/system/app/GmsCore/GmsCore.apk=com.google.android.gms',
    '',
    'garbage line without equals',
  ].join('\n');
  const pkgs = parsePackageList(raw);
  assert.equal(pkgs.length, 3);
  assert.equal(pkgs[0].name, 'com.sony.tv.telemetry');
  assert.equal(pkgs[0].path, '/system/priv-app/TelemetrySvc/TelemetrySvc.apk');
  assert.equal(pkgs[0].partition, 'system-priv-app');
  assert.equal(pkgs[0].preinstalled, true);
  assert.equal(pkgs[1].partition, 'data-app');
  assert.equal(pkgs[1].preinstalled, false);
});

test('parsePackageList 去重且保持稳定性', () => {
  const raw = 'package:/system/app/A/A.apk=com.a\npackage:/system/app/A/A.apk=com.a\n';
  const pkgs = parsePackageList(raw);
  assert.equal(pkgs.length, 1);
});

test('parsePackageList 支持无 -f 的纯包名列表', () => {
  const pkgs = parsePackageList('com.a.b\ncom.c.d\n');
  assert.equal(pkgs.length, 2);
  assert.equal(pkgs[0].partition, 'unknown');
});

test('mergeStates 正确标记已禁用包', () => {
  const pkgs = parsePackageList('package:/system/app/A/A.apk=com.a\npackage:/system/app/B/B.apk=com.b\n');
  mergeStates(pkgs, ['com.b']);
  assert.equal(pkgs[0].state, 'enabled');
  assert.equal(pkgs[1].state, 'disabled');
});

test('parseProfile 推断 Sony Android TV 画像', () => {
  const p = parseProfile(SAMPLE_GETPROP);
  assert.equal(p.brand, 'sony');
  assert.equal(p.model, 'BRAVIA 4K GB');
  assert.equal(p.isTv, true);
  assert.equal(p.formFactor, 'tv');
  assert.equal(p.androidApi, 33);
  assert.ok(p.evidence.length > 0);
});

test('parseProfile 品牌别名归一化', () => {
  assert.equal(parseProfile('[ro.product.brand]: [Xiaomi]\n').brand, 'xiaomi');
  assert.equal(parseProfile('[ro.product.brand]: [TCL]\n').brand, 'tcl');
  assert.equal(parseProfile('[ro.product.brand]: [Hisense]\n').brand, 'hisense');
  assert.equal(parseProfile('[ro.product.brand]: [Amazon]\n').brand, 'amazon');
  assert.equal(parseProfile('[ro.product.brand]: [NVIDIA]\n').brand, 'nvidia');
  assert.equal(parseProfile('').brand, 'unknown');
});

test('parseProfile 手机画像不应判定为 TV', () => {
  const p = parseProfile('[ro.product.brand]: [Google]\n[ro.product.model]: [Pixel 9]\n[ro.build.characteristics]: [nosdcard]\n');
  assert.equal(p.brand, 'google');
  assert.equal(p.isTv, false);
});

test('enrichFromDumpsys 提取权限 / sharedUserId / uses-library / 自启', () => {
  const pkgs = parsePackageList(SAMPLE_PACKAGES);
  enrichFromDumpsys(pkgs, SAMPLE_DUMPSYS);

  const contentrow = pkgs.find((p) => p.name === 'com.sony.tv.contentrow')!;
  assert.equal(contentrow.sharedUserId, 'com.sony.tv.shared');
  assert.ok(contentrow.permissions.includes('location'));
  assert.ok(contentrow.permissions.includes('phone'));

  const home = pkgs.find((p) => p.name === 'com.google.android.tungsten.home')!;
  assert.ok(home.usesLibraries.includes('com.google.android.gms'));
  assert.ok(home.permissions.includes('microphone'));

  const push = pkgs.find((p) => p.name === 'com.sony.tv.pushsdk')!;
  assert.equal(push.autostart, true);
});

test('parseSnapshotFiles 组装完整快照并按包名排序', () => {
  const snap = parseSnapshotFiles({
    packages: SAMPLE_PACKAGES,
    disabled: SAMPLE_DISABLED,
    getprop: SAMPLE_GETPROP,
    dumpsys: SAMPLE_DUMPSYS,
  });
  assert.equal(snap.profile.brand, 'sony');
  assert.equal(snap.packages.length, 25);
  // 有序
  const names = snap.packages.map((p) => p.name);
  assert.deepEqual(names, [...names].sort((a, b) => a.localeCompare(b)));
  // 已禁用标记生效
  const legacy = snap.packages.find((p) => p.name === 'com.sony.tv.telemetry.legacy')!;
  assert.equal(legacy.state, 'disabled');
});

test('解析是纯函数：相同输入产生相同输出', () => {
  const a = parseSnapshotFiles({ packages: SAMPLE_PACKAGES, getprop: SAMPLE_GETPROP });
  const b = parseSnapshotFiles({ packages: SAMPLE_PACKAGES, getprop: SAMPLE_GETPROP });
  assert.equal(JSON.stringify(a.packages), JSON.stringify(b.packages));
});
