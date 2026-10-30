/**
 * BloatLens — 零依赖·离线优先的 Android / Android TV 臃肿软件审计与可逆清理编排引擎
 *
 * 库入口：所有能力都是纯函数或显式对象，无隐式全局状态，可安全嵌入任何流程。
 */

export * from './types';
export {
  parsePackageList,
  parseProfile,
  parseSnapshotFiles,
  enrichFromDumpsys,
  inferPartition,
  isPreinstalled,
  mergeStates,
  buildSnapshot,
} from './dump';
export {
  buildDependencyGraph,
  blastRadius,
  dependenciesOf,
  KNOWN_COUPLING,
  type DependencyEdge,
  type DependencyGraph,
} from './revdep';
export { evaluate, collectSignals, protectionFor } from './risk';
export { buildPlan, buildApplyScript, buildRestoreScript, checkReversibility, type PlanOptions } from './plan';
export {
  render,
  renderHtml,
  renderJson,
  renderMarkdown,
  renderTerminalPlan,
  renderTerminalVerdicts,
} from './report';
export { AdbClient, isAdbAvailable, defaultRunner, type AdbOptions, type AdbRunner } from './adb';
export { BUILTIN_RULES, PROTECTED_PATTERNS, DEFAULT_ALLOWLIST, ruleSetIds } from './data/rules';

export const VERSION = '1.0.0';
export const NAME = 'BloatLens';
