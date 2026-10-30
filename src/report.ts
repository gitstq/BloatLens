import type { DebloatPlan, ReportFormat, RiskVerdict } from './types';

/**
 * 多格式报告生成器（零依赖，纯字符串拼装）
 *
 * - terminal：带 ANSI 色彩的人类可读终端输出
 * - json：结构化，供 CI / 二次开发消费
 * - markdown：可直接贴进 issue / PR
 * - html：自包含单文件（内联 CSS，无外部资源，可离线打开）
 */

const GRADE_LABEL: Record<string, string> = {
  safe: 'SAFE',
  caution: 'CAUTION',
  risky: 'RISKY',
  keep: 'KEEP',
};

const C = {
  reset: '\u001b[0m',
  bold: '\u001b[1m',
  dim: '\u001b[2m',
  red: '\u001b[31m',
  green: '\u001b[32m',
  yellow: '\u001b[33m',
  blue: '\u001b[34m',
  cyan: '\u001b[36m',
};

function colorize(grade: string): string {
  switch (grade) {
    case 'safe':
      return `${C.green}${GRADE_LABEL.safe}${C.reset}`;
    case 'caution':
      return `${C.yellow}${GRADE_LABEL.caution}${C.reset}`;
    case 'risky':
      return `${C.red}${GRADE_LABEL.risky}${C.reset}`;
    default:
      return `${C.dim}${GRADE_LABEL.keep}${C.reset}`;
  }
}

function bar(score: number, width = 12): string {
  const filled = Math.round((Math.max(0, Math.min(100, score)) / 100) * width);
  return '█'.repeat(filled) + '·'.repeat(width - filled);
}

/** 终端报告：风险评估视角 */
export function renderTerminalVerdicts(verdicts: RiskVerdict[], opts: { limit?: number; color?: boolean } = {}): string {
  const limit = opts.limit ?? 25;
  const color = opts.color !== false;
  const out: string[] = [];
  const top = verdicts.slice(0, limit);

  out.push(`${color ? C.bold : ''}包名${color ? C.reset : ''}`.padEnd(52) + ' 分级     net  信号  依赖  结论');
  out.push('─'.repeat(118));
  for (const v of top) {
    const name = v.package.name.length > 48 ? v.package.name.slice(0, 45) + '...' : v.package.name;
    const g = color ? colorize(v.grade) : GRADE_LABEL[v.grade].padEnd(8);
    const dep = v.dependents.length > 0 ? String(v.dependents.length) : '-';
    const line =
      name.padEnd(52) +
      `${color ? g : GRADE_LABEL[v.grade]}`.padEnd(color ? 20 : 9) +
      String(v.netScore).padStart(4) +
      String(v.signals.length).padStart(6) +
      dep.padStart(6) +
      '  ' +
      v.reason;
    out.push(line);
  }
  return out.join('\n');
}

/** 终端报告：计划视角 */
export function renderTerminalPlan(plan: DebloatPlan, opts: { color?: boolean } = {}): string {
  const color = opts.color !== false;
  const out: string[] = [];
  const s = plan.summary;
  const revOk = plan.reversibility.allReversible;
  const revText = revOk ? '全部可撤销' : '存在缺失撤销项';
  const revColored = revOk ? `${color ? C.green : ''}${revText}${color ? C.reset : ''}` : `${color ? C.red : ''}${revText}${color ? C.reset : ''}`;
  out.push(`${color ? C.bold : ''}清理计划${color ? C.reset : ''}`);
  out.push(`  设备: ${plan.snapshot.brand}/${plan.snapshot.model || 'unknown'}${plan.snapshot.isTv ? ' (TV)' : ''}`);
  out.push(`  包总数: ${s.total}   受保护: ${s.protectedCount}`);
  out.push(`  建议禁用(disable-user): ${s.disableUser}   挂起(suspend): ${s.suspend}   跳过: ${s.skip}`);
  out.push(`  可逆性: ${revColored}`);
  out.push('');
  const actionable = plan.actions.filter((a) => a.action !== 'skip');
  if (actionable.length === 0) {
    out.push('  没有需要处理的包。');
  } else {
    for (const a of actionable.slice(0, 40)) {
      out.push(`  ${a.action.padEnd(13)} ${a.package.padEnd(46)} net=${String(a.netScore).padStart(3)}  ${a.reason}`);
    }
  }
  return out.join('\n');
}

/** JSON 报告 */
export function renderJson(plan: DebloatPlan, verdicts: RiskVerdict[]): string {
  return JSON.stringify(
    {
      tool: 'BloatLens',
      version: '1.0.0',
      snapshot: plan.snapshot,
      ruleSets: plan.ruleSets,
      summary: plan.summary,
      reversibility: {
        allReversible: plan.reversibility.allReversible,
        missingUndo: plan.reversibility.missingUndo,
      },
      actions: plan.actions,
      verdicts: verdicts.map((v) => ({
        package: v.package.name,
        partition: v.package.partition,
        state: v.package.state,
        score: v.score,
        blastPenalty: v.blastPenalty,
        netScore: v.netScore,
        grade: v.grade,
        protected: v.protected,
        protectedReason: v.protectedReason,
        dependents: v.dependents,
        signals: v.signals.map((s) => ({ id: s.id, label: s.label, weight: s.weight, evidence: s.evidence })),
        reason: v.reason,
      })),
    },
    null,
    2
  );
}

/** Markdown 报告 */
export function renderMarkdown(plan: DebloatPlan, verdicts: RiskVerdict[]): string {
  const out: string[] = [];
  const s = plan.summary;
  out.push('# BloatLens 审计报告');
  out.push('');
  out.push(`- **设备**：${plan.snapshot.brand} / ${plan.snapshot.model || 'unknown'}${plan.snapshot.isTv ? '（TV）' : ''}`);
  out.push(`- **快照时间**：${plan.snapshot.capturedAt}`);
  out.push(`- **包总数**：${s.total}　**受保护**：${s.protectedCount}`);
  out.push(`- **建议禁用**：${s.disableUser}　**建议挂起**：${s.suspend}　**跳过**：${s.skip}`);
  out.push(`- **可逆性**：${plan.reversibility.allReversible ? '全部可撤销 ✅' : '存在缺失撤销项 ❌'}`);
  out.push('');
  out.push('## 建议动作');
  out.push('');
  out.push('| 动作 | 包名 | 分级 | net | 爆炸半径 | 说明 |');
  out.push('| --- | --- | --- | --- | --- | --- |');
  for (const a of plan.actions.filter((x) => x.action !== 'skip')) {
    const v = verdicts.find((x) => x.package.name === a.package);
    out.push(
      `| \`${a.action}\` | \`${a.package}\` | ${GRADE_LABEL[a.grade]} | ${a.netScore} | ${v?.blastPenalty ?? 0} | ${a.reason} |`
    );
  }
  out.push('');
  out.push('## 风险明细（Top 20）');
  out.push('');
  out.push('| 包名 | 分级 | 原始分 | 爆炸惩罚 | net | 命中信号 |');
  out.push('| --- | --- | --- | --- | --- | --- |');
  for (const v of verdicts.slice(0, 20)) {
    out.push(
      `| \`${v.package.name}\` | ${GRADE_LABEL[v.grade]} | ${v.score} | ${v.blastPenalty} | ${v.netScore} | ${v.signals.map((x) => x.label).join('、') || '—'} |`
    );
  }
  out.push('');
  out.push('> 本报告由 BloatLens 生成。执行前请先备份，并使用 `bloatlens restore` 验证撤销路径。');
  return out.join('\n') + '\n';
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** 自包含 HTML 报告（内联 CSS，无外部依赖，可离线打开） */
export function renderHtml(plan: DebloatPlan, verdicts: RiskVerdict[]): string {
  const s = plan.summary;
  const rows = verdicts
    .slice(0, 200)
    .map((v) => {
      const cls = v.grade;
      return `<tr class="${cls}">
      <td class="pkg">${esc(v.package.name)}</td>
      <td><span class="badge ${cls}">${GRADE_LABEL[v.grade]}</span></td>
      <td class="num">${v.score}</td>
      <td class="num">${v.blastPenalty}</td>
      <td class="num strong">${v.netScore}</td>
      <td class="bar"><span style="width:${Math.max(0, Math.min(100, v.netScore))}%"></span></td>
      <td>${v.signals.map((x) => `<span class="tag">${esc(x.label)}</span>`).join(' ') || '—'}</td>
      <td class="reason">${esc(v.reason)}</td>
    </tr>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>BloatLens 审计报告</title>
<style>
  :root { --bg:#0f1116; --card:#171a21; --fg:#e6e9ef; --muted:#9aa3b2; --line:#262b36;
          --safe:#3fb950; --caution:#d29922; --risky:#f85149; --keep:#6e7681; --accent:#58a6ff; }
  * { box-sizing: border-box; }
  body { margin:0; padding:32px; background:var(--bg); color:var(--fg);
         font:14px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans SC",Roboto,Helvetica,Arial,sans-serif; }
  h1 { margin:0 0 4px; font-size:26px; }
  .sub { color:var(--muted); margin-bottom:24px; }
  .cards { display:flex; flex-wrap:wrap; gap:12px; margin-bottom:24px; }
  .card { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:14px 18px; min-width:150px; }
  .card .k { color:var(--muted); font-size:12px; }
  .card .v { font-size:22px; font-weight:600; margin-top:2px; }
  .ok { color:var(--safe); } .no { color:var(--risky); }
  table { width:100%; border-collapse:collapse; background:var(--card);
          border:1px solid var(--line); border-radius:10px; overflow:hidden; }
  th { text-align:left; padding:10px 12px; background:#1c212b; color:var(--muted);
       font-weight:600; font-size:12px; text-transform:uppercase; letter-spacing:.04em; }
  td { padding:9px 12px; border-top:1px solid var(--line); vertical-align:top; }
  .pkg { font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace; font-size:12.5px; word-break:break-all; }
  .num { text-align:right; font-variant-numeric:tabular-nums; }
  .strong { font-weight:700; }
  .badge { display:inline-block; padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; }
  .badge.safe { background:rgba(63,185,80,.16); color:var(--safe); }
  .badge.caution { background:rgba(210,153,34,.16); color:var(--caution); }
  .badge.risky { background:rgba(248,81,73,.16); color:var(--risky); }
  .badge.keep { background:rgba(110,118,129,.16); color:var(--keep); }
  .bar { width:120px; }
  .bar span { display:block; height:8px; border-radius:4px;
              background:linear-gradient(90deg,var(--accent),var(--safe)); }
  .tag { display:inline-block; padding:1px 7px; margin:1px 3px 1px 0; border-radius:5px;
         background:#222834; color:var(--muted); font-size:11px; }
  .reason { color:var(--muted); font-size:12.5px; }
  footer { margin-top:24px; color:var(--muted); font-size:12px; }
</style>
</head>
<body>
<h1>🔍 BloatLens 审计报告</h1>
<div class="sub">${esc(plan.snapshot.brand)} / ${esc(plan.snapshot.model || 'unknown')}${plan.snapshot.isTv ? ' · Android TV' : ''} · ${esc(plan.snapshot.capturedAt)}</div>
<div class="cards">
  <div class="card"><div class="k">包总数</div><div class="v">${s.total}</div></div>
  <div class="card"><div class="k">受保护</div><div class="v">${s.protectedCount}</div></div>
  <div class="card"><div class="k">建议禁用</div><div class="v ok">${s.disableUser}</div></div>
  <div class="card"><div class="k">建议挂起</div><div class="v">${s.suspend}</div></div>
  <div class="card"><div class="k">跳过</div><div class="v">${s.skip}</div></div>
  <div class="card"><div class="k">可逆性</div><div class="v ${plan.reversibility.allReversible ? 'ok' : 'no'}">${plan.reversibility.allReversible ? '✅ 全部可撤销' : '❌ 缺失撤销项'}</div></div>
</div>
<table>
  <thead><tr>
    <th>包名</th><th>分级</th><th>原始分</th><th>爆炸惩罚</th><th>Net</th><th>置信条</th><th>命中信号</th><th>结论</th>
  </tr></thead>
  <tbody>
${rows}
  </tbody>
</table>
<footer>由 <strong>BloatLens</strong> 生成 · 零依赖 · 离线优先 · 执行前请备份并使用 restore 脚本验证撤销路径。</footer>
</body>
</html>
`;
}

/** 统一出口 */
export function render(
  format: ReportFormat,
  plan: DebloatPlan,
  verdicts: RiskVerdict[],
  opts: { color?: boolean; limit?: number } = {}
): string {
  switch (format) {
    case 'json':
      return renderJson(plan, verdicts);
    case 'markdown':
      return renderMarkdown(plan, verdicts);
    case 'html':
      return renderHtml(plan, verdicts);
    case 'terminal':
    default:
      return (
        renderTerminalPlan(plan, { color: opts.color }) +
        '\n\n' +
        renderTerminalVerdicts(verdicts, { limit: opts.limit ?? 20, color: opts.color })
      );
  }
}

export { bar };
