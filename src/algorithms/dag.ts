import type { EdgeConfig, Graph, GraphEdge, GraphNode, GraphPath } from '../types';
import { createGraph } from '../graph';
import { toEdgeConfig, toNodeConfig } from '../config';
import { getEdgeMode } from '../mode';
import { getCSR, getEdgeListInDegrees } from './csr';
import { getEffectiveModeKind } from './shared';
import { throwIfAborted } from './abort';

export interface TransitiveClosureOptions {
  /** Abort signal, checked once per source node. Throws `signal.reason`. */
  signal?: AbortSignal;
}

export interface LongestPathOptions<E = any> {
  /** Finite edge weight accessor. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<E>) => number;
}

/**
 * Returns a new graph with an edge from every node to every other node it
 * can reach (the transitive closure). Original nodes and edges are kept
 * unchanged; one edge is added for each reachable pair that has no direct
 * traversable edge yet.
 *
 * - Works on any graph, cyclic or not. Reachability follows edge directions,
 *   with non-directed edges traversable both ways.
 * - On a graph whose edges are all non-directed, one edge is added per
 *   unordered pair (each connected component becomes complete). Otherwise
 *   added edges are directed (with `mode: 'directed'` when the graph's
 *   default mode is not).
 * - No self-loops are added. Added edges get the id
 *   `closure:["<sourceId>","<targetId>"]` (suffixed with `#2`, `#3`, … if
 *   taken).
 *
 * Output can be quadratic in the node count.
 *
 * @example
 * ```ts
 * // a → b → c
 * getTransitiveClosure(graph).edges.map((e) => e.id);
 * // ['ab', 'bc', 'closure:["a","c"]']
 * ```
 */
export function getTransitiveClosure<N, E, G, P>(
  graph: Graph<N, E, G, P>,
  options?: TransitiveClosureOptions,
): Graph<N, E, G, P> {
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const undirected = getEffectiveModeKind(graph) === 'non-directed';
  const edgeIds = new Set(graph.edges.map((edge) => edge.id));
  const added: EdgeConfig<E>[] = [];
  const seen = new Int32Array(n).fill(-1);
  const direct = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);

  for (let s = 0; s < n; s++) {
    throwIfAborted(options?.signal);
    for (let a = csr.outOffsets[s]; a < csr.outOffsets[s + 1]; a++) {
      direct[csr.outTargets[a]] = s;
    }
    seen[s] = s;
    queue[0] = s;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const u = queue[head++];
      for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
        const v = csr.outTargets[a];
        if (seen[v] === s) continue;
        seen[v] = s;
        queue[tail++] = v;
        if (direct[v] === s || (undirected && v < s)) continue;
        const base = `closure:${JSON.stringify([csr.ids[s], csr.ids[v]])}`;
        let id = base;
        for (let k = 2; edgeIds.has(id); k++) id = `${base}#${k}`;
        edgeIds.add(id);
        const edge: EdgeConfig<E> = {
          id,
          sourceId: csr.ids[s],
          targetId: csr.ids[v],
        };
        if (!undirected && graph.mode !== 'directed') edge.mode = 'directed';
        added.push(edge);
      }
    }
  }

  return createGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    nodes: graph.nodes.map(toNodeConfig),
    edges: [...graph.edges.map(toEdgeConfig), ...added],
    data: graph.data,
    direction: graph.direction,
    style: graph.style,
  });
}

function assertDirected(graph: Graph, name: string): void {
  for (const edge of graph.edges) {
    const mode = getEdgeMode(graph, edge);
    if (mode !== 'directed') {
      throw new Error(
        `${name}: edge "${edge.id}" has effective mode "${mode}"; ${name} is only defined for directed acyclic graphs. Set edge.mode (or graph.mode) to 'directed'.`,
      );
    }
  }
}

/**
 * Returns the longest (heaviest) path in a directed acyclic graph: the
 * critical path of a workflow or schedule. `undefined` for an empty graph;
 * a single node with no edges is a path with no steps.
 *
 * Weights default to `edge.weight ?? 1` (so the default is the path with the
 * most edges) and may be negative. Ties keep the path found first in
 * topological order. Parallel edges use the heaviest one. Dangling edges
 * are ignored.
 *
 * DAG-only: throws when the graph has a cycle (self-loops included) or any
 * edge whose effective mode is not `'directed'`.
 *
 * @example
 * ```ts
 * // build → test → deploy, build → lint → deploy (lint weighs 5)
 * getLongestPath(graph)?.steps.map((step) => step.node.id);
 * // ['lint', 'deploy']
 * ```
 */
export function getLongestPath<N, E>(
  graph: Graph<N, E>,
  options?: LongestPathOptions<E>,
): GraphPath<N, E> | undefined {
  assertDirected(graph, 'getLongestPath');
  const getWeight =
    options?.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const csr = getCSR(graph);
  const n = csr.ids.length;
  if (n === 0) return undefined;

  // Kahn's algorithm over the CSR arcs (dangling edges have no arcs)
  const inDegree = new Int32Array(n);
  for (let a = 0; a < csr.outTargets.length; a++) inDegree[csr.outTargets[a]]++;
  const order = new Int32Array(n);
  let tail = 0;
  for (let i = 0; i < n; i++) if (inDegree[i] === 0) order[tail++] = i;
  const best = new Float64Array(n);
  const via = new Int32Array(n).fill(-1);
  for (let head = 0; head < tail; head++) {
    const u = order[head];
    for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
      const v = csr.outTargets[a];
      const edgeIndex = csr.outEdgeIndex[a];
      const weight = getWeight(graph.edges[edgeIndex] as GraphEdge<E>);
      if (!Number.isFinite(weight)) {
        throw new Error(
          `getLongestPath: edge "${graph.edges[edgeIndex].id}" has non-finite weight ${weight}`,
        );
      }
      const candidate = best[u] + weight;
      // best[v] starts at 0: the path that starts at v itself
      if (candidate > best[v]) {
        best[v] = candidate;
        via[v] = edgeIndex;
      }
      if (--inDegree[v] === 0) order[tail++] = v;
    }
  }
  if (tail < n) {
    throw new Error(
      'getLongestPath: the graph contains a cycle; longest paths are only defined for directed acyclic graphs. Use getCondensation to collapse cycles first.',
    );
  }

  let end = order[0];
  for (let k = 0; k < n; k++) {
    const v = order[k];
    if (best[v] > best[end]) end = v;
  }
  const steps: GraphPath<N, E>['steps'] = [];
  let current = end;
  while (via[current] !== -1) {
    const edge = graph.edges[via[current]] as GraphEdge<E>;
    steps.push({ edge, node: csr.nodes[current] as GraphNode<N> });
    current = csr.indexOf.get(edge.sourceId)!;
  }
  steps.reverse();
  return { source: csr.nodes[current] as GraphNode<N>, steps };
}

/**
 * Returns the nodes grouped into topological generations (layers): the
 * first generation has no predecessors, and every node sits one generation
 * after its latest predecessor. Nodes inside a generation keep `graph.nodes`
 * order. Useful for scheduling work in parallel stages or layering a DAG.
 *
 * Returns `null` when the graph has a cycle, with the same rules as
 * {@link getTopologicalSort}: a non-directed edge is mutual precedence, and
 * an edge from a missing (dangling) source still blocks its target.
 *
 * @example
 * ```ts
 * // a → c, b → c, c → d
 * getTopologicalGenerations(graph)?.map((layer) => layer.map((n) => n.id));
 * // [['a', 'b'], ['c'], ['d']]
 * ```
 */
export function getTopologicalGenerations<N>(
  graph: Graph<N>,
): GraphNode<N>[][] | null {
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const inDegree = getEdgeListInDegrees(graph, csr).slice();
  if (csr.hasNonDirected) {
    for (const edge of graph.edges) {
      if (getEdgeMode(graph, edge) === 'directed') continue;
      const s = csr.indexOf.get(edge.sourceId);
      if (s !== undefined) inDegree[s]++;
    }
  }

  const generations: GraphNode<N>[][] = [];
  let layer: number[] = [];
  for (let i = 0; i < n; i++) if (inDegree[i] === 0) layer.push(i);
  let placed = 0;
  while (layer.length > 0) {
    generations.push(layer.map((i) => csr.nodes[i] as GraphNode<N>));
    placed += layer.length;
    const next: number[] = [];
    for (const u of layer) {
      for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
        const v = csr.outTargets[a];
        if (--inDegree[v] === 0) next.push(v);
      }
    }
    layer = next.sort((a, b) => a - b);
  }
  return placed === n ? generations : null;
}
