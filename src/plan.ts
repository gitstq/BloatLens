import type { DebloatPlan, DeviceSnapshot, EvaluateOptions, PlanAction, RiskVerdict } from './types';
import { evaluate } from './risk';
import { ruleSetIds } from './data/rules';

/**
 * 清理计划编排器
 *
 * 核心承诺：**每一条动作都必须可撤销**。
 * BloatLens 在生成计划时会同步生成幂等的 restore 脚本，并在返回前做一次
 * 完整的可逆性校验（allReversible）。校验不通过时，CLI 会以非零退出码失败，
 * 从而可以直接用作 CI 门禁。
 */

export interface PlanOptions extends EvaluateOptions {
  /** 只纳入 safe 级别（默认 true），false 时同时纳入 caution */
  safeOnly?: boolean;
  /** 是否包含 caution 级别动作 */
  includeCaution?: boolean;
  /** 生成的 adb 目标设备参数，例如 -s 192.168.1.20:5555 */
  deviceArg?: string;
  /** 计划标题，写入 restore 脚本注释 */
  title?: string;
}

const ADB = 'adb';

function adbPrefix(deviceArg?: string): string {
  return deviceArg ? `${ADB} -s ${deviceArg}` : ADB;
}

function commandFor(action: PlanAction['action'], pkg: string, deviceArg?: string): string {
  const base = adbPrefix(deviceArg);
  switch (action) {
    case 'disable-user':
      return `${base} shell pm disable-user --user 0 ${pkg}`;
    case 'disable':
      return `${base} shell pm disable ${pkg}`;
    case 'suspend':
      return `${base} shell pm suspend ${pkg}`;
    case 'skip':
    default:
      return `# skip ${pkg}`;
  }
}

function undoFor(action: PlanAction['action'], pkg: string, deviceArg?: string): string {
  const base = adbPrefix(deviceArg);
  switch (action) {
    case 'disable-user':
      return `${base} shell pm enable ${pkg}`;
    case 'disable':
      return `${base} shell pm enable ${pkg}`;
    case 'suspend':
      return `${base} shell pm unsuspend ${pkg}`;
    case 'skip':
    default:
      return `# skip ${pkg}`;
  }
}

function toAction(v: RiskVerdict, deviceArg?: string): PlanAction {
  let action: PlanAction['action'];
  if (v.protected || v.package.state === 'disabled' || v.grade === 'keep') action = 'skip';
  else if (v.grade === 'safe') action = 'disable-user';
  else if (v.grade === 'caution') action = 'suspend';
  else action = 'skip';

  return {
    package: v.package.name,
    action,
    grade: v.grade,
    netScore: v.netScore,
    command: commandFor(action, v.package.name, deviceArg),
    undoCommand: undoFor(action, v.package.name, deviceArg),
    reason: v.reason,
  };
}

/** 生成幂等的 restore 脚本 */
export function buildRestoreScript(actions: PlanAction[], meta: { device?: string; title?: string; capturedAt: string }): string {
  const lines: string[] = [];
  lines.push('#!/bin/sh');
  lines.push('#');
  lines.push(`# BloatLens restore script${meta.title ? ` — ${meta.title}` : ''}`);
  lines.push(`# generated at ${meta.capturedAt}`);
  lines.push('#');
  lines.push('# 本脚本是幂等的：重复执行不会改变最终状态，也不会产生副作用。');
  lines.push('# 用法： sh restore.sh        （按设备执行）');
  lines.push('#       sh restore.sh --dry-run  （仅打印，不执行）');
  lines.push('');
  lines.push('set -eu');
  lines.push('');
  lines.push('DRY_RUN=0');
  lines.push('if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; fi');
  lines.push('');
  lines.push('run() {');
  lines.push('  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] $*"; else "$@" || echo "[warn] failed: $*"; fi');
  lines.push('}');
  lines.push('');

  const actionable = actions.filter((a) => a.action !== 'skip');
  if (actionable.length === 0) {
    lines.push('echo "Nothing to restore."');
    lines.push('exit 0');
    return lines.join('\n') + '\n';
  }

  lines.push(`echo "Restoring ${actionable.length} package(s)..."`);
  lines.push('');
  for (const a of actionable) {
    lines.push(`# ${a.package}  (grade=${a.grade}, netScore=${a.netScore})`);
    lines.push(`run ${a.undoCommand}`);
    lines.push('');
  }
  lines.push('echo "Restore finished."');
  return lines.join('\n') + '\n';
}

/** 可逆性校验 */
export function checkReversibility(actions: PlanAction[]): { allReversible: boolean; missingUndo: string[] } {
  const missing: string[] = [];
  for (const a of actions) {
    if (a.action === 'skip') continue;
    if (!a.undoCommand || a.undoCommand.startsWith('#') || a.undoCommand.trim() === '') {
      missing.push(a.package);
      continue;
    }
    // 撤销命令必须能还原：disable-user -> enable, suspend -> unsuspend
    const ok =
      (a.action === 'disable-user' && /pm enable/.test(a.undoCommand)) ||
      (a.action === 'disable' && /pm enable/.test(a.undoCommand)) ||
      (a.action === 'suspend' && /pm unsuspend/.test(a.undoCommand));
    if (!ok) missing.push(a.package);
  }
  return { allReversible: missing.length === 0, missingUndo: missing };
}

/** 由快照生成完整清理计划 */
export function buildPlan(snapshot: DeviceSnapshot, options: PlanOptions = {}): DebloatPlan {
  const { verdicts } = evaluate(snapshot, options);
  const deviceArg = options.deviceArg;
  const includeCaution = options.includeCaution ?? false;

  let actions = verdicts.map((v) => toAction(v, deviceArg));

  if (options.safeOnly !== false && !includeCaution) {
    // 默认只保留 safe；caution 降级为 skip 但在 reason 中保留提示
    actions = actions.map((a) =>
      a.grade === 'caution' && a.action === 'suspend' ? { ...a, action: 'skip' as const, reason: `${a.reason}（默认未纳入，使用 --include-caution 启用）` } : a
    );
  }

  const summary = {
    total: actions.length,
    disableUser: actions.filter((a) => a.action === 'disable-user').length,
    disable: actions.filter((a) => a.action === 'disable').length,
    suspend: actions.filter((a) => a.action === 'suspend').length,
    skip: actions.filter((a) => a.action === 'skip').length,
    protectedCount: verdicts.filter((v) => v.protected).length,
  };

  const rev = checkReversibility(actions);

  return {
    snapshot: {
      brand: snapshot.profile.brand,
      model: snapshot.profile.model,
      isTv: snapshot.profile.isTv,
      totalPackages: snapshot.packages.length,
      capturedAt: snapshot.capturedAt,
    },
    ruleSets: ruleSetIds(),
    actions,
    summary,
    reversibility: {
      allReversible: rev.allReversible,
      missingUndo: rev.missingUndo,
      restoreScript: buildRestoreScript(actions, {
        device: deviceArg,
        title: options.title,
        capturedAt: snapshot.capturedAt,
      }),
    },
  };
}

/** 生成可直接执行的 apply 脚本（与 restore 成对） */
export function buildApplyScript(plan: DebloatPlan, meta: { device?: string } = {}): string {
  const lines: string[] = [];
  lines.push('#!/bin/sh');
  lines.push('# BloatLens apply script — 与 restore.sh 成对生成');
  lines.push(`# device: ${meta.device || '(default)'}   packages: ${plan.snapshot.totalPackages}`);
  lines.push('');
  lines.push('set -eu');
  lines.push('DRY_RUN=0');
  lines.push('if [ "${1:-}" = "--dry-run" ]; then DRY_RUN=1; fi');
  lines.push('run() {');
  lines.push('  if [ "$DRY_RUN" = "1" ]; then echo "[dry-run] $*"; else "$@" || echo "[warn] failed: $*"; fi');
  lines.push('}');
  lines.push('');
  const actionable = plan.actions.filter((a) => a.action !== 'skip');
  for (const a of actionable) {
    lines.push(`# ${a.package}  (${a.grade}, net=${a.netScore}) — ${a.reason}`);
    lines.push(`run ${a.command}`);
    lines.push('');
  }
  if (actionable.length === 0) lines.push('echo "Nothing to apply."');
  return lines.join('\n') + '\n';
}
