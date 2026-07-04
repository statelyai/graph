import type { Graph, GraphEdge } from '../types';
import { getEdgeMode } from '../mode';
import { getConnectedComponents } from './traversal';
import { getAllPairsShortestPaths } from './paths';

/** Result of a TSP tour approximation. */
export interface TSPTour {
  /** Node ids in visiting order; the tour returns to `path[0]` (not repeated). */
  path: string[];
  /** Total weight of the closed tour, using the metric closure. */
  cost: number;
}

/** Options for {@link getTSPTour}. */
export interface TSPOptions<TEdgeData = any> {
  /**
   * `'greedy'` (default) — nearest-neighbor construction.
   * `'2opt'` — nearest-neighbor followed by bounded 2-opt improvement.
   */
  method?: 'greedy' | '2opt';
  /** Node id to start the tour from. Default: first node. */
  from?: string;
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
}

/**
 * Approximate a shortest closed tour visiting every node exactly once
 * (Travelling Salesman Problem) on a weighted, undirected graph.
 *
 * The graph need not be complete: missing pairwise distances are filled in via
 * the **metric closure** (all-pairs shortest-path distances), matching
 * networkx's `traveling_salesman_problem`. Edges are treated as undirected.
 *
 * Construction is nearest-neighbor (`'greedy'`); `'2opt'` additionally runs a
 * bounded 2-opt local search that never increases the tour cost, so its result
 * is always ≤ the greedy result.
 *
 * @returns `{ path, cost }`, or `undefined` if the graph is not connected
 *   (no finite tour exists) — a single-node graph returns a zero-cost tour.
 */
export function getTSPTour<N, E>(
  graph: Graph<N, E>,
  options?: TSPOptions<E>,
): TSPTour | undefined {
  const nodeIds = graph.nodes.map((node) => node.id);
  const count = nodeIds.length;
  if (count === 0) return { path: [], cost: 0 };
  if (count === 1) return { path: [nodeIds[0]], cost: 0 };

  // A finite tour exists only if the graph is connected.
  if (getConnectedComponents(graph).length > 1) return undefined;

  const getWeight =
    options?.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const method = options?.method ?? 'greedy';

  // Metric closure: dense all-pairs shortest-path distance matrix. Reusing the
  // repo's getAllPairsShortestPaths keeps directed/undirected + weight handling
  // consistent with every other path algorithm.
  const dist = buildDistanceMatrix(graph, nodeIds, getWeight);

  const startId = options?.from ?? nodeIds[0];
  let startIndex = nodeIds.indexOf(startId);
  if (startIndex === -1) startIndex = 0;

  let tour = nearestNeighborTour(dist, count, startIndex);
  if (method === '2opt') {
    tour = twoOptImprove(tour, dist);
  }

  return {
    path: tour.map((i) => nodeIds[i]),
    cost: tourCost(tour, dist),
  };
}

/**
 * Dense symmetric distance matrix over `nodeIds` using shortest-path distances
 * (metric closure). Direct edge weights are seeded first (respecting
 * undirected edges), then getAllPairsShortestPaths fills transitive distances.
 */
function buildDistanceMatrix<N, E>(
  graph: Graph<N, E>,
  nodeIds: string[],
  getWeight: (edge: GraphEdge<E>) => number,
): number[][] {
  const count = nodeIds.length;
  const indexOf = new Map<string, number>();
  for (let i = 0; i < count; i++) indexOf.set(nodeIds[i], i);

  const dist: number[][] = Array.from({ length: count }, () =>
    new Array<number>(count).fill(Infinity),
  );
  for (let i = 0; i < count; i++) dist[i][i] = 0;

  // Seed direct edges (undirected: both directions), keeping the minimum weight
  // when parallel edges exist.
  for (const edge of graph.edges) {
    const u = indexOf.get(edge.sourceId);
    const v = indexOf.get(edge.targetId);
    if (u === undefined || v === undefined || u === v) continue;
    const w = getWeight(edge as GraphEdge<E>);
    if (w < dist[u][v]) dist[u][v] = w;
    if (getEdgeMode(graph, edge) !== 'directed' && w < dist[v][u]) {
      dist[v][u] = w;
    }
  }

  // Fill the metric closure with all-pairs shortest paths. Each returned path
  // carries its accumulated distance via its steps' edge weights.
  const paths = getAllPairsShortestPaths(graph, { getWeight });
  for (const path of paths) {
    const source = indexOf.get(path.source.id);
    const last = path.steps.at(-1);
    if (source === undefined || last === undefined) continue;
    const target = indexOf.get(last.node.id);
    if (target === undefined) continue;
    let total = 0;
    for (const step of path.steps) total += getWeight(step.edge);
    if (total < dist[source][target]) dist[source][target] = total;
  }

  // Symmetrize: TSP treats the metric as undirected, so use the min of the two
  // directions for every pair.
  for (let i = 0; i < count; i++) {
    for (let j = i + 1; j < count; j++) {
      const best = Math.min(dist[i][j], dist[j][i]);
      dist[i][j] = best;
      dist[j][i] = best;
    }
  }

  return dist;
}

/** Nearest-neighbor tour starting at `start`. Returns a permutation of indices. */
function nearestNeighborTour(
  dist: number[][],
  count: number,
  start: number,
): number[] {
  const visited = new Uint8Array(count);
  const tour: number[] = [start];
  visited[start] = 1;
  let current = start;

  for (let step = 1; step < count; step++) {
    let next = -1;
    let best = Infinity;
    for (let j = 0; j < count; j++) {
      if (visited[j]) continue;
      if (dist[current][j] < best) {
        best = dist[current][j];
        next = j;
      }
    }
    if (next === -1) {
      // Disconnected metric (should not happen: connectivity is checked up
      // front) — fall back to any unvisited node to keep a valid permutation.
      for (let j = 0; j < count; j++) {
        if (!visited[j]) {
          next = j;
          break;
        }
      }
    }
    visited[next] = 1;
    tour.push(next);
    current = next;
  }

  return tour;
}

/** Closed-tour cost: sum of consecutive distances plus the return edge. */
function tourCost(tour: number[], dist: number[][]): number {
  let cost = 0;
  for (let i = 0; i < tour.length; i++) {
    const a = tour[i];
    const b = tour[(i + 1) % tour.length];
    cost += dist[a][b];
  }
  return cost;
}

/**
 * Bounded 2-opt local search: repeatedly reverse the tour segment between two
 * positions whenever doing so shortens the closed tour. Never increases cost,
 * so the result is always ≤ the input tour. Bounded by a fixed number of full
 * improvement sweeps to keep the running time predictable.
 */
function twoOptImprove(tour: number[], dist: number[][]): number[] {
  const count = tour.length;
  if (count < 4) return tour;

  const best = [...tour];
  const maxSweeps = 20;

  for (let sweep = 0; sweep < maxSweeps; sweep++) {
    let improved = false;

    for (let i = 0; i < count - 1; i++) {
      for (let j = i + 1; j < count; j++) {
        // Skip the degenerate reversal that touches the wrap-around edge for
        // i=0, j=count-1 (reverses the whole tour → no change).
        if (i === 0 && j === count - 1) continue;

        const a = best[i - 1 < 0 ? count - 1 : i - 1];
        const b = best[i];
        const c = best[j];
        const d = best[(j + 1) % count];

        // Reversing [i..j] replaces edges (a,b)+(c,d) with (a,c)+(b,d).
        const delta =
          dist[a][c] + dist[b][d] - (dist[a][b] + dist[c][d]);
        if (delta < -1e-12) {
          reverseSegment(best, i, j);
          improved = true;
        }
      }
    }

    if (!improved) break;
  }

  return best;
}

function reverseSegment(tour: number[], i: number, j: number): void {
  let lo = i;
  let hi = j;
  while (lo < hi) {
    const t = tour[lo];
    tour[lo] = tour[hi];
    tour[hi] = t;
    lo++;
    hi--;
  }
}
