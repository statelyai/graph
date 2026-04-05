import type {
  Graph,
  GraphNode,
  GraphEdge,
  GraphPath,
  GraphStep,
  PathOptions,
  SinglePathOptions,
  TraversalOptions,
  MSTOptions,
  AllPairsShortestPathsOptions,
  AStarOptions,
} from './types';
import { getIndex } from './indexing';
import { createGraph } from './graph';
export {
  getDegreeCentrality,
  getInDegreeCentrality,
  getOutDegreeCentrality,
  getClosenessCentrality,
  getBetweennessCentrality,
  getPageRank,
  getHITS,
  getEigenvectorCentrality,
} from './algorithms/centrality';
export type {
  IterativeCentralityOptions,
  HITSResult,
} from './algorithms/centrality';
export {
  getLabelPropagationCommunities,
  genGirvanNewmanCommunities,
  getGirvanNewmanCommunities,
  getGreedyModularityCommunities,
  getModularity,
} from './algorithms/community';
export type {
  GirvanNewmanOptions,
  LabelPropagationOptions,
} from './algorithms/community';
export {
  getBridges,
  getArticulationPoints,
  getBiconnectedComponents,
} from './algorithms/connectivity';
export { isIsomorphic } from './algorithms/isomorphism';
export type { IsomorphismOptions } from './algorithms/isomorphism';

// --- Traversal generators ---

/**
 * Breadth-first traversal generator yielding nodes level by level.
 *
 * **O(V + E)** time, **O(V)** space.
 *
 * @example
 * ```ts
 * import { createGraph, bfs } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }, { id: 'bc', sourceId: 'b', targetId: 'c' }],
 * });
 *
 * for (const node of bfs(graph, 'a')) {
 *   console.log(node.id); // 'a', 'b', 'c'
 * }
 * ```
 */
export function* bfs<N>(
  graph: Graph<N>,
  startId: string,
): Generator<GraphNode<N>> {
  const idx = getIndex(graph);
  const visited = new Set<string>();
  const queue: string[] = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const ni = idx.nodeById.get(id);
    if (ni === undefined) continue;
    yield graph.nodes[ni];

    for (const nId of getNeighborIds(graph, id)) {
      if (!visited.has(nId)) {
        visited.add(nId);
        queue.push(nId);
      }
    }
  }
}

/**
 * Depth-first traversal generator yielding nodes as visited.
 *
 * **O(V + E)** time, **O(V)** space.
 *
 * @example
 * ```ts
 * import { createGraph, dfs } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }, { id: 'bc', sourceId: 'b', targetId: 'c' }],
 * });
 *
 * for (const node of dfs(graph, 'a')) {
 *   console.log(node.id); // 'a', 'b', 'c'
 * }
 * ```
 */
export function* dfs<N>(
  graph: Graph<N>,
  startId: string,
): Generator<GraphNode<N>> {
  const idx = getIndex(graph);
  const visited = new Set<string>();
  const stack: string[] = [startId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const ni = idx.nodeById.get(id);
    if (ni === undefined) continue;
    yield graph.nodes[ni];

    for (const nId of getNeighborIds(graph, id)) {
      if (!visited.has(nId)) {
        stack.push(nId);
      }
    }
  }
}

function getNeighborIds(graph: Graph, nodeId: string): string[] {
  const idx = getIndex(graph);
  const ids: string[] = [];
  for (const eid of idx.outEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined) ids.push(graph.edges[ai].targetId);
  }
  if (graph.type === 'undirected') {
    for (const eid of idx.inEdges.get(nodeId) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai !== undefined) ids.push(graph.edges[ai].sourceId);
    }
  }
  return ids;
}

function getSuccessorIds(graph: Graph, nodeId: string): string[] {
  const idx = getIndex(graph);
  const edgeIds = idx.outEdges.get(nodeId) ?? [];
  return edgeIds.map((eid) => graph.edges[idx.edgeById.get(eid)!].targetId);
}

class MinPriorityQueue<T> {
  private items: T[] = [];

  constructor(private compare: (a: T, b: T) => number) {}

  get size(): number {
    return this.items.length;
  }

  push(item: T): void {
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop(): T | undefined {
    if (this.items.length === 0) return undefined;

    const first = this.items[0];
    const last = this.items.pop()!;

    if (this.items.length > 0) {
      this.items[0] = last;
      this.bubbleDown(0);
    }

    return first;
  }

  private bubbleUp(index: number): void {
    let current = index;
    while (current > 0) {
      const parent = Math.floor((current - 1) / 2);
      if (this.compare(this.items[current], this.items[parent]) >= 0) break;
      [this.items[current], this.items[parent]] = [
        this.items[parent],
        this.items[current],
      ];
      current = parent;
    }
  }

  private bubbleDown(index: number): void {
    let current = index;

    while (true) {
      const left = current * 2 + 1;
      const right = left + 1;
      let smallest = current;

      if (
        left < this.items.length &&
        this.compare(this.items[left], this.items[smallest]) < 0
      ) {
        smallest = left;
      }
      if (
        right < this.items.length &&
        this.compare(this.items[right], this.items[smallest]) < 0
      ) {
        smallest = right;
      }
      if (smallest === current) break;

      [this.items[current], this.items[smallest]] = [
        this.items[smallest],
        this.items[current],
      ];
      current = smallest;
    }
  }
}

// --- Graph properties ---

/**
 * Checks whether the graph contains no cycles.
 *
 * **O(V + E)** time.
 *
 * @example
 * ```ts
 * import { createGraph, isAcyclic } from '@statelyai/graph';
 *
 * const dag = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * isAcyclic(dag); // true
 * ```
 */
export function isAcyclic(graph: Graph): boolean {
  if (graph.type === 'undirected') {
    return isAcyclicUndirected(graph);
  }
  const WHITE = 0,
    GRAY = 1,
    BLACK = 2;
  const color = new Map<string, number>();
  for (const n of graph.nodes) color.set(n.id, WHITE);

  const hasCycle = (id: string): boolean => {
    color.set(id, GRAY);
    for (const nId of getSuccessorIds(graph, id)) {
      const c = color.get(nId);
      if (c === GRAY) return true;
      if (c === WHITE && hasCycle(nId)) return true;
    }
    color.set(id, BLACK);
    return false;
  };

  for (const n of graph.nodes) {
    if (color.get(n.id) === WHITE && hasCycle(n.id)) return false;
  }
  return true;
}

function isAcyclicUndirected(graph: Graph): boolean {
  const idx = getIndex(graph);
  const visited = new Set<string>();

  const hasCycle = (id: string, parentId: string | null): boolean => {
    visited.add(id);

    for (const eid of idx.outEdges.get(id) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const neighborId = graph.edges[ai].targetId;
      if (!visited.has(neighborId)) {
        if (hasCycle(neighborId, id)) return true;
      } else if (neighborId !== parentId) {
        return true;
      }
    }
    for (const eid of idx.inEdges.get(id) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const neighborId = graph.edges[ai].sourceId;
      if (!visited.has(neighborId)) {
        if (hasCycle(neighborId, id)) return true;
      } else if (neighborId !== parentId) {
        return true;
      }
    }

    return false;
  };

  for (const n of graph.nodes) {
    if (!visited.has(n.id) && hasCycle(n.id, null)) return false;
  }
  return true;
}

/**
 * Returns connected components as arrays of nodes.
 * Treats all edges as undirected for connectivity.
 *
 * **O(V + E)** time.
 *
 * @example
 * ```ts
 * import { createGraph, getConnectedComponents } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const components = getConnectedComponents(graph);
 * // [[nodeA, nodeB], [nodeC]]
 * ```
 */
export function getConnectedComponents<N>(graph: Graph<N>): GraphNode<N>[][] {
  const idx = getIndex(graph);
  const visited = new Set<string>();
  const components: GraphNode<N>[][] = [];

  for (const n of graph.nodes) {
    if (visited.has(n.id)) continue;
    const component: GraphNode<N>[] = [];
    const queue: string[] = [n.id];
    visited.add(n.id);

    while (queue.length > 0) {
      const id = queue.shift()!;
      const ni = idx.nodeById.get(id);
      if (ni !== undefined) component.push(graph.nodes[ni]);

      // Traverse all neighbors (both directions for any graph type)
      for (const eid of idx.outEdges.get(id) ?? []) {
        const ai = idx.edgeById.get(eid);
        if (ai === undefined) continue;
        const neighborId = graph.edges[ai].targetId;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
      for (const eid of idx.inEdges.get(id) ?? []) {
        const ai = idx.edgeById.get(eid);
        if (ai === undefined) continue;
        const neighborId = graph.edges[ai].sourceId;
        if (!visited.has(neighborId)) {
          visited.add(neighborId);
          queue.push(neighborId);
        }
      }
    }

    components.push(component);
  }

  return components;
}

/**
 * Returns a topological ordering of nodes, or `null` if the graph is cyclic.
 *
 * **O(V + E)** time (Kahn's algorithm).
 *
 * @example
 * ```ts
 * import { createGraph, getTopologicalSort } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 *
 * const sorted = getTopologicalSort(graph);
 * // [nodeA, nodeB, nodeC]
 * ```
 */
export function getTopologicalSort<N>(graph: Graph<N>): GraphNode<N>[] | null {
  const idx = getIndex(graph);
  const inDeg = new Map<string, number>();
  for (const n of graph.nodes) inDeg.set(n.id, 0);
  for (const e of graph.edges) {
    inDeg.set(e.targetId, (inDeg.get(e.targetId) ?? 0) + 1);
  }

  const queue: string[] = [];
  for (const [id, deg] of inDeg) {
    if (deg === 0) queue.push(id);
  }

  const result: GraphNode<N>[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    const ni = idx.nodeById.get(id);
    if (ni !== undefined) result.push(graph.nodes[ni]);

    for (const eid of idx.outEdges.get(id) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const targetId = graph.edges[ai].targetId;
      const newDeg = (inDeg.get(targetId) ?? 1) - 1;
      inDeg.set(targetId, newDeg);
      if (newDeg === 0) queue.push(targetId);
    }
  }

  if (result.length !== graph.nodes.length) return null;
  return result;
}

/**
 * Checks whether a path exists between two nodes.
 *
 * **O(V + E)** time (BFS) or **O((V + E) log V)** (Dijkstra when weighted).
 *
 * @example
 * ```ts
 * import { createGraph, hasPath } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * hasPath(graph, 'a', 'b'); // true
 * hasPath(graph, 'a', 'c'); // false
 * ```
 */
export function hasPath(
  graph: Graph,
  sourceId: string,
  targetId: string,
): boolean {
  return getShortestPaths(graph, { from: sourceId, to: targetId }).length > 0;
}

/**
 * Checks whether the graph is connected (all nodes reachable from any node).
 *
 * **O(V + E)** time.
 *
 * @example
 * ```ts
 * import { createGraph, isConnected } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * isConnected(graph); // true
 * ```
 */
export function isConnected(graph: Graph): boolean {
  if (graph.nodes.length === 0) return true;
  const components = getConnectedComponents(graph);
  return components.length <= 1;
}

/**
 * Checks whether the graph is a tree (connected and acyclic).
 *
 * **O(V + E)** time.
 *
 * @example
 * ```ts
 * import { createGraph, isTree } from '@statelyai/graph';
 *
 * const tree = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'ac', sourceId: 'a', targetId: 'c' },
 *   ],
 * });
 *
 * isTree(tree); // true
 * ```
 */
export function isTree(graph: Graph): boolean {
  return isConnected(graph) && isAcyclic(graph);
}

// --- Path enumeration ---

/** Resolve the `from` node ID from opts or graph defaults. */
function resolveFrom(graph: Graph, opts?: PathOptions): string {
  if (opts?.from) return opts.from;
  if (graph.initialNodeId) return graph.initialNodeId;

  // Find sole node with inDegree 0
  const inDeg = new Map<string, number>();
  for (const n of graph.nodes) inDeg.set(n.id, 0);
  for (const e of graph.edges) {
    inDeg.set(e.targetId, (inDeg.get(e.targetId) ?? 0) + 1);
  }
  const roots = [...inDeg.entries()]
    .filter(([, d]) => d === 0)
    .map(([id]) => id);
  if (roots.length === 1) return roots[0];

  throw new Error(
    'Cannot determine start node — provide opts.from or set graph.initialNodeId',
  );
}

/** Get neighbor IDs with their connecting edges. */
function getNeighborEdges(
  graph: Graph,
  nodeId: string,
): Array<{ neighborId: string; edge: GraphEdge }> {
  const idx = getIndex(graph);
  const result: Array<{ neighborId: string; edge: GraphEdge }> = [];
  for (const eid of idx.outEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined) {
      const e = graph.edges[ai];
      result.push({ neighborId: e.targetId, edge: e });
    }
  }
  if (graph.type === 'undirected') {
    for (const eid of idx.inEdges.get(nodeId) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai !== undefined) {
        const e = graph.edges[ai];
        result.push({ neighborId: e.sourceId, edge: e });
      }
    }
  }
  return result;
}

/**
 * Returns all shortest paths from a source node.
 * Returns all paths of equal minimum length per target (not just one).
 * Uses BFS when all edges are unweighted; Dijkstra otherwise.
 */
/** Compute distance + prev maps via BFS, Dijkstra, or Bellman-Ford. */
function computeShortestDistances<N, E>(
  graph: Graph<N, E>,
  sourceId: string,
  getWeight?: (edge: GraphEdge<E>) => number,
  algorithm?: 'dijkstra' | 'bellman-ford',
): {
  dist: Map<string, number>;
  prev: Map<string, Array<{ from: string; edge: GraphEdge<E> }>>;
} {
  if (algorithm === 'bellman-ford') {
    return bellmanFord(graph, sourceId, getWeight);
  }

  const dist = new Map<string, number>();
  const prev = new Map<string, Array<{ from: string; edge: GraphEdge<E> }>>();

  dist.set(sourceId, 0);
  prev.set(sourceId, []);

  // Use BFS fast path only when no explicit getWeight AND no edges have weight set
  const useBFS = !getWeight && !graph.edges.some((e) => e.weight !== undefined);

  if (useBFS) {
    const queue: string[] = [sourceId];

    while (queue.length > 0) {
      const id = queue.shift()!;
      const d = dist.get(id)!;

      for (const { neighborId, edge } of getNeighborEdges(graph, id)) {
        const newDist = d + 1;
        const existing = dist.get(neighborId);

        if (existing === undefined) {
          dist.set(neighborId, newDist);
          prev.set(neighborId, [{ from: id, edge: edge as GraphEdge<E> }]);
          queue.push(neighborId);
        } else if (existing === newDist) {
          prev.get(neighborId)!.push({ from: id, edge: edge as GraphEdge<E> });
        }
      }
    }
  } else {
    const effectiveWeight = getWeight ?? ((e: GraphEdge<E>) => e.weight ?? 1);
    const visited = new Set<string>();
    const pq = new MinPriorityQueue<{ id: string; dist: number }>(
      (a, b) => a.dist - b.dist,
    );
    pq.push({ id: sourceId, dist: 0 });

    while (pq.size > 0) {
      const current = pq.pop()!;
      const { id, dist: d } = current;

      if (visited.has(id) || d !== dist.get(id)) continue;
      visited.add(id);

      for (const { neighborId, edge } of getNeighborEdges(graph, id)) {
        const w = effectiveWeight(edge as GraphEdge<E>);
        const newDist = d + w;
        const existing = dist.get(neighborId);

        if (existing === undefined || newDist < existing) {
          dist.set(neighborId, newDist);
          prev.set(neighborId, [{ from: id, edge: edge as GraphEdge<E> }]);
          pq.push({ id: neighborId, dist: newDist });
        } else if (existing === newDist) {
          prev.get(neighborId)!.push({ from: id, edge: edge as GraphEdge<E> });
        }
      }
    }
  }

  return { dist, prev };
}

/**
 * Bellman-Ford single-source shortest paths.
 * **O(VE)** time. Handles negative edge weights.
 * Throws if a negative-weight cycle is reachable from the source.
 */
function bellmanFord<N, E>(
  graph: Graph<N, E>,
  sourceId: string,
  getWeight?: (edge: GraphEdge<E>) => number,
): {
  dist: Map<string, number>;
  prev: Map<string, Array<{ from: string; edge: GraphEdge<E> }>>;
} {
  const dist = new Map<string, number>();
  const prev = new Map<string, Array<{ from: string; edge: GraphEdge<E> }>>();
  const effectiveWeight = getWeight ?? ((e: GraphEdge<E>) => e.weight ?? 1);
  const isUndirected = graph.type === 'undirected';

  // Initialize
  for (const node of graph.nodes) {
    dist.set(node.id, Infinity);
    prev.set(node.id, []);
  }
  dist.set(sourceId, 0);

  const V = graph.nodes.length;

  // Build directed edge list (expand undirected edges into both directions)
  const directedEdges: Array<{
    fromId: string;
    toId: string;
    edge: GraphEdge<E>;
  }> = [];
  for (const edge of graph.edges) {
    directedEdges.push({
      fromId: edge.sourceId,
      toId: edge.targetId,
      edge: edge as GraphEdge<E>,
    });
    if (isUndirected) {
      directedEdges.push({
        fromId: edge.targetId,
        toId: edge.sourceId,
        edge: edge as GraphEdge<E>,
      });
    }
  }

  // Relax edges V-1 times
  for (let i = 0; i < V - 1; i++) {
    let changed = false;
    for (const { fromId, toId, edge } of directedEdges) {
      const d = dist.get(fromId)!;
      if (d === Infinity) continue;
      const w = effectiveWeight(edge);
      const newDist = d + w;
      const existing = dist.get(toId)!;

      if (newDist < existing) {
        dist.set(toId, newDist);
        prev.set(toId, [{ from: fromId, edge }]);
        changed = true;
      } else if (newDist === existing && existing !== Infinity) {
        const preds = prev.get(toId)!;
        if (!preds.some((p) => p.from === fromId && p.edge === edge)) {
          preds.push({ from: fromId, edge });
        }
      }
    }
    // Early exit if no relaxation occurred
    if (!changed) break;
  }

  // Check for negative cycles
  for (const { fromId, toId, edge } of directedEdges) {
    const d = dist.get(fromId)!;
    if (d === Infinity) continue;
    const w = effectiveWeight(edge);
    if (d + w < dist.get(toId)!) {
      throw new Error(
        'Graph contains a negative-weight cycle reachable from the source node',
      );
    }
  }

  // Remove unreachable nodes
  for (const [id, d] of dist) {
    if (d === Infinity) {
      dist.delete(id);
      prev.delete(id);
    }
  }

  return { dist, prev };
}

/** Reconstruct all shortest paths to a target by backtracking through prev map. */
function* reconstructPaths<N, E>(
  graph: Graph<N, E>,
  prev: Map<string, Array<{ from: string; edge: GraphEdge<E> }>>,
  sourceNode: GraphNode<N>,
  targetId: string,
): Generator<GraphPath<N, E>> {
  if (targetId === sourceNode.id) {
    yield { source: sourceNode, steps: [] };
    return;
  }

  const preds = prev.get(targetId);
  if (!preds || preds.length === 0) return;

  const idx = getIndex(graph);
  const targetNi = idx.nodeById.get(targetId);
  const targetNode =
    targetNi !== undefined
      ? graph.nodes[targetNi]
      : graph.nodes.find((n) => n.id === targetId)!;

  for (const { from, edge } of preds) {
    for (const prefix of reconstructPaths(graph, prev, sourceNode, from)) {
      yield {
        source: sourceNode,
        steps: [...prefix.steps, { edge, node: targetNode }],
      };
    }
  }
}

/**
 * Lazily yields all shortest paths from a source node.
 * Use `getShortestPaths` for the full array.
 *
 * **O(V + E)** time (BFS) or **O((V + E) log V)** (Dijkstra when weighted),
 * plus **O(P)** per path yielded where P is the path length.
 *
 * @example
 * ```ts
 * import { createGraph, genShortestPaths } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * for (const path of genShortestPaths(graph)) {
 *   console.log(path.steps.map(s => s.node.id));
 * }
 * ```
 */
export function* genShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): Generator<GraphPath<N, E>> {
  const idx = getIndex(graph);
  const sourceId = resolveFrom(graph, opts);
  const { dist, prev } = computeShortestDistances(
    graph,
    sourceId,
    opts?.getWeight,
    opts?.algorithm,
  );

  const targets = opts?.to
    ? [opts.to].filter((id) => dist.has(id))
    : [...dist.keys()].filter((id) => id !== sourceId);

  const sourceNi = idx.nodeById.get(sourceId);
  const sourceNode =
    sourceNi !== undefined
      ? graph.nodes[sourceNi]
      : graph.nodes.find((n) => n.id === sourceId)!;

  for (const targetId of targets) {
    yield* reconstructPaths<N, E>(graph, prev, sourceNode, targetId);
  }
}

/**
 * Returns all shortest paths from a source node as an array.
 * Delegates to `genShortestPaths` internally.
 *
 * **O(V + E)** time (BFS) or **O((V + E) log V)** (Dijkstra when weighted).
 *
 * @example
 * ```ts
 * import { createGraph, getShortestPaths } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * const paths = getShortestPaths(graph);
 * // paths to 'b' and 'c' from 'a'
 * ```
 */
export function getShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): GraphPath<N, E>[] {
  return [...genShortestPaths(graph, opts)];
}

/**
 * Returns a single shortest path from source to target, or `undefined` if unreachable.
 *
 * **O(V + E)** time (BFS) or **O((V + E) log V)** (Dijkstra when weighted).
 *
 * @example
 * ```ts
 * import { createGraph, getShortestPath } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * const path = getShortestPath(graph, { to: 'c' });
 * // path.steps -> [{node: nodeB, edge: ...}, {node: nodeC, edge: ...}]
 * ```
 */
export function getShortestPath<N, E>(
  graph: Graph<N, E>,
  opts: SinglePathOptions<E>,
): GraphPath<N, E> | undefined {
  for (const path of genShortestPaths(graph, opts)) {
    return path;
  }
  return undefined;
}

/**
 * Returns all simple (acyclic) paths from a source node as an array.
 * Delegates to `genSimplePaths` internally.
 *
 * **O(V!)** worst-case (exponential in dense graphs).
 *
 * @example
 * ```ts
 * import { createGraph, getSimplePaths } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *     { id: 'ac', sourceId: 'a', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * const paths = getSimplePaths(graph, { to: 'c' });
 * // two paths: a->b->c and a->c
 * ```
 */
export function getSimplePaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): GraphPath<N, E>[] {
  return [...genSimplePaths(graph, opts)];
}

/**
 * Lazily yields all simple (acyclic) paths from a source node via DFS backtracking.
 * Use `getSimplePaths` for the full array.
 *
 * **O(V!)** worst-case (exponential in dense graphs).
 *
 * @example
 * ```ts
 * import { createGraph, genSimplePaths } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *     { id: 'ac', sourceId: 'a', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * for (const path of genSimplePaths(graph, { to: 'c' })) {
 *   console.log(path.steps.map(s => s.node.id));
 *   // ['b', 'c'] or ['c']
 * }
 * ```
 */
export function* genSimplePaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): Generator<GraphPath<N, E>> {
  const idx = getIndex(graph);
  const sourceId = resolveFrom(graph, opts);
  const sourceNi = idx.nodeById.get(sourceId);
  const sourceNode =
    sourceNi !== undefined
      ? graph.nodes[sourceNi]
      : graph.nodes.find((n) => n.id === sourceId)!;
  const targetId = opts?.to;
  const visited = new Set<string>();
  const currentSteps: GraphStep<N, E>[] = [];

  function* dfsCollect(nodeId: string): Generator<GraphPath<N, E>> {
    visited.add(nodeId);

    if (targetId !== undefined) {
      if (nodeId === targetId) {
        yield { source: sourceNode, steps: [...currentSteps] };
        visited.delete(nodeId);
        return;
      }
    } else if (currentSteps.length > 0) {
      yield { source: sourceNode, steps: [...currentSteps] };
    }

    for (const { neighborId, edge } of getNeighborEdges(graph, nodeId)) {
      if (!visited.has(neighborId)) {
        const neighborNi = idx.nodeById.get(neighborId);
        const neighborNode =
          neighborNi !== undefined
            ? graph.nodes[neighborNi]
            : graph.nodes.find((n) => n.id === neighborId)!;
        currentSteps.push({ edge: edge as GraphEdge<E>, node: neighborNode });
        yield* dfsCollect(neighborId);
        currentSteps.pop();
      }
    }

    visited.delete(nodeId);
  }

  yield* dfsCollect(sourceId);
}

/**
 * Returns a single simple (acyclic) path from source to target, or `undefined` if unreachable.
 *
 * **O(V + E)** typical, **O(V!)** worst-case.
 *
 * @example
 * ```ts
 * import { createGraph, getSimplePath } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * const path = getSimplePath(graph, { to: 'c' });
 * // path.steps -> [{node: nodeB, edge: ...}, {node: nodeC, edge: ...}]
 * ```
 */
export function getSimplePath<N, E>(
  graph: Graph<N, E>,
  opts: SinglePathOptions<E>,
): GraphPath<N, E> | undefined {
  // Use genSimplePaths to get the first result
  for (const path of genSimplePaths(graph, opts)) {
    return path;
  }
  return undefined;
}

// Strongly connected components (Tarjan's)

/**
 * Returns strongly connected components using Tarjan's algorithm.
 * Only meaningful for directed graphs.
 *
 * **O(V + E)** time.
 *
 * @example
 * ```ts
 * import { createGraph, getStronglyConnectedComponents } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'ba', sourceId: 'b', targetId: 'a' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 *
 * const sccs = getStronglyConnectedComponents(graph);
 * // [[nodeA, nodeB], [nodeC]]
 * ```
 */
export function getStronglyConnectedComponents<N>(
  graph: Graph<N>,
): GraphNode<N>[][] {
  const idx = getIndex(graph);
  let indexCounter = 0;
  const nodeIndex = new Map<string, number>();
  const lowlink = new Map<string, number>();
  const onStack = new Set<string>();
  const stack: string[] = [];
  const result: GraphNode<N>[][] = [];

  function strongconnect(id: string): void {
    nodeIndex.set(id, indexCounter);
    lowlink.set(id, indexCounter);
    indexCounter++;
    stack.push(id);
    onStack.add(id);

    for (const eid of idx.outEdges.get(id) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const wId = graph.edges[ai].targetId;

      if (!nodeIndex.has(wId)) {
        strongconnect(wId);
        lowlink.set(id, Math.min(lowlink.get(id)!, lowlink.get(wId)!));
      } else if (onStack.has(wId)) {
        lowlink.set(id, Math.min(lowlink.get(id)!, nodeIndex.get(wId)!));
      }
    }

    if (lowlink.get(id) === nodeIndex.get(id)) {
      const component: GraphNode<N>[] = [];
      let wId: string;
      do {
        wId = stack.pop()!;
        onStack.delete(wId);
        const ni = idx.nodeById.get(wId);
        if (ni !== undefined) component.push(graph.nodes[ni]);
      } while (wId !== id);
      result.push(component);
    }
  }

  for (const n of graph.nodes) {
    if (!nodeIndex.has(n.id)) strongconnect(n.id);
  }

  return result;
}

// Cycle detection — all elementary cycles

/**
 * Returns all elementary cycles as an array of paths.
 * Delegates to `genCycles` internally.
 *
 * **O((V + E) · C)** where C is the number of elementary cycles (can be exponential).
 *
 * @example
 * ```ts
 * import { createGraph, getCycles } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'ba', sourceId: 'b', targetId: 'a' },
 *   ],
 * });
 *
 * const cycles = getCycles(graph);
 * // one cycle: a -> b -> a
 * ```
 */
export function getCycles<N, E>(graph: Graph<N, E>): GraphPath<N, E>[] {
  return [...genCycles(graph)];
}

/**
 * Lazily yields elementary cycles one at a time.
 * Use `getCycles` for the full array.
 *
 * **O((V + E) · C)** where C is the number of elementary cycles (can be exponential).
 *
 * @example
 * ```ts
 * import { createGraph, genCycles } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'ba', sourceId: 'b', targetId: 'a' },
 *   ],
 * });
 *
 * for (const cycle of genCycles(graph)) {
 *   console.log(cycle.steps.map(s => s.node.id)); // ['b', 'a']
 * }
 * ```
 */
export function* genCycles<N, E>(
  graph: Graph<N, E>,
): Generator<GraphPath<N, E>> {
  if (graph.type === 'undirected') {
    yield* genCyclesUndirected(graph);
  } else {
    yield* genCyclesDirected(graph);
  }
}

function* genCyclesDirected<N, E>(
  graph: Graph<N, E>,
): Generator<GraphPath<N, E>> {
  const idx = getIndex(graph);
  const sortedIds = graph.nodes.map((n) => n.id).sort();

  for (let si = 0; si < sortedIds.length; si++) {
    const startId = sortedIds[si];
    const allowed = new Set(sortedIds.slice(si));
    const visited = new Set<string>();
    const steps: GraphStep<N, E>[] = [];
    const startNi = idx.nodeById.get(startId)!;
    const startNode = graph.nodes[startNi];
    const found: GraphPath<N, E>[] = [];

    function dfsFind(currentId: string): void {
      visited.add(currentId);

      for (const eid of idx.outEdges.get(currentId) ?? []) {
        const ai = idx.edgeById.get(eid);
        if (ai === undefined) continue;
        const e = graph.edges[ai];
        const neighborId = e.targetId;

        if (
          neighborId === startId &&
          (steps.length > 0 || currentId === startId)
        ) {
          found.push({
            source: startNode,
            steps: [...steps, { edge: e as GraphEdge<E>, node: startNode }],
          });
        } else if (allowed.has(neighborId) && !visited.has(neighborId)) {
          const ni = idx.nodeById.get(neighborId)!;
          steps.push({ edge: e as GraphEdge<E>, node: graph.nodes[ni] });
          dfsFind(neighborId);
          steps.pop();
        }
      }

      visited.delete(currentId);
    }

    dfsFind(startId);
    yield* found;
  }
}

function* genCyclesUndirected<N, E>(
  graph: Graph<N, E>,
): Generator<GraphPath<N, E>> {
  const idx = getIndex(graph);
  const sortedIds = graph.nodes.map((n) => n.id).sort();
  const seen = new Set<string>();

  for (let si = 0; si < sortedIds.length; si++) {
    const startId = sortedIds[si];
    const allowed = new Set(sortedIds.slice(si));
    const visited = new Set<string>();
    const steps: GraphStep<N, E>[] = [];
    const startNi = idx.nodeById.get(startId)!;
    const startNode = graph.nodes[startNi];
    const found: GraphPath<N, E>[] = [];

    function dfsFind(currentId: string, parentId: string | null): void {
      visited.add(currentId);

      for (const { neighborId, edge } of getNeighborEdgesAll(
        graph,
        currentId,
      )) {
        if (neighborId === parentId) {
          parentId = null;
          continue;
        }

        if (neighborId === startId && steps.length >= 2) {
          const innerIds = steps
            .map((s) => s.node.id)
            .sort()
            .join(',');
          if (!seen.has(innerIds)) {
            seen.add(innerIds);
            found.push({
              source: startNode,
              steps: [
                ...steps,
                { edge: edge as GraphEdge<E>, node: startNode },
              ],
            });
          }
        } else if (allowed.has(neighborId) && !visited.has(neighborId)) {
          const ni = idx.nodeById.get(neighborId)!;
          steps.push({ edge: edge as GraphEdge<E>, node: graph.nodes[ni] });
          dfsFind(neighborId, currentId);
          steps.pop();
        }
      }

      visited.delete(currentId);
    }

    dfsFind(startId, null);
    yield* found;
  }
}

// getCyclesDirected and getCyclesUndirected removed — genCycles replaces them.

/** Like getNeighborEdges but always includes both directions (for undirected cycle finding). */
function getNeighborEdgesAll(
  graph: Graph,
  nodeId: string,
): Array<{ neighborId: string; edge: GraphEdge }> {
  const idx = getIndex(graph);
  const result: Array<{ neighborId: string; edge: GraphEdge }> = [];
  for (const eid of idx.outEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined) {
      const e = graph.edges[ai];
      result.push({ neighborId: e.targetId, edge: e });
    }
  }
  for (const eid of idx.inEdges.get(nodeId) ?? []) {
    const ai = idx.edgeById.get(eid);
    if (ai !== undefined) {
      const e = graph.edges[ai];
      result.push({ neighborId: e.sourceId, edge: e });
    }
  }
  return result;
}

// Single canonical DFS orderings

/**
 * Returns a single canonical preorder (DFS visit-order) sequence.
 * Visits neighbors in the order they appear in the adjacency list.
 *
 * **O(V + E)** time.
 *
 * @example
 * ```ts
 * import { createGraph, getPreorder } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * const order = getPreorder(graph);
 * // [nodeA, nodeB, nodeC]
 * ```
 */
export function getPreorder<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const startId = resolveFrom(graph, opts);
  const startNi = idx.nodeById.get(startId);
  if (startNi === undefined) return [];

  const visited = new Set<string>([startId]);
  const result: GraphNode<N>[] = [graph.nodes[startNi]];
  const stack = [startId];

  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const next = getNeighborIds(graph, top).find((id) => !visited.has(id));

    if (next === undefined) {
      stack.pop();
      continue;
    }

    visited.add(next);
    stack.push(next);
    const ni = idx.nodeById.get(next);
    if (ni !== undefined) result.push(graph.nodes[ni]);
  }

  return result;
}

/**
 * Returns a single canonical postorder (DFS finish-order) sequence.
 * Visits neighbors in the order they appear in the adjacency list.
 *
 * **O(V + E)** time.
 *
 * @example
 * ```ts
 * import { createGraph, getPostorder } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * const order = getPostorder(graph);
 * // [nodeC, nodeB, nodeA]
 * ```
 */
export function getPostorder<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): GraphNode<N>[] {
  const idx = getIndex(graph);
  const startId = resolveFrom(graph, opts);
  const startNi = idx.nodeById.get(startId);
  if (startNi === undefined) return [];

  const visited = new Set<string>([startId]);
  const result: GraphNode<N>[] = [];
  const stack = [startId];

  while (stack.length > 0) {
    const top = stack[stack.length - 1];
    const next = getNeighborIds(graph, top).find((id) => !visited.has(id));

    if (next === undefined) {
      stack.pop();
      const ni = idx.nodeById.get(top);
      if (ni !== undefined) result.push(graph.nodes[ni]);
      continue;
    }

    visited.add(next);
    stack.push(next);
  }

  return result;
}

// Traversal order enumeration — all possible DFS orderings (generators)

/**
 * Returns all possible preorder sequences as an array. Can be exponential -- prefer `genPreorders`.
 *
 * **O(V! · V)** worst-case (exponential).
 *
 * @example
 * ```ts
 * import { createGraph, getPreorders } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'ac', sourceId: 'a', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * const allOrders = getPreorders(graph);
 * // [[nodeA, nodeB, nodeC], [nodeA, nodeC, nodeB]]
 * ```
 */
export function getPreorders<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): GraphNode<N>[][] {
  return [...genPreorders(graph, opts)];
}

/**
 * Returns all possible postorder sequences as an array. Can be exponential -- prefer `genPostorders`.
 *
 * **O(V! · V)** worst-case (exponential).
 *
 * @example
 * ```ts
 * import { createGraph, getPostorders } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'ac', sourceId: 'a', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * const allOrders = getPostorders(graph);
 * // [[nodeB, nodeC, nodeA], [nodeC, nodeB, nodeA]]
 * ```
 */
export function getPostorders<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): GraphNode<N>[][] {
  return [...genPostorders(graph, opts)];
}

/**
 * Lazily yields all possible preorder (DFS visit-order) sequences.
 * Different neighbor exploration orders yield different sequences.
 * Use `getPreorder()` for a single canonical ordering.
 *
 * **O(V! · V)** worst-case (exponential).
 *
 * @example
 * ```ts
 * import { createGraph, genPreorders } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'ac', sourceId: 'a', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * for (const order of genPreorders(graph)) {
 *   console.log(order.map(n => n.id));
 *   // ['a', 'b', 'c'] or ['a', 'c', 'b']
 * }
 * ```
 */
export function* genPreorders<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): Generator<GraphNode<N>[]> {
  const idx = getIndex(graph);
  const startId = resolveFrom(graph, opts);
  const startNi = idx.nodeById.get(startId);
  const startNode = startNi !== undefined ? graph.nodes[startNi] : undefined;
  if (!startNode) return;

  // Iterative stack-based enumeration with explicit continuation frames
  type Frame = {
    visited: Set<string>;
    preorder: GraphNode<N>[];
    dfsStack: string[];
  };

  const queue: Frame[] = [
    { visited: new Set([startId]), preorder: [startNode], dfsStack: [startId] },
  ];

  while (queue.length > 0) {
    const frame = queue.pop()!;
    const { visited, dfsStack } = frame;
    let { preorder } = frame;

    // Advance this DFS until we hit a branch point or finish
    let branched = false;
    while (dfsStack.length > 0) {
      const top = dfsStack[dfsStack.length - 1];
      const unvisited = getNeighborIds(graph, top).filter(
        (id) => !visited.has(id),
      );

      if (unvisited.length === 0) {
        dfsStack.pop();
        continue;
      }

      // Branch: push a frame for each possible next neighbor
      for (const nextId of unvisited) {
        const ni = idx.nodeById.get(nextId);
        if (ni === undefined) continue;
        const newVisited = new Set(visited);
        newVisited.add(nextId);
        queue.push({
          visited: newVisited,
          preorder: [...preorder, graph.nodes[ni]],
          dfsStack: [...dfsStack, nextId],
        });
      }
      branched = true;
      break;
    }

    if (!branched) {
      yield preorder;
    }
  }
}

/**
 * Lazily yields all possible postorder (DFS finish-order) sequences.
 * Different neighbor exploration orders yield different sequences.
 * Use `getPostorder()` for a single canonical ordering.
 *
 * **O(V! · V)** worst-case (exponential).
 *
 * @example
 * ```ts
 * import { createGraph, genPostorders } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'ac', sourceId: 'a', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * for (const order of genPostorders(graph)) {
 *   console.log(order.map(n => n.id));
 *   // ['b', 'c', 'a'] or ['c', 'b', 'a']
 * }
 * ```
 */
export function* genPostorders<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): Generator<GraphNode<N>[]> {
  const idx = getIndex(graph);
  const startId = resolveFrom(graph, opts);
  const startNi = idx.nodeById.get(startId);
  if (startNi === undefined) return;

  type Frame = {
    visited: Set<string>;
    postorder: GraphNode<N>[];
    dfsStack: string[];
  };

  const queue: Frame[] = [
    { visited: new Set([startId]), postorder: [], dfsStack: [startId] },
  ];

  while (queue.length > 0) {
    const frame = queue.pop()!;
    const { visited, dfsStack } = frame;
    let { postorder } = frame;

    let branched = false;
    while (dfsStack.length > 0) {
      const top = dfsStack[dfsStack.length - 1];
      const unvisited = getNeighborIds(graph, top).filter(
        (id) => !visited.has(id),
      );

      if (unvisited.length === 0) {
        dfsStack.pop();
        const ni = idx.nodeById.get(top);
        if (ni !== undefined) postorder = [...postorder, graph.nodes[ni]];
        continue;
      }

      for (const nextId of unvisited) {
        const ni = idx.nodeById.get(nextId);
        if (ni === undefined) continue;
        const newVisited = new Set(visited);
        newVisited.add(nextId);
        queue.push({
          visited: newVisited,
          postorder: [...postorder],
          dfsStack: [...dfsStack, nextId],
        });
      }
      branched = true;
      break;
    }

    if (!branched) {
      yield postorder;
    }
  }
}

// Minimum spanning tree

/**
 * Returns a minimum spanning tree of the graph.
 * Only meaningful for connected undirected graphs (or the component reachable
 * from an arbitrary start node in directed graphs).
 *
 * **O(E log E)** using either edge sorting (Kruskal) or a min-heap (Prim).
 *
 * @example
 * ```ts
 * import { createGraph, getMinimumSpanningTree } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   type: 'undirected',
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b', data: { weight: 1 } },
 *     { id: 'bc', sourceId: 'b', targetId: 'c', data: { weight: 2 } },
 *     { id: 'ac', sourceId: 'a', targetId: 'c', data: { weight: 3 } },
 *   ],
 * });
 *
 * const mst = getMinimumSpanningTree(graph, {
 *   getWeight: (e) => e.data.weight,
 * });
 * // mst has edges 'ab' and 'bc' (total weight 3)
 * ```
 */
export function getMinimumSpanningTree<N, E>(
  graph: Graph<N, E>,
  opts?: MSTOptions<E>,
): Graph<N, E> {
  const algorithm = opts?.algorithm ?? 'prim';
  const getWeight = opts?.getWeight ?? ((e: GraphEdge<E>) => e.weight ?? 1);

  const mstEdges =
    algorithm === 'kruskal'
      ? kruskalMST(graph, getWeight)
      : primMST(graph, getWeight);

  return createGraph({
    id: graph.id,
    type: graph.type,
    initialNodeId: graph.initialNodeId ?? undefined,
    nodes: graph.nodes.map((n) => ({
      id: n.id,
      parentId: n.parentId ?? undefined,
      initialNodeId: n.initialNodeId ?? undefined,
      label: n.label,
      data: n.data,
    })),
    edges: mstEdges.map((e) => ({
      id: e.id,
      sourceId: e.sourceId,
      targetId: e.targetId,
      label: e.label,
      data: e.data,
      ...(e.weight !== undefined && { weight: e.weight }),
    })),
  });
}

function primMST<N, E>(
  graph: Graph<N, E>,
  getWeight: (edge: GraphEdge<E>) => number,
): GraphEdge<E>[] {
  if (graph.nodes.length === 0) return [];
  const idx = getIndex(graph);
  const inMST = new Set<string>();
  const mstEdges: GraphEdge<E>[] = [];
  const candidates = new MinPriorityQueue<{ weight: number; edge: GraphEdge<E> }>(
    (a, b) => a.weight - b.weight,
  );

  function addEdgesOf(nodeId: string): void {
    for (const eid of idx.outEdges.get(nodeId) ?? []) {
      const ai = idx.edgeById.get(eid);
      if (ai === undefined) continue;
      const e = graph.edges[ai] as GraphEdge<E>;
      if (!inMST.has(e.targetId)) {
        candidates.push({ weight: getWeight(e), edge: e });
      }
    }
    if (graph.type === 'undirected') {
      for (const eid of idx.inEdges.get(nodeId) ?? []) {
        const ai = idx.edgeById.get(eid);
        if (ai === undefined) continue;
        const e = graph.edges[ai] as GraphEdge<E>;
        if (!inMST.has(e.sourceId)) {
          candidates.push({ weight: getWeight(e), edge: e });
        }
      }
    }
  }

  // Start from first node
  const startId = graph.nodes[0].id;
  inMST.add(startId);
  addEdgesOf(startId);

  while (candidates.size > 0 && inMST.size < graph.nodes.length) {
    const { edge } = candidates.pop()!;

    const targetId =
      graph.type === 'undirected' && inMST.has(edge.targetId)
        ? edge.sourceId
        : edge.targetId;

    if (inMST.has(targetId)) continue;
    inMST.add(targetId);
    mstEdges.push(edge);
    addEdgesOf(targetId);
  }

  return mstEdges;
}

function kruskalMST<N, E>(
  graph: Graph<N, E>,
  getWeight: (edge: GraphEdge<E>) => number,
): GraphEdge<E>[] {
  // Sort edges by weight
  const sorted = [...graph.edges].sort(
    (a, b) => getWeight(a as GraphEdge<E>) - getWeight(b as GraphEdge<E>),
  );

  // Union-Find
  const parent = new Map<string, string>();
  const rank = new Map<string, number>();
  for (const n of graph.nodes) {
    parent.set(n.id, n.id);
    rank.set(n.id, 0);
  }

  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  function union(x: string, y: string): boolean {
    const rx = find(x),
      ry = find(y);
    if (rx === ry) return false;
    if (rank.get(rx)! < rank.get(ry)!) {
      parent.set(rx, ry);
    } else if (rank.get(rx)! > rank.get(ry)!) {
      parent.set(ry, rx);
    } else {
      parent.set(ry, rx);
      rank.set(rx, rank.get(rx)! + 1);
    }
    return true;
  }

  const mstEdges: GraphEdge<E>[] = [];
  for (const e of sorted) {
    if (union(e.sourceId, e.targetId)) {
      mstEdges.push(e as GraphEdge<E>);
    }
  }

  return mstEdges;
}

// All-pairs shortest paths

/**
 * Returns shortest paths between all pairs of nodes.
 * Algorithm 'dijkstra' (default): runs getShortestPaths per source node.
 * Algorithm 'bellman-ford': handles negative weights, throws on negative cycles.
 * Algorithm 'floyd-warshall': classic dynamic programming.
 *
 * **O(V · (V + E) log V)** (Dijkstra), **O(V²E)** (Bellman-Ford), or **O(V³)** (Floyd-Warshall).
 *
 * @example
 * ```ts
 * import { createGraph, getAllPairsShortestPaths } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 * });
 *
 * const allPaths = getAllPairsShortestPaths(graph);
 * // paths for every reachable (source, target) pair
 * ```
 */
export function getAllPairsShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: AllPairsShortestPathsOptions<E>,
): GraphPath<N, E>[] {
  const algorithm = opts?.algorithm ?? 'dijkstra';
  if (algorithm === 'floyd-warshall') {
    return floydWarshallAllPaths(graph, opts?.getWeight);
  }
  if (algorithm === 'bellman-ford') {
    return bellmanFordAllPaths(graph, opts?.getWeight);
  }
  return dijkstraAllPaths(graph, opts?.getWeight);
}

function bellmanFordAllPaths<N, E>(
  graph: Graph<N, E>,
  getWeight?: (edge: GraphEdge<E>) => number,
): GraphPath<N, E>[] {
  const results: GraphPath<N, E>[] = [];
  for (const node of graph.nodes) {
    const paths = getShortestPaths(graph, {
      from: node.id,
      getWeight,
      algorithm: 'bellman-ford',
    });
    results.push(...paths);
  }
  return results;
}

function dijkstraAllPaths<N, E>(
  graph: Graph<N, E>,
  getWeight?: (edge: GraphEdge<E>) => number,
): GraphPath<N, E>[] {
  const results: GraphPath<N, E>[] = [];
  for (const node of graph.nodes) {
    const paths = getShortestPaths(graph, {
      from: node.id,
      getWeight,
    });
    results.push(...paths);
  }
  return results;
}

function floydWarshallAllPaths<N, E>(
  graph: Graph<N, E>,
  getWeight?: (edge: GraphEdge<E>) => number,
): GraphPath<N, E>[] {
  const idx = getIndex(graph);
  const w = getWeight ?? ((e: GraphEdge<E>) => e.weight ?? 1);
  const nodeIds = graph.nodes.map((n) => n.id);
  const n = nodeIds.length;

  // dist[i][j] and prev[i][j] (using indices into nodeIds)
  const idxOf = new Map<string, number>();
  for (let i = 0; i < n; i++) idxOf.set(nodeIds[i], i);

  const INF = Infinity;
  const dist: number[][] = Array.from({ length: n }, () => Array(n).fill(INF));
  const prev: Array<Array<Array<{ from: number; edge: GraphEdge<E> }>>> =
    Array.from({ length: n }, () => Array.from({ length: n }, () => []));

  // Initialize diagonal
  for (let i = 0; i < n; i++) dist[i][i] = 0;

  // Initialize edges
  for (const e of graph.edges) {
    const u = idxOf.get(e.sourceId)!;
    const v = idxOf.get(e.targetId)!;
    const weight = w(e as GraphEdge<E>);
    if (weight < dist[u][v]) {
      dist[u][v] = weight;
      prev[u][v] = [{ from: u, edge: e as GraphEdge<E> }];
    } else if (weight === dist[u][v] && weight < INF) {
      prev[u][v].push({ from: u, edge: e as GraphEdge<E> });
    }
    if (graph.type === 'undirected') {
      if (weight < dist[v][u]) {
        dist[v][u] = weight;
        prev[v][u] = [{ from: v, edge: e as GraphEdge<E> }];
      } else if (weight === dist[v][u] && weight < INF) {
        prev[v][u].push({ from: v, edge: e as GraphEdge<E> });
      }
    }
  }

  // Relax
  for (let k = 0; k < n; k++) {
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if (dist[i][k] === INF || dist[k][j] === INF) continue;
        const newDist = dist[i][k] + dist[k][j];
        if (newDist < dist[i][j]) {
          dist[i][j] = newDist;
          // Predecessors of j are those from the k→j subpath
          prev[i][j] = prev[k][j].map((p) => ({ ...p }));
        } else if (newDist === dist[i][j] && newDist < INF) {
          // Add new predecessors from k→j path
          for (const p of prev[k][j]) {
            if (!prev[i][j].some((x) => x.edge.id === p.edge.id)) {
              prev[i][j].push({ ...p });
            }
          }
        }
      }
    }
  }

  // Reconstruct paths
  const results: GraphPath<N, E>[] = [];
  for (let i = 0; i < n; i++) {
    const sourceNi = idx.nodeById.get(nodeIds[i]);
    if (sourceNi === undefined) continue;
    const sourceNode = graph.nodes[sourceNi];

    for (let j = 0; j < n; j++) {
      if (i === j || dist[i][j] === INF) continue;

      const paths = fwReconstruct(
        graph,
        prev,
        idxOf,
        nodeIds,
        sourceNode,
        i,
        j,
      );
      results.push(...paths);
    }
  }

  return results;
}

function fwReconstruct<N, E>(
  graph: Graph<N, E>,
  prev: Array<Array<Array<{ from: number; edge: GraphEdge<E> }>>>,
  idxOf: Map<string, number>,
  nodeIds: string[],
  sourceNode: GraphNode<N>,
  sourceIdx: number,
  targetIdx: number,
): GraphPath<N, E>[] {
  if (sourceIdx === targetIdx) {
    return [{ source: sourceNode, steps: [] }];
  }

  const preds = prev[sourceIdx][targetIdx];
  if (preds.length === 0) return [];

  const idx = getIndex(graph);
  const targetNi = idx.nodeById.get(nodeIds[targetIdx]);
  if (targetNi === undefined) return [];
  const targetNode = graph.nodes[targetNi];

  const results: GraphPath<N, E>[] = [];
  for (const { from, edge } of preds) {
    const prefixPaths = fwReconstruct(
      graph,
      prev,
      idxOf,
      nodeIds,
      sourceNode,
      sourceIdx,
      from,
    );
    for (const prefix of prefixPaths) {
      results.push({
        source: sourceNode,
        steps: [...prefix.steps, { edge, node: targetNode }],
      });
    }
  }

  return results;
}

// A* pathfinding

/**
 * Returns a shortest path using A* search with an admissible heuristic.
 * More efficient than Dijkstra when a good heuristic is available.
 *
 * **O((V + E) log V)** time with a good heuristic; degrades to Dijkstra
 * with `heuristic: () => 0`.
 *
 * @example
 * ```ts
 * import { createGraph, getAStarPath } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [
 *     { id: 'a', x: 0, y: 0 },
 *     { id: 'b', x: 1, y: 0 },
 *     { id: 'c', x: 1, y: 1 },
 *   ],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
 *     { id: 'bc', sourceId: 'b', targetId: 'c', weight: 1 },
 *     { id: 'ac', sourceId: 'a', targetId: 'c', weight: 3 },
 *   ],
 * });
 *
 * const path = getAStarPath(graph, {
 *   from: 'a',
 *   to: 'c',
 *   heuristic: (nodeId) => {
 *     const node = graph.nodes.find(n => n.id === nodeId)!;
 *     const target = graph.nodes.find(n => n.id === 'c')!;
 *     return Math.abs(node.x! - target.x!) + Math.abs(node.y! - target.y!);
 *   },
 * });
 * // path: a -> b -> c (weight 2, cheaper than direct a -> c)
 * ```
 */
export function getAStarPath<N, E>(
  graph: Graph<N, E>,
  opts: AStarOptions<E>,
): GraphPath<N, E> | undefined {
  const idx = getIndex(graph);
  const { from: sourceId, to: targetId, heuristic } = opts;
  const getWeight = opts.getWeight ?? ((e: GraphEdge<E>) => e.weight ?? 1);

  const sourceNi = idx.nodeById.get(sourceId);
  if (sourceNi === undefined) return undefined;
  if (!idx.nodeById.has(targetId)) return undefined;

  // Same node
  if (sourceId === targetId) {
    return { source: graph.nodes[sourceNi], steps: [] };
  }

  const gScore = new Map<string, number>();
  const cameFrom = new Map<string, { from: string; edge: GraphEdge<E> }>();
  const closedSet = new Set<string>();
  const openSet = new MinPriorityQueue<{ id: string; f: number }>(
    (a, b) => a.f - b.f,
  );

  gScore.set(sourceId, 0);
  openSet.push({ id: sourceId, f: heuristic(sourceId) });

  while (openSet.size > 0) {
    const { id: currentId } = openSet.pop()!;
    if (closedSet.has(currentId)) continue;

    if (currentId === targetId) {
      // Reconstruct path
      const steps: GraphStep<N, E>[] = [];
      let cur = targetId;
      while (cur !== sourceId) {
        const prev = cameFrom.get(cur)!;
        const ni = idx.nodeById.get(cur)!;
        steps.unshift({ edge: prev.edge, node: graph.nodes[ni] });
        cur = prev.from;
      }
      return { source: graph.nodes[sourceNi], steps };
    }

    closedSet.add(currentId);

    for (const { neighborId, edge } of getNeighborEdges(graph, currentId)) {
      if (closedSet.has(neighborId)) continue;

      const tentativeG =
        (gScore.get(currentId) ?? Infinity) + getWeight(edge as GraphEdge<E>);

      if (tentativeG < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, {
          from: currentId,
          edge: edge as GraphEdge<E>,
        });
        gScore.set(neighborId, tentativeG);
        openSet.push({
          id: neighborId,
          f: tentativeG + heuristic(neighborId),
        });
      }
    }
  }

  return undefined;
}

// Path joining

/**
 * Joins two paths end-to-end. The last node of the head path must equal
 * the source of the tail path (the overlap node).
 *
 * Steps are concatenated: head.steps ++ tail.steps (tail already starts
 * from the overlap node, so no slicing is needed).
 *
 * @example
 * ```ts
 * import { createGraph, getShortestPath, joinPaths } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
 *   edges: [
 *     { id: 'ab', sourceId: 'a', targetId: 'b' },
 *     { id: 'bc', sourceId: 'b', targetId: 'c' },
 *   ],
 *   initialNodeId: 'a',
 * });
 *
 * const ab = getShortestPath(graph, { to: 'b' })!;
 * const bc = getShortestPath(graph, { from: 'b', to: 'c' })!;
 * const ac = joinPaths(ab, bc);
 * // ac: a -> b -> c
 * ```
 */
export function joinPaths<N, E>(
  headPath: GraphPath<N, E>,
  tailPath: GraphPath<N, E>,
): GraphPath<N, E> {
  const headEnd =
    headPath.steps.length > 0
      ? headPath.steps[headPath.steps.length - 1].node
      : headPath.source;

  if (headEnd.id !== tailPath.source.id) {
    throw new Error(
      `Paths cannot be joined: head path ends at "${headEnd.id}" but tail path starts at "${tailPath.source.id}"`,
    );
  }

  return {
    source: headPath.source,
    steps: [...headPath.steps, ...tailPath.steps],
  };
}
