import type { Graph } from '../types';
import { getCSR } from './csr';

export interface GraphColoringOptions {
  /**
   * Vertex-ordering strategy for the greedy coloring:
   * - `'largest-first'` (default) — Welsh–Powell: color nodes in order of
   *   descending degree, ties broken by node position (deterministic).
   * - `'dsatur'` — Brélaz's DSATUR: repeatedly color the uncolored node with
   *   the highest saturation degree (most distinctly-colored neighbors),
   *   ties broken by descending degree then node position.
   */
  strategy?: 'largest-first' | 'dsatur';
}

export interface GraphColoring {
  /** Assigned color index (`0..colorCount-1`) per node id. */
  colors: Record<string, number>;
  /** Number of distinct colors used. */
  colorCount: number;
}

/**
 * Undirected adjacency (edge direction ignored) as flat CSR-style arrays,
 * with self-loops dropped and parallel edges collapsed per neighbor. Shared
 * by every coloring strategy so they see the same simple-graph structure.
 */
function buildAdjacency(graph: Graph): {
  n: number;
  ids: string[];
  offsets: Int32Array;
  neighbors: Int32Array;
} {
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const m = graph.edges.length;

  const degree = new Int32Array(n);
  for (let e = 0; e < m; e++) {
    const edge = graph.edges[e];
    if (edge.sourceId === edge.targetId) continue; // ignore self-loops
    const s = csr.indexOf.get(edge.sourceId);
    const t = csr.indexOf.get(edge.targetId);
    if (s === undefined || t === undefined) continue;
    degree[s]++;
    degree[t]++;
  }

  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + degree[i];
  const neighbors = new Int32Array(offsets[n]);
  const cursor = Int32Array.from(offsets.subarray(0, n));
  for (let e = 0; e < m; e++) {
    const edge = graph.edges[e];
    if (edge.sourceId === edge.targetId) continue;
    const s = csr.indexOf.get(edge.sourceId);
    const t = csr.indexOf.get(edge.targetId);
    if (s === undefined || t === undefined) continue;
    neighbors[cursor[s]++] = t;
    neighbors[cursor[t]++] = s;
  }

  return { n, ids: csr.ids, offsets, neighbors };
}

/** Lowest color index not used by any already-colored neighbor of `v`. */
function firstAvailableColor(
  v: number,
  offsets: Int32Array,
  neighbors: Int32Array,
  colors: Int32Array,
  used: Uint8Array,
): number {
  let touched = 0;
  for (let a = offsets[v]; a < offsets[v + 1]; a++) {
    const c = colors[neighbors[a]];
    if (c >= 0 && !used[c]) {
      used[c] = 1;
      touched++;
    }
  }
  let color = 0;
  while (color < used.length && used[color]) color++;
  // Reset only what we set, keeping this O(degree) rather than O(colors).
  if (touched > 0) {
    for (let a = offsets[v]; a < offsets[v + 1]; a++) {
      const c = colors[neighbors[a]];
      if (c >= 0) used[c] = 0;
    }
  }
  return color;
}

function colorLargestFirst(adj: {
  n: number;
  offsets: Int32Array;
  neighbors: Int32Array;
}): Int32Array {
  const { n, offsets, neighbors } = adj;
  const colors = new Int32Array(n).fill(-1);
  const used = new Uint8Array(n);

  // Descending degree, ties broken by ascending position (deterministic).
  const order = Array.from({ length: n }, (_, i) => i);
  order.sort((a, b) => {
    const da = offsets[a + 1] - offsets[a];
    const db = offsets[b + 1] - offsets[b];
    return db - da || a - b;
  });

  for (const v of order) {
    colors[v] = firstAvailableColor(v, offsets, neighbors, colors, used);
  }
  return colors;
}

function colorDsatur(adj: {
  n: number;
  offsets: Int32Array;
  neighbors: Int32Array;
}): Int32Array {
  const { n, offsets, neighbors } = adj;
  const colors = new Int32Array(n).fill(-1);
  const used = new Uint8Array(n);
  const degree = new Int32Array(n);
  for (let i = 0; i < n; i++) degree[i] = offsets[i + 1] - offsets[i];

  // Saturation = number of distinctly-colored neighbors, tracked per node via
  // a set of neighbor colors so ties stay deterministic.
  const neighborColors: Set<number>[] = Array.from(
    { length: n },
    () => new Set<number>(),
  );

  for (let step = 0; step < n; step++) {
    // Pick the uncolored node with max saturation, then max degree, then
    // lowest position.
    let best = -1;
    let bestSat = -1;
    let bestDeg = -1;
    for (let v = 0; v < n; v++) {
      if (colors[v] >= 0) continue;
      const sat = neighborColors[v].size;
      if (
        sat > bestSat ||
        (sat === bestSat && degree[v] > bestDeg)
      ) {
        best = v;
        bestSat = sat;
        bestDeg = degree[v];
      }
    }
    if (best === -1) break;

    const color = firstAvailableColor(best, offsets, neighbors, colors, used);
    colors[best] = color;
    for (let a = offsets[best]; a < offsets[best + 1]; a++) {
      neighborColors[neighbors[a]].add(color);
    }
  }
  return colors;
}

/**
 * Greedily proper-color the graph so no two adjacent nodes share a color.
 *
 * Edges are treated as undirected regardless of mode/direction; self-loops
 * are ignored. The result is deterministic for a given graph and strategy.
 * Greedy coloring is a heuristic: it returns a valid coloring but not
 * necessarily one using the minimum number of colors (chromatic number).
 *
 * @example
 * ```ts
 * const { colors, colorCount } = getGraphColoring(graph);
 * console.log(colors.a); // 0
 * ```
 */
export function getGraphColoring(
  graph: Graph,
  options?: GraphColoringOptions,
): GraphColoring {
  const adj = buildAdjacency(graph);
  if (adj.n === 0) return { colors: {}, colorCount: 0 };

  const strategy = options?.strategy ?? 'largest-first';
  const colorArray =
    strategy === 'dsatur' ? colorDsatur(adj) : colorLargestFirst(adj);

  const colors: Record<string, number> = {};
  let colorCount = 0;
  for (let i = 0; i < adj.n; i++) {
    const c = colorArray[i];
    colors[adj.ids[i]] = c;
    if (c + 1 > colorCount) colorCount = c + 1;
  }
  return { colors, colorCount };
}

/**
 * Returns `true` when `colors` is a proper coloring of `graph`: every edge
 * connects two nodes with different colors. Edge direction is ignored;
 * self-loops make any coloring invalid. A node missing from `colors` (or with
 * a non-finite color) also makes the coloring invalid.
 */
export function isValidColoring(
  graph: Graph,
  colors: Record<string, number>,
): boolean {
  for (const node of graph.nodes) {
    const c = colors[node.id];
    if (typeof c !== 'number' || !Number.isFinite(c)) return false;
  }
  for (const edge of graph.edges) {
    const s = colors[edge.sourceId];
    const t = colors[edge.targetId];
    if (s === undefined || t === undefined) return false;
    if (s === t) return false; // covers self-loops too
  }
  return true;
}
