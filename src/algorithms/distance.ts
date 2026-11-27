import type { Graph, GraphEdge, GraphNode } from '../types';
import { getCSR, type GraphCSR } from './csr';
import { throwIfAborted } from './abort';
import { MinPriorityQueue } from './shared';

export interface EccentricityOptions<E = any> {
  /**
   * Edge weight accessor. Omit for hop counts (BFS); pass it for weighted
   * distances (Dijkstra). Weights must be finite and non-negative.
   */
  getWeight?: (edge: GraphEdge<E>) => number;
  /** Abort signal, checked once per source node. Throws `signal.reason`. */
  signal?: AbortSignal;
}

/** Largest distance from position `s` to any node, or Infinity. */
function getEccentricityAt<E>(
  graph: Graph<any, E>,
  csr: GraphCSR,
  s: number,
  options: EccentricityOptions<E> | undefined,
  dist: Float64Array,
  queue: Int32Array,
): number {
  const n = csr.ids.length;
  dist.fill(Infinity);
  dist[s] = 0;
  let reached = 1;
  let max = 0;
  const getWeight = options?.getWeight;

  if (!getWeight) {
    queue[0] = s;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const u = queue[head++];
      const du = dist[u];
      if (du > max) max = du;
      for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
        const v = csr.outTargets[a];
        if (dist[v] === Infinity) {
          dist[v] = du + 1;
          queue[tail++] = v;
          reached++;
        }
      }
    }
    return reached === n ? max : Infinity;
  }

  const heap = new MinPriorityQueue<[number, number]>((a, b) => a[0] - b[0]);
  heap.push([0, s]);
  reached = 0;
  while (heap.size > 0) {
    const [du, u] = heap.pop()!;
    if (du > dist[u]) continue;
    reached++;
    if (du > max) max = du;
    for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
      const edge = graph.edges[csr.outEdgeIndex[a]];
      const weight = getWeight(edge);
      if (!Number.isFinite(weight) || weight < 0) {
        throw new Error(
          `Eccentricity: edge "${edge.id}" has weight ${weight}; weighted eccentricity requires finite, non-negative weights.`,
        );
      }
      const v = csr.outTargets[a];
      const dv = du + weight;
      if (dv < dist[v]) {
        dist[v] = dv;
        heap.push([dv, v]);
      }
    }
  }
  return reached === n ? max : Infinity;
}

/**
 * Returns the eccentricity of one node: the largest shortest-path distance
 * from it to any other node, following edge directions (non-directed edges
 * both ways). `Infinity` when some node is unreachable from it.
 *
 * Unknown ids return `undefined`.
 *
 * @example
 * ```ts
 * // a → b → c
 * getEccentricity(graph, 'a'); // 2
 * getEccentricity(graph, 'c'); // Infinity (reaches nothing)
 * ```
 */
export function getEccentricity<N, E>(
  graph: Graph<N, E>,
  nodeId: string,
  options?: EccentricityOptions<E>,
): number | undefined {
  const csr = getCSR(graph);
  const s = csr.indexOf.get(nodeId);
  if (s === undefined) return undefined;
  const n = csr.ids.length;
  return getEccentricityAt(
    graph,
    csr,
    s,
    options,
    new Float64Array(n),
    new Int32Array(n),
  );
}

/**
 * Returns the eccentricity of every node (see {@link getEccentricity}),
 * keyed by node id in `graph.nodes` order. One BFS (or Dijkstra with
 * `getWeight`) per node: O(n · (n + m)).
 */
export function getEccentricities<N, E>(
  graph: Graph<N, E>,
  options?: EccentricityOptions<E>,
): Record<string, number> {
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const dist = new Float64Array(n);
  const queue = new Int32Array(n);
  const result: Record<string, number> = {};
  for (let s = 0; s < n; s++) {
    throwIfAborted(options?.signal);
    result[csr.ids[s]] = getEccentricityAt(graph, csr, s, options, dist, queue);
  }
  return result;
}

function getExtremeEccentricity(
  eccentricities: Record<string, number>,
  pick: (a: number, b: number) => number,
): number | undefined {
  let result: number | undefined;
  for (const value of Object.values(eccentricities)) {
    result = result === undefined ? value : pick(result, value);
  }
  return result;
}

/**
 * Returns the diameter: the largest eccentricity. `Infinity` when the graph
 * is not (strongly) connected, `undefined` for an empty graph.
 *
 * @example
 * ```ts
 * // The worst-case number of transitions between any two states
 * getDiameter(machineGraph);
 * ```
 */
export function getDiameter<N, E>(
  graph: Graph<N, E>,
  options?: EccentricityOptions<E>,
): number | undefined {
  return getExtremeEccentricity(getEccentricities(graph, options), Math.max);
}

/**
 * Returns the radius: the smallest eccentricity. Finite when some node
 * reaches every other node (such as the root of a DAG). `undefined` for an
 * empty graph.
 */
export function getRadius<N, E>(
  graph: Graph<N, E>,
  options?: EccentricityOptions<E>,
): number | undefined {
  return getExtremeEccentricity(getEccentricities(graph, options), Math.min);
}

function getNodesWithEccentricity<N, E>(
  graph: Graph<N, E>,
  options: EccentricityOptions<E> | undefined,
  pick: (a: number, b: number) => number,
): GraphNode<N>[] {
  const eccentricities = getEccentricities(graph, options);
  const target = getExtremeEccentricity(eccentricities, pick);
  return graph.nodes.filter((node) => eccentricities[node.id] === target);
}

/**
 * Returns the center: nodes whose eccentricity equals the radius, in
 * `graph.nodes` order. If no node reaches every other node, every node has
 * infinite eccentricity and all nodes are returned.
 */
export function getCenter<N, E>(
  graph: Graph<N, E>,
  options?: EccentricityOptions<E>,
): GraphNode<N>[] {
  return getNodesWithEccentricity(graph, options, Math.min);
}

/**
 * Returns the periphery: nodes whose eccentricity equals the diameter, in
 * `graph.nodes` order. On a graph that is not (strongly) connected these are
 * the nodes that cannot reach every other node.
 */
export function getPeriphery<N, E>(
  graph: Graph<N, E>,
  options?: EccentricityOptions<E>,
): GraphNode<N>[] {
  return getNodesWithEccentricity(graph, options, Math.max);
}
