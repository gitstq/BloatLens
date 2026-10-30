import type { PackageInfo } from './types';

/**
 * 反向依赖图（Reverse Dependency Graph）
 *
 * 动机：清理 bloatware 最大的风险不是「多禁了一个广告服务」，而是
 * 「禁掉了某个被系统组件依赖的包，导致遥控器、投屏或桌面直接失效」。
 * 因此 BloatLens 在给出建议前，先计算每个包的「爆炸半径」(blast radius)：
 * 有多少存活的组件会因为它被禁用而受影响。
 *
 * 依赖证据来源（全部可从离线 dump 中得到）：
 *  1. sharedUserId：共享同一 uid 的包在运行时属于同一安全域，互相强耦合；
 *  2. uses-library：显式声明的共享库依赖（A uses-library B）；
 *  3. 内置已知耦合表：跨 Android 版本稳定的系统级耦合（如 GMS 家族）；
 *  4. 用户显式声明的耦合（通过 --extra-rules 或快照中的 dependents 字段）。
 */

export interface DependencyEdge {
  /** 依赖方（会被影响的一方） */
  from: string;
  /** 被依赖方（将要被禁用的一方） */
  to: string;
  evidence: string;
}

export interface DependencyGraph {
  /** 正向依赖：from -> to[] */
  forward: Map<string, string[]>;
  /** 反向依赖：to -> from[] */
  reverse: Map<string, string[]>;
  edges: DependencyEdge[];
}

/**
 * 内置已知耦合表：key = 被依赖包（或其正则），value = 依赖方命名空间/模式。
 * 只收录跨版本稳定、公开可查的系统级耦合，避免臆造。
 */
export const KNOWN_COUPLING: Array<{ target: RegExp; dependents: RegExp; label: string }> = [
  {
    target: /^com\.google\.android\.gms$/,
    dependents: /^(com\.google\.android\.|com\.android\.vending)/,
    label: 'GMS 家族强耦合',
  },
  {
    target: /^com\.google\.android\.gsf$/,
    dependents: /^com\.google\.android\./,
    label: 'GSF 账号与同步依赖',
  },
  {
    target: /^com\.android\.vending$/,
    dependents: /^com\.google\.android\./,
    label: 'Play 商店分发依赖',
  },
];

/** 构建依赖图 */
export function buildDependencyGraph(packages: PackageInfo[], extraEdges: DependencyEdge[] = []): DependencyGraph {
  const forward = new Map<string, string[]>();
  const reverse = new Map<string, string[]>();
  const edges: DependencyEdge[] = [];
  const names = new Set(packages.map((p) => p.name));

  const addEdge = (from: string, to: string, evidence: string) => {
    if (from === to) return;
    if (!names.has(to)) return;
    if (edges.some((e) => e.from === from && e.to === to)) return;
    edges.push({ from, to, evidence });
    if (!forward.has(from)) forward.set(from, []);
    forward.get(from)!.push(to);
    if (!reverse.has(to)) reverse.set(to, []);
    reverse.get(to)!.push(from);
  };

  // 1) sharedUserId 分组：同 uid 的包互相耦合（双向）
  const byUid = new Map<string, PackageInfo[]>();
  for (const p of packages) {
    if (!p.sharedUserId) continue;
    if (!byUid.has(p.sharedUserId)) byUid.set(p.sharedUserId, []);
    byUid.get(p.sharedUserId)!.push(p);
  }
  for (const [uid, group] of byUid) {
    if (group.length < 2) continue;
    for (const a of group) {
      for (const b of group) {
        addEdge(a.name, b.name, `sharedUserId=${uid}`);
      }
    }
  }

  // 2) uses-library：库通常以包名形式声明
  for (const p of packages) {
    for (const lib of p.usesLibraries) {
      // 库名可能是 com.xxx.lib 这类包名，也可能是 org.apache.http.legacy 这种短名
      if (!names.has(lib)) continue;
      addEdge(p.name, lib, 'uses-library');
    }
  }

  // 3) 内置已知耦合
  for (const { target, dependents, label } of KNOWN_COUPLING) {
    for (const p of packages) {
      if (!target.test(p.name)) continue;
      for (const q of packages) {
        if (q.name === p.name) continue;
        if (dependents.test(q.name)) addEdge(q.name, p.name, label);
      }
    }
  }

  // 4) 用户显式边
  for (const e of extraEdges) addEdge(e.from, e.to, e.evidence || 'user-declared');

  return { forward, reverse, edges };
}

/**
 * 计算某包的爆炸半径。
 *
 * 返回：直接依赖方 + 传递依赖方（BFS，深度可配置）+ 加权惩罚值。
 */
export function blastRadius(
  graph: DependencyGraph,
  pkg: string,
  opts: { maxDepth?: number; aliveFilter?: (name: string) => boolean } = {}
): { direct: string[]; transitive: string[]; penalty: number } {
  const maxDepth = opts.maxDepth ?? 3;
  const alive = opts.aliveFilter ?? (() => true);

  const direct = (graph.reverse.get(pkg) ?? []).filter(alive);
  const visited = new Set<string>([pkg]);
  const transitive = new Set<string>();
  let frontier = direct.slice();

  for (let depth = 1; depth < maxDepth && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const node of frontier) {
      if (visited.has(node)) continue;
      visited.add(node);
      transitive.add(node);
      for (const up of graph.reverse.get(node) ?? []) {
        if (!visited.has(up) && alive(up)) next.push(up);
      }
    }
    frontier = next;
  }
  // depth==1 的直接依赖也要计入 transitive 集合
  for (const d of direct) transitive.add(d);

  const transitiveList = Array.from(transitive).filter((n) => n !== pkg).sort();

  // 惩罚：直接依赖权重高，传递依赖按层递减
  // penalty = min(100, direct*12 + transitive*3)
  const penalty = Math.min(100, direct.length * 12 + Math.max(0, transitiveList.length - direct.length) * 3);

  return { direct: direct.slice().sort(), transitive: transitiveList, penalty };
}

/** 找出某个包依赖了谁（正向） */
export function dependenciesOf(graph: DependencyGraph, pkg: string): string[] {
  return (graph.forward.get(pkg) ?? []).slice().sort();
}
