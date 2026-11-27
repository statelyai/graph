import type { Graph, GraphEdge } from '../types';
import { throwIfAborted } from './abort';
import { MinPriorityQueue } from './shared';

export interface GlobalMinCutOptions<E = any> {
  /** Finite non-negative edge weight. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<E>) => number;
  /** Abort signal, checked once per phase. Throws `signal.reason`. */
  signal?: AbortSignal;
}

export interface GlobalMinCutResult<E = any> {
  /** Total weight of the edges crossing the cut. */
  value: number;
  /** Node ids on each side, in `graph.nodes` order; the first side holds the first node. */
  partition: [string[], string[]];
  /** Edges crossing the cut, in `graph.edges` order. */
  cutEdges: GraphEdge<E>[];
}

/**
 * Returns a minimum cut of the whole graph: the cheapest set of edges whose
 * removal splits the nodes into two non-empty sides, with no source or sink
 * chosen in advance (Stoer–Wagner). Use {@link getMinCut} for an s–t cut.
 *
 * Edges are treated as undirected, with parallel edge weights summed;
 * self-loops and dangling edges are ignored. A disconnected graph has a cut
 * of value 0 (one component against the rest). Returns `undefined` for
 * fewer than two nodes. Throws on a negative or non-finite weight.
 *
 * O(n · m log n) time and O(n + m) memory.
 *
 * @example
 * ```ts
 * // Two triangles joined by one edge
 * getGlobalMinCut(graph)?.cutEdges.map((e) => e.id); // ['bridge']
 * ```
 */
export function getGlobalMinCut<N, E>(
  graph: Graph<N, E>,
  options?: GlobalMinCutOptions<E>,
): GlobalMinCutResult<E> | undefined {
  const n = graph.nodes.length;
  if (n < 2) return undefined;
  const getWeight =
    options?.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const indexOf = new Map(graph.nodes.map((node, i) => [node.id, i]));

  // Merged-vertex adjacency: vertex → (vertex → summed weight)
  const adjacency: Array<Map<number, number>> = Array.from(
    { length: n },
    () => new Map(),
  );
  for (const edge of graph.edges) {
    const u = indexOf.get(edge.sourceId);
    const v = indexOf.get(edge.targetId);
    if (u === undefined || v === undefined) continue;
    const w = getWeight(edge as GraphEdge<E>);
    if (!Number.isFinite(w) || w < 0) {
      throw new Error(
        `getGlobalMinCut: edge "${edge.id}" has weight ${w}; weights must be finite and non-negative`,
      );
    }
    if (u === v) continue;
    adjacency[u].set(v, (adjacency[u].get(v) ?? 0) + w);
    adjacency[v].set(u, (adjacency[v].get(u) ?? 0) + w);
  }

  // groups[v]: original nodes merged into vertex v
  const groups: number[][] = Array.from({ length: n }, (_, i) => [i]);
  const active = Array.from({ length: n }, (_, i) => i);
  let bestValue = Infinity;
  let bestSide: number[] = [];
  const key = new Float64Array(n);
  const added = new Uint8Array(n);

  while (active.length > 1) {
    throwIfAborted(options?.signal);
    // Maximum-adjacency ordering from active[0] (lazy max-heap)
    for (const v of active) {
      key[v] = 0;
      added[v] = 0;
    }
    const heap = new MinPriorityQueue<[number, number]>(
      (a, b) => b[0] - a[0] || a[1] - b[1],
    );
    heap.push([0, active[0]]);
    let previous = -1;
    let last = active[0];
    let remaining = active.length;
    while (remaining > 0) {
      let pick: number;
      const top = heap.pop();
      if (top && !added[top[1]] && top[0] === key[top[1]]) {
        pick = top[1];
      } else if (top) {
        continue;
      } else {
        // Heap drained: the rest is disconnected from the added set
        pick = active.find((v) => !added[v])!;
      }
      added[pick] = 1;
      remaining--;
      previous = last;
      last = pick;
      for (const [u, w] of adjacency[pick]) {
        if (added[u]) continue;
        key[u] += w;
        heap.push([key[u], u]);
      }
    }
    // Cut of the phase: `last` alone against everything else
    if (key[last] < bestValue) {
      bestValue = key[last];
      bestSide = [...groups[last]];
    }
    // Merge `last` into `previous`
    for (const [u, w] of adjacency[last]) {
      adjacency[u].delete(last);
      if (u === previous) continue;
      adjacency[previous].set(u, (adjacency[previous].get(u) ?? 0) + w);
      adjacency[u].set(previous, (adjacency[u].get(previous) ?? 0) + w);
    }
    adjacency[last].clear();
    for (const v of groups[last]) groups[previous].push(v);
    groups[last] = [];
    active.splice(active.indexOf(last), 1);
  }

  const onSide = new Uint8Array(n);
  for (const v of bestSide) onSide[v] = 1;
  // The first side holds the first node
  if (onSide[0]) for (let i = 0; i < n; i++) onSide[i] ^= 1;
  const first: string[] = [];
  const second: string[] = [];
  graph.nodes.forEach((node, i) => (onSide[i] ? second : first).push(node.id));
  const cutEdges = graph.edges.filter((edge) => {
    const u = indexOf.get(edge.sourceId);
    const v = indexOf.get(edge.targetId);
    return u !== undefined && v !== undefined && onSide[u] !== onSide[v];
  }) as GraphEdge<E>[];
  return { value: bestValue, partition: [first, second], cutEdges };
}
