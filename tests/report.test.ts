import { test } from 'node:test';
import assert from 'node:assert/strict';
import { render, renderHtml, renderJson, renderMarkdown } from '../src/report';
import { buildPlan } from '../src/plan';
import { evaluate } from '../src/risk';
import { parseSnapshotFiles } from '../src/dump';
import { SAMPLE_DUMPSYS, SAMPLE_GETPROP, SAMPLE_PACKAGES, SAMPLE_DISABLED } from '../src/data/sample';
import { parsePackageList, parseProfile } from '../src/dump';
import { BUILTIN_RULES } from '../src/data/rules';

const snap = parseSnapshotFiles({
  packages: SAMPLE_PACKAGES,
  disabled: SAMPLE_DISABLED,
  getprop: SAMPLE_GETPROP,
  dumpsys: SAMPLE_DUMPSYS,
});
const { verdicts } = evaluate(snap);
const plan = buildPlan(snap, { includeCaution: true });

test('terminal 报告包含标题与关键统计', () => {
  const out = render('terminal', plan, verdicts, { color: false });
  assert.match(out, /清理计划/);
  assert.match(out, /包总数/);
  assert.match(out, /可逆性/);
});

test('terminal 报告 --no-color 时不含 ANSI 转义', () => {
  const out = render('terminal', plan, verdicts, { color: false });
  assert.ok(!out.includes('\u001b['));
});

test('terminal 报告默认启用 ANSI 颜色', () => {
  const out = render('terminal', plan, verdicts, { color: true });
  assert.match(out, /\u001b\[/);
});

test('terminal 报告支持 limit 截断', () => {
  const out = render('terminal', plan, verdicts, { color: false, limit: 3 });
  const rows = out.split('\n').filter((l) => l.includes('net=') || /\bnet\b/.test(l));
  assert.ok(rows.length > 0);
});

test('json 报告是合法 JSON 且结构完整', () => {
  const out = renderJson(plan, verdicts);
  const parsed = JSON.parse(out) as Record<string, unknown>;
  assert.equal(parsed.tool, 'BloatLens');
  assert.ok(Array.isArray(parsed.actions));
  assert.ok(Array.isArray(parsed.verdicts));
  const v = (parsed.verdicts as Array<Record<string, unknown>>)[0];
  assert.ok('netScore' in v && 'grade' in v && 'signals' in v);
});

test('markdown 报告包含表格与标题', () => {
  const out = renderMarkdown(plan, verdicts);
  assert.match(out, /^# BloatLens 审计报告/);
  assert.match(out, /\| 动作 \| 包名 \|/);
  assert.match(out, /## 风险明细/);
});

test('html 报告自包含且无外部资源引用', () => {
  const out = renderHtml(plan, verdicts);
  assert.match(out, /^<!DOCTYPE html>/i);
  assert.ok(!/<script/i.test(out), '不应包含脚本');
  assert.ok(!/https?:\/\//.test(out.replace(/https?:\/\/www\.w3\.org[^"']*/g, '')), '不应引用外部资源');
  assert.match(out, /<style>/);
});

test('html 报告对包名做转义，防止注入', () => {
  const evil = parsePackageList('package:/system/app/E/E.apk=com.x<script>alert(1)</script>');
  const evilSnap = { profile: parseProfile(''), packages: evil, source: 't', capturedAt: 'x' };
  const v = evaluate(evilSnap).verdicts;
  const p = buildPlan(evilSnap);
  const out = renderHtml(p, v);
  assert.ok(!out.includes('<script>alert(1)</script>'));
  assert.ok(out.includes('&lt;script&gt;'));
});

test('render 统一出口按格式分发', () => {
  assert.match(render('json', plan, verdicts), /"tool": "BloatLens"/);
  assert.match(render('markdown', plan, verdicts), /^# /);
  assert.match(render('html', plan, verdicts), /^<!DOCTYPE html>/i);
});

test('空快照也能生成报告且不崩溃', () => {
  const empty = { profile: parseProfile(''), packages: [], source: 't', capturedAt: 'x' };
  const v = evaluate(empty).verdicts;
  const p = buildPlan(empty);
  assert.equal(v.length, 0);
  assert.doesNotThrow(() => render('html', p, v));
  assert.doesNotThrow(() => render('json', p, v));
  assert.doesNotThrow(() => render('markdown', p, v));
});

test('内置规则 ID 唯一', () => {
  const ids = BUILTIN_RULES.map((r) => r.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('内置规则的正则均可编译', () => {
  for (const r of BUILTIN_RULES) {
    assert.doesNotThrow(() => new RegExp(r.pattern), `规则 ${r.id} 正则非法`);
  }
});
