import type { Graph, GraphNode } from '../types';
import { getCSR } from './csr';
import { throwIfAborted } from './abort';
import { getSimpleUndirectedAdjacency } from './undirected';

export type LinkPredictionMethod =
  | 'common-neighbors'
  | 'jaccard'
  | 'adamic-adar'
  | 'resource-allocation'
  | 'preferential-attachment';

export interface LinkPredictionOptions {
  /** Scoring method. Default `'adamic-adar'`. */
  method?: LinkPredictionMethod;
  /** Only score pairs that include this node. */
  from?: string;
  /** Return at most this many predictions (highest scores first). */
  limit?: number;
  /** Abort signal, checked once per node. Throws `signal.reason`. */
  signal?: AbortSignal;
}

export interface LinkPrediction {
  sourceId: string;
  targetId: string;
  score: number;
}

/*
 * All link-prediction scores use the simple undirected projection: edges
 * connect their endpoints regardless of mode or direction, parallel edges
 * collapse, and self-loops and dangling edges are ignored.
 */

function getPair(graph: Graph, sourceId: string, targetId: string) {
  const adjacency = getSimpleUndirectedAdjacency(graph);
  const a = adjacency.indexOf.get(sourceId);
  const b = adjacency.indexOf.get(targetId);
  return { adjacency, a, b };
}

function countCommon(left: Set<number>, right: Set<number>): number[] {
  const [small, large] = left.size <= right.size ? [left, right] : [right, left];
  const common: number[] = [];
  for (const v of small) if (large.has(v)) common.push(v);
  return common;
}

function scorePair(
  neighbors: Set<number>[],
  a: number,
  b: number,
  method: LinkPredictionMethod,
): number {
  if (method === 'preferential-attachment') {
    return neighbors[a].size * neighbors[b].size;
  }
  const common = countCommon(neighbors[a], neighbors[b]);
  switch (method) {
    case 'common-neighbors':
      return common.length;
    case 'jaccard': {
      const union = neighbors[a].size + neighbors[b].size - common.length;
      return union === 0 ? 0 : common.length / union;
    }
    case 'adamic-adar':
      // Every common neighbor has degree ≥ 2, so log(deg) > 0
      return common.reduce((sum, w) => sum + 1 / Math.log(neighbors[w].size), 0);
    case 'resource-allocation':
      return common.reduce((sum, w) => sum + 1 / neighbors[w].size, 0);
  }
}

/**
 * Returns the nodes adjacent to both `sourceId` and `targetId` (in
 * `graph.nodes` order), treating edges as undirected. Unknown ids return `[]`.
 */
export function getCommonNeighbors<N>(
  graph: Graph<N>,
  sourceId: string,
  targetId: string,
): GraphNode<N>[] {
  const { adjacency, a, b } = getPair(graph, sourceId, targetId);
  if (a === undefined || b === undefined) return [];
  const nodes = getCSR(graph).nodes as GraphNode<N>[];
  return countCommon(adjacency.neighbors[a], adjacency.neighbors[b])
    .sort((x, y) => x - y)
    .map((i) => nodes[i]);
}

function getPairScore(
  graph: Graph,
  sourceId: string,
  targetId: string,
  method: LinkPredictionMethod,
): number {
  const { adjacency, a, b } = getPair(graph, sourceId, targetId);
  if (a === undefined || b === undefined) return 0;
  return scorePair(adjacency.neighbors, a, b, method);
}

/**
 * Returns the Jaccard coefficient of two nodes: shared neighbors divided by
 * the union of their neighbors (0 when both have none). Unknown ids return 0.
 */
export function getJaccardCoefficient(
  graph: Graph,
  sourceId: string,
  targetId: string,
): number {
  return getPairScore(graph, sourceId, targetId, 'jaccard');
}

/**
 * Returns the Adamic–Adar index of two nodes: the sum of `1 / log(degree)`
 * over their shared neighbors, so rare shared neighbors count more. Unknown
 * ids return 0.
 */
export function getAdamicAdarIndex(
  graph: Graph,
  sourceId: string,
  targetId: string,
): number {
  return getPairScore(graph, sourceId, targetId, 'adamic-adar');
}

/**
 * Returns the resource-allocation index of two nodes: the sum of
 * `1 / degree` over their shared neighbors. Unknown ids return 0.
 */
export function getResourceAllocationIndex(
  graph: Graph,
  sourceId: string,
  targetId: string,
): number {
  return getPairScore(graph, sourceId, targetId, 'resource-allocation');
}

/**
 * Returns the preferential-attachment score of two nodes: the product of
 * their degrees (distinct neighbors). Unknown ids return 0.
 */
export function getPreferentialAttachment(
  graph: Graph,
  sourceId: string,
  targetId: string,
): number {
  return getPairScore(graph, sourceId, targetId, 'preferential-attachment');
}

/**
 * Scores node pairs that are not adjacent yet and returns the likeliest new
 * links, highest score first (ties in `graph.nodes` order). Pairs scoring 0
 * are left out, so neighborhood methods only consider nodes two hops apart.
 *
 * Pass `from` to score only pairs that include that node (an unknown id
 * returns `[]`) and `limit` to keep the top results. `'preferential-attachment'`
 * scores every non-adjacent pair, which is quadratic.
 *
 * @example
 * ```ts
 * getLinkPredictions(graph, { method: 'jaccard', from: 'alice', limit: 3 });
 * // [{ sourceId: 'alice', targetId: 'carol', score: 0.5 }, ...]
 * ```
 */
export function getLinkPredictions(
  graph: Graph,
  options?: LinkPredictionOptions,
): LinkPrediction[] {
  const method = options?.method ?? 'adamic-adar';
  const { ids, indexOf, neighbors } = getSimpleUndirectedAdjacency(graph);
  const n = ids.length;
  let sources: number[];
  if (options?.from !== undefined) {
    const s = indexOf.get(options.from);
    if (s === undefined) return [];
    sources = [s];
  } else {
    sources = Array.from({ length: n }, (_, i) => i);
  }
  const single = sources.length === 1;

  const predictions: Array<LinkPrediction & { a: number; b: number }> = [];
  const seen = new Int32Array(n).fill(-1);
  for (const a of sources) {
    throwIfAborted(options?.signal);
    seen[a] = a;
    for (const v of neighbors[a]) seen[v] = a;
    const consider = (b: number) => {
      if (seen[b] === a || (!single && b < a)) return;
      seen[b] = a;
      const score = scorePair(neighbors, a, b, method);
      if (score > 0) {
        const [x, y] = single || a < b ? [a, b] : [b, a];
        predictions.push({ sourceId: ids[x], targetId: ids[y], score, a: x, b: y });
      }
    };
    if (method === 'preferential-attachment') {
      for (let b = 0; b < n; b++) consider(b);
    } else {
      for (const v of neighbors[a]) for (const b of neighbors[v]) consider(b);
    }
  }

  predictions.sort((p, q) => q.score - p.score || p.a - q.a || p.b - q.b);
  const limited =
    options?.limit === undefined ? predictions : predictions.slice(0, options.limit);
  return limited.map(({ sourceId, targetId, score }) => ({ sourceId, targetId, score }));
}
