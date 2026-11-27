import type { Graph, GraphEdge } from '../types';
import { throwIfAborted } from './abort';

export interface LeidenOptions<E = any> {
  /** Edge weight accessor. Defaults to `edge.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<E>) => number;
  /** Resolution parameter γ. Values > 1 favor smaller communities. Default 1. */
  resolution?: number;
  /** Maximum number of move/refine/aggregate passes. Default 10. */
  maxPasses?: number;
  /** Abort signal, checked once per pass. Throws `signal.reason`. */
  signal?: AbortSignal;
}

const EPSILON = 1e-12;

/**
 * Returns communities found by the Leiden algorithm (Traag, Waltman & van
 * Eck, 2019), the successor to Louvain. Each pass runs fast local moving,
 * then *refines* every community into well-connected sub-communities before
 * aggregating, so unlike Louvain it never returns a community that is
 * internally disconnected.
 *
 * Same conventions as {@link getLouvainCommunities}: the graph is treated as
 * undirected, parallel edges have their weights summed, self-loops count
 * toward a community's internal weight, and output is node ids with each
 * community sorted and communities sorted by first id. Deterministic: the
 * refinement merges greedily (the θ → 0 limit of the randomized original),
 * and nodes are visited in `graph.nodes` order.
 *
 * @example
 * ```ts
 * const communities = getLeidenCommunities(graph);
 * const q = getModularity(graph, communities);
 * ```
 */
export function getLeidenCommunities<N, E>(
  graph: Graph<N, E>,
  options?: LeidenOptions<E>,
): string[][] {
  const nodeIds = graph.nodes.map((node) => node.id);
  if (nodeIds.length === 0) return [];
  const getWeight =
    options?.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const resolution = options?.resolution ?? 1;
  const maxPasses = options?.maxPasses ?? 10;
  const indexOf = new Map<string, number>(nodeIds.map((id, i) => [id, i]));

  let count = nodeIds.length;
  let links: Array<Map<number, number>> = Array.from(
    { length: count },
    () => new Map(),
  );
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

  const baseLinks = links;
  // membership[i]: aggregate node of original node i at the current level
  let membership = nodeIds.map((_, i) => i);
  // communityOf[x]: community of aggregate node x (the partition P)
  let communityOf = Array.from({ length: count }, (_, i) => i);

  for (let pass = 0; pass < maxPasses; pass++) {
    throwIfAborted(options?.signal);
    const degree = links.map(
      (neighbors, i) =>
        2 * selfLoops[i] +
        [...neighbors.values()].reduce((sum, w) => sum + w, 0),
    );
    const m2 = degree.reduce((sum, k) => sum + k, 0);
    if (m2 === 0) break;

    // --- Fast local moving (queue-based) ---
    const communityTotal = new Array(count).fill(0);
    for (let i = 0; i < count; i++) communityTotal[communityOf[i]] += degree[i];
    const queue = Array.from({ length: count }, (_, i) => i);
    const queued = new Uint8Array(count).fill(1);
    for (let head = 0; head < queue.length; head++) {
      const i = queue[head];
      queued[i] = 0;
      const current = communityOf[i];
      const weightTo = new Map<number, number>();
      for (const [j, w] of links[i]) {
        const c = communityOf[j];
        weightTo.set(c, (weightTo.get(c) ?? 0) + w);
      }
      communityTotal[current] -= degree[i];
      const gainOf = (c: number) =>
        (weightTo.get(c) ?? 0) -
        (resolution * communityTotal[c] * degree[i]) / m2;
      let best = current;
      let bestGain = gainOf(current);
      for (const c of weightTo.keys()) {
        if (c === current) continue;
        const gain = gainOf(c);
        if (gain > bestGain + EPSILON) {
          best = c;
          bestGain = gain;
        }
      }
      communityTotal[best] += degree[i];
      if (best !== current) {
        communityOf[i] = best;
        for (const j of links[i].keys()) {
          if (communityOf[j] !== best && !queued[j]) {
            queued[j] = 1;
            queue.push(j);
          }
        }
      }
    }

    const distinct = new Set(communityOf).size;
    if (distinct === count) break;

    // --- Refinement: well-connected sub-communities inside each community ---
    const refined = Array.from({ length: count }, (_, i) => i);
    const refinedTotal = [...degree];
    const refinedExternal = new Array(count).fill(0);
    const isSingleton = new Uint8Array(count).fill(1);
    for (let i = 0; i < count; i++) {
      for (const [j, w] of links[i]) {
        if (communityOf[j] === communityOf[i]) refinedExternal[i] += w;
      }
    }
    for (let v = 0; v < count; v++) {
      if (!isSingleton[v]) continue;
      const c = communityOf[v];
      const totalC = communityTotal[c];
      const wellConnected = (internal: number, total: number) =>
        internal >= (resolution * total * (totalC - total)) / m2 - EPSILON;
      if (!wellConnected(refinedExternal[v], degree[v])) continue;

      const weightTo = new Map<number, number>();
      for (const [u, w] of links[v]) {
        if (communityOf[u] !== c) continue;
        const s = refined[u];
        weightTo.set(s, (weightTo.get(s) ?? 0) + w);
      }
      let best = v;
      let bestGain = 0;
      for (const [s, w] of weightTo) {
        if (s === v || !wellConnected(refinedExternal[s], refinedTotal[s])) continue;
        const gain = w - (resolution * refinedTotal[s] * degree[v]) / m2;
        if (gain > bestGain + EPSILON) {
          best = s;
          bestGain = gain;
        }
      }
      if (best === v) continue;
      refined[v] = best;
      refinedTotal[best] += degree[v];
      refinedTotal[v] = 0;
      refinedExternal[best] += refinedExternal[v] - 2 * weightTo.get(best)!;
      isSingleton[v] = 0;
      isSingleton[best] = 0;
    }

    // --- Aggregate by the refined partition; P seeds the next level ---
    const renumber = new Map<number, number>();
    for (let i = 0; i < count; i++) {
      if (!renumber.has(refined[i])) renumber.set(refined[i], renumber.size);
    }
    const nextCount = renumber.size;
    // Refinement merged nothing: aggregation would rebuild the same level
    if (nextCount === count) break;
    const communityRenumber = new Map<number, number>();
    const nextCommunityOf = new Array(nextCount).fill(0);
    for (let i = 0; i < count; i++) {
      const r = renumber.get(refined[i])!;
      const c = communityOf[i];
      if (!communityRenumber.has(c)) communityRenumber.set(c, communityRenumber.size);
      nextCommunityOf[r] = communityRenumber.get(c)!;
    }
    const nextLinks: Array<Map<number, number>> = Array.from(
      { length: nextCount },
      () => new Map(),
    );
    const nextSelfLoops = new Array(nextCount).fill(0);
    for (let i = 0; i < count; i++) {
      const ri = renumber.get(refined[i])!;
      nextSelfLoops[ri] += selfLoops[i];
      for (const [j, w] of links[i]) {
        const rj = renumber.get(refined[j])!;
        if (ri === rj) nextSelfLoops[ri] += w / 2;
        else nextLinks[ri].set(rj, (nextLinks[ri].get(rj) ?? 0) + w);
      }
    }

    membership = membership.map((x) => renumber.get(refined[x])!);
    links = nextLinks;
    selfLoops = nextSelfLoops;
    communityOf = nextCommunityOf;
    count = nextCount;
  }

  // Split any community that is not connected through its own edges (this
  // only raises modularity), so every community is internally connected.
  const finalCommunity = nodeIds.map((_, i) => communityOf[membership[i]]);
  const label = new Int32Array(nodeIds.length).fill(-1);
  const grouped: string[][] = [];
  for (let start = 0; start < nodeIds.length; start++) {
    if (label[start] !== -1) continue;
    const group: string[] = [];
    label[start] = grouped.length;
    const stack = [start];
    while (stack.length > 0) {
      const u = stack.pop()!;
      group.push(nodeIds[u]);
      for (const v of baseLinks[u].keys()) {
        if (label[v] === -1 && finalCommunity[v] === finalCommunity[start]) {
          label[v] = grouped.length;
          stack.push(v);
        }
      }
    }
    grouped.push(group);
  }
  return grouped
    .map((ids) => ids.sort((a, b) => a.localeCompare(b)))
    .sort((a, b) => a[0].localeCompare(b[0]));
}
