import type { Graph, GraphNode } from '../types';
import { getCSR } from './csr';
import { throwIfAborted } from './abort';
import { getSimpleUndirectedAdjacency } from './undirected';

export interface MaximalCliquesOptions {
  /** Abort signal, checked once per search step. Throws `signal.reason`. */
  signal?: AbortSignal;
}

interface CliqueFrame {
  clique: number[];
  candidates: Set<number>;
  excluded: Set<number>;
  branches: number[];
  next: number;
}

/**
 * Lazily yields every maximal clique: every set of mutually adjacent nodes
 * that no other node extends. Nodes inside a clique follow `graph.nodes`
 * order; an isolated node is a clique of one.
 *
 * Edges are treated as undirected; parallel edges, self-loops, and dangling
 * edges are ignored. Bron–Kerbosch with Tomita pivoting, iterative (no
 * recursion limit). Worst case O(3^(n/3)), the maximum number of cliques.
 *
 * @example
 * ```ts
 * // a–b–c triangle plus c–d
 * getMaximalCliques(graph).map((clique) => clique.map((n) => n.id));
 * // [['a', 'b', 'c'], ['c', 'd']]
 * ```
 */
export function* genMaximalCliques<N>(
  graph: Graph<N>,
  options?: MaximalCliquesOptions,
): Generator<GraphNode<N>[]> {
  const { neighbors } = getSimpleUndirectedAdjacency(graph);
  const nodes = getCSR(graph).nodes as GraphNode<N>[];
  const n = nodes.length;
  if (n === 0) return;

  const createFrame = (
    clique: number[],
    candidates: Set<number>,
    excluded: Set<number>,
  ): CliqueFrame => {
    // Pivot: the node covering the most candidates; branch on the rest
    let pivot = -1;
    let pivotCover = -1;
    for (const set of [candidates, excluded]) {
      for (const u of set) {
        let cover = 0;
        if (neighbors[u].size < candidates.size) {
          for (const v of neighbors[u]) if (candidates.has(v)) cover++;
        } else {
          for (const v of candidates) if (neighbors[u].has(v)) cover++;
        }
        if (cover > pivotCover) {
          pivot = u;
          pivotCover = cover;
        }
      }
    }
    const branches = [...candidates].filter((v) => !neighbors[pivot].has(v));
    return { clique, candidates, excluded, branches, next: 0 };
  };

  const stack: CliqueFrame[] = [
    createFrame(
      [],
      new Set(Array.from({ length: n }, (_, i) => i)),
      new Set(),
    ),
  ];
  while (stack.length > 0) {
    throwIfAborted(options?.signal);
    const frame = stack[stack.length - 1];
    if (frame.next >= frame.branches.length) {
      stack.pop();
      continue;
    }
    const v = frame.branches[frame.next++];
    const clique = [...frame.clique, v];
    const candidates = new Set<number>();
    const excluded = new Set<number>();
    for (const u of neighbors[v]) {
      if (frame.candidates.has(u)) candidates.add(u);
      else if (frame.excluded.has(u)) excluded.add(u);
    }
    frame.candidates.delete(v);
    frame.excluded.add(v);
    if (candidates.size === 0) {
      if (excluded.size === 0) {
        yield clique.sort((a, b) => a - b).map((i) => nodes[i]);
      }
      continue;
    }
    stack.push(createFrame(clique, candidates, excluded));
  }
}

/**
 * Returns every maximal clique. Eager form of {@link genMaximalCliques}.
 */
export function getMaximalCliques<N>(
  graph: Graph<N>,
  options?: MaximalCliquesOptions,
): GraphNode<N>[][] {
  return [...genMaximalCliques(graph, options)];
}

/** Triangles through each node position, plus neighbor counts. */
function countTriangles(graph: Graph): {
  ids: string[];
  triangles: Float64Array;
  degree: Float64Array;
} {
  const { ids, neighbors } = getSimpleUndirectedAdjacency(graph);
  const n = ids.length;
  const triangles = new Float64Array(n);
  const degree = new Float64Array(n);
  for (let u = 0; u < n; u++) {
    degree[u] = neighbors[u].size;
    const higher = [...neighbors[u]].filter((v) => v > u);
    for (let i = 0; i < higher.length; i++) {
      const v = higher[i];
      for (let j = i + 1; j < higher.length; j++) {
        const w = higher[j];
        if (neighbors[v].has(w)) {
          triangles[u]++;
          triangles[v]++;
          triangles[w]++;
        }
      }
    }
  }
  return { ids, triangles, degree };
}

/**
 * Returns the number of triangles through each node, keyed by node id.
 * Edges are treated as undirected; parallel edges, self-loops, and dangling
 * edges are ignored. O(Σ deg²).
 *
 * @example
 * ```ts
 * // a–b–c triangle plus c–d
 * getTriangleCounts(graph); // { a: 1, b: 1, c: 1, d: 0 }
 * ```
 */
export function getTriangleCounts(graph: Graph): Record<string, number> {
  const { ids, triangles } = countTriangles(graph);
  const result: Record<string, number> = {};
  ids.forEach((id, i) => (result[id] = triangles[i]));
  return result;
}

/**
 * Returns the local clustering coefficient of each node, keyed by node id:
 * the fraction of pairs of its neighbors that are themselves adjacent
 * (`2T / (deg · (deg − 1))`, 0 below two neighbors). Same undirected
 * treatment as {@link getTriangleCounts}.
 */
export function getClusteringCoefficients(graph: Graph): Record<string, number> {
  const { ids, triangles, degree } = countTriangles(graph);
  const result: Record<string, number> = {};
  ids.forEach((id, i) => {
    const d = degree[i];
    result[id] = d < 2 ? 0 : (2 * triangles[i]) / (d * (d - 1));
  });
  return result;
}

/**
 * Returns the mean local clustering coefficient over all nodes (0 for an
 * empty graph). See {@link getClusteringCoefficients}.
 */
export function getAverageClustering(graph: Graph): number {
  const coefficients = Object.values(getClusteringCoefficients(graph));
  if (coefficients.length === 0) return 0;
  return coefficients.reduce((sum, c) => sum + c, 0) / coefficients.length;
}

/**
 * Returns the transitivity (global clustering coefficient): three times the
 * number of triangles divided by the number of connected triples. 0 when
 * there are no triples. Same undirected treatment as
 * {@link getTriangleCounts}.
 */
export function getTransitivity(graph: Graph): number {
  const { triangles, degree } = countTriangles(graph);
  let closed = 0;
  let triples = 0;
  for (let i = 0; i < triangles.length; i++) {
    closed += triangles[i];
    triples += (degree[i] * (degree[i] - 1)) / 2;
  }
  return triples === 0 ? 0 : closed / triples;
}
