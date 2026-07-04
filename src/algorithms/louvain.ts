import type { Graph, GraphEdge } from '../types';
import { throwIfAborted } from './abort';

export interface LouvainOptions<E = any> {
  /** Edge weight accessor. Defaults to `edge.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<E>) => number;
  /** Resolution parameter γ. Values > 1 favor smaller communities. Default 1. */
  resolution?: number;
  /** Maximum number of two-phase (local move + aggregation) passes. Default 10. */
  maxPasses?: number;
  /** Abort signal, checked once per pass. Throws `signal.reason`. */
  signal?: AbortSignal;
}

/**
 * Returns communities found by the classic two-phase Louvain modularity
 * optimization (local moving + community aggregation).
 *
 * Like the other community algorithms in this library, the graph is treated
 * as undirected regardless of `graph.mode` or per-edge modes. Parallel edges
 * have their weights summed; self-loops contribute to a community's internal
 * weight.
 *
 * The implementation is deterministic: nodes are visited in `graph.nodes`
 * array order and there is no random shuffling, so tie-breaking is
 * order-dependent but stable across runs.
 *
 * Returns communities of node ids, each community sorted lexicographically
 * and communities sorted by their first id.
 *
 * @example
 * ```ts
 * const communities = getLouvainCommunities(graph);
 * // [['a', 'b', 'c'], ['d', 'e', 'f']]
 * ```
 *
 * Pass `options.signal` to cancel: the abort is checked once per pass and
 * throws `signal.reason`.
 */
export function getLouvainCommunities<N, E>(
  graph: Graph<N, E>,
  options?: LouvainOptions<E>,
): string[][] {
  if (graph.nodes.length === 0) {
    return [];
  }

  const getWeight =
    options?.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const resolution = options?.resolution ?? 1;
  const maxPasses = options?.maxPasses ?? 10;

  // --- Build the level-0 weighted undirected graph ---
  const nodeIds = graph.nodes.map((node) => node.id);
  const indexOf = new Map<string, number>(nodeIds.map((id, i) => [id, i]));

  let count = nodeIds.length;
  // links[i]: neighbor index -> summed weight (self-loops excluded)
  let links: Array<Map<number, number>> = Array.from(
    { length: count },
    () => new Map(),
  );
  // selfLoops[i]: summed self-loop weight (contributes 2w to degree)
  let selfLoops: number[] = new Array(count).fill(0);

  for (const edge of graph.edges) {
    const u = indexOf.get(edge.sourceId);
    const v = indexOf.get(edge.targetId);
    if (u === undefined || v === undefined) continue;
    const w = getWeight(edge as GraphEdge<E>);
    if (u === v) {
      selfLoops[u] += w;
    } else {
      links[u].set(v, (links[u].get(v) ?? 0) + w);
      links[v].set(u, (links[v].get(u) ?? 0) + w);
    }
  }

  // membership[i]: community of original node i (community ids are indices
  // into the *current* level's nodes, remapped after each aggregation)
  let membership = nodeIds.map((_, i) => i);

  for (let pass = 0; pass < maxPasses; pass++) {
    throwIfAborted(options?.signal);
    // --- Phase 1: local moving ---
    const degree = links.map(
      (neighbors, i) =>
        2 * selfLoops[i] +
        [...neighbors.values()].reduce((sum, w) => sum + w, 0),
    );
    const m2 = degree.reduce((sum, k) => sum + k, 0);
    if (m2 === 0) break;

    const communityOf = Array.from({ length: count }, (_, i) => i);
    const communityTotal = [...degree];
    let movedAny = false;
    let movedThisSweep = true;

    while (movedThisSweep) {
      movedThisSweep = false;

      for (let i = 0; i < count; i++) {
        const current = communityOf[i];

        // Weight from node i to each neighboring community
        const weightTo = new Map<number, number>();
        for (const [j, w] of links[i]) {
          const c = communityOf[j];
          weightTo.set(c, (weightTo.get(c) ?? 0) + w);
        }

        // Remove i from its community
        communityTotal[current] -= degree[i];

        // Gain of joining community c: w_ic − γ · Σtot(c) · k_i / m2
        const gainOf = (c: number): number =>
          (weightTo.get(c) ?? 0) -
          (resolution * communityTotal[c] * degree[i]) / m2;

        let best = current;
        let bestGain = gainOf(current);
        for (const c of weightTo.keys()) {
          if (c === current) continue;
          const gain = gainOf(c);
          if (gain > bestGain + 1e-12) {
            best = c;
            bestGain = gain;
          }
        }

        communityTotal[best] += degree[i];
        if (best !== current) {
          communityOf[i] = best;
          movedThisSweep = true;
          movedAny = true;
        }
      }
    }

    if (!movedAny) break;

    // --- Phase 2: aggregate communities into super-nodes ---
    const renumber = new Map<number, number>();
    for (let i = 0; i < count; i++) {
      const c = communityOf[i];
      if (!renumber.has(c)) renumber.set(c, renumber.size);
    }
    const nextCount = renumber.size;

    const nextLinks: Array<Map<number, number>> = Array.from(
      { length: nextCount },
      () => new Map(),
    );
    const nextSelfLoops = new Array(nextCount).fill(0);

    for (let i = 0; i < count; i++) {
      const ci = renumber.get(communityOf[i])!;
      nextSelfLoops[ci] += selfLoops[i];
      for (const [j, w] of links[i]) {
        const cj = renumber.get(communityOf[j])!;
        if (ci === cj) {
          // Each intra-community link is visited from both endpoints
          nextSelfLoops[ci] += w / 2;
        } else {
          nextLinks[ci].set(cj, (nextLinks[ci].get(cj) ?? 0) + w);
        }
      }
    }

    membership = membership.map((c) => renumber.get(communityOf[c])!);
    links = nextLinks;
    selfLoops = nextSelfLoops;
    count = nextCount;

    if (nextCount === 1) break;
  }

  // --- Group original node ids by final community ---
  const grouped = new Map<number, string[]>();
  for (let i = 0; i < nodeIds.length; i++) {
    const c = membership[i];
    if (!grouped.has(c)) grouped.set(c, []);
    grouped.get(c)!.push(nodeIds[i]);
  }

  return [...grouped.values()]
    .map((ids) => ids.sort((a, b) => a.localeCompare(b)))
    .sort((a, b) => a[0].localeCompare(b[0]));
}
