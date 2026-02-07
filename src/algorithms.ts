import type { Graph, GraphNode, GraphEdge, GraphPath, GraphStep, PathOptions, SinglePathOptions, TraversalOptions, MSTOptions, AllPairsShortestPathsOptions } from './types';
import { getIndex } from './indexing';
import { createGraph } from './graph';

// --- Traversal generators ---

export function* bfs<N>(graph: Graph<N>, startId: string): Generator<GraphNode<N>> {
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

export function* dfs<N>(graph: Graph<N>, startId: string): Generator<GraphNode<N>> {
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

// --- Graph properties ---

export function isAcyclic(graph: Graph): boolean {
  if (graph.type === 'undirected') {
    return isAcyclicUndirected(graph);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
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

export function connectedComponents<N>(graph: Graph<N>): GraphNode<N>[][] {
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

export function topologicalSort<N>(graph: Graph<N>): GraphNode<N>[] | null {
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

export function hasPath(graph: Graph, sourceId: string, targetId: string): boolean {
  return getShortestPaths(graph, { from: sourceId, to: targetId }).length > 0;
}

export function isConnected(graph: Graph): boolean {
  if (graph.nodes.length === 0) return true;
  const components = connectedComponents(graph);
  return components.length <= 1;
}

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
  const roots = [...inDeg.entries()].filter(([, d]) => d === 0).map(([id]) => id);
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
 * Uses BFS by default; Dijkstra when `opts.getWeight` is provided.
 */
/** Compute distance + prev maps via BFS or Dijkstra. */
function computeShortestDistances<E>(
  graph: Graph<any, E>,
  sourceId: string,
  getWeight?: (edge: GraphEdge<E>) => number,
): {
  dist: Map<string, number>;
  prev: Map<string, Array<{ from: string; edge: GraphEdge<E> }>>;
} {
  const dist = new Map<string, number>();
  const prev = new Map<string, Array<{ from: string; edge: GraphEdge<E> }>>();

  dist.set(sourceId, 0);
  prev.set(sourceId, []);

  if (!getWeight) {
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
    const visited = new Set<string>();
    const pq: Array<{ id: string; dist: number }> = [{ id: sourceId, dist: 0 }];

    while (pq.length > 0) {
      let minIdx = 0;
      for (let i = 1; i < pq.length; i++) {
        if (pq[i].dist < pq[minIdx].dist) minIdx = i;
      }
      const { id, dist: d } = pq.splice(minIdx, 1)[0];

      if (visited.has(id)) continue;
      visited.add(id);

      for (const { neighborId, edge } of getNeighborEdges(graph, id)) {
        const w = getWeight(edge as GraphEdge<E>);
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
  const targetNode = targetNi !== undefined ? graph.nodes[targetNi] : graph.nodes.find((n) => n.id === targetId)!;

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
 */
export function* genShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): Generator<GraphPath<N, E>> {
  const idx = getIndex(graph);
  const sourceId = resolveFrom(graph, opts);
  const { dist, prev } = computeShortestDistances(graph, sourceId, opts?.getWeight);

  const targets = opts?.to
    ? [opts.to].filter((id) => dist.has(id))
    : [...dist.keys()].filter((id) => id !== sourceId);

  const sourceNi = idx.nodeById.get(sourceId);
  const sourceNode = sourceNi !== undefined ? graph.nodes[sourceNi] : graph.nodes.find((n) => n.id === sourceId)!;

  for (const targetId of targets) {
    yield* reconstructPaths<N, E>(graph, prev, sourceNode, targetId);
  }
}

export function getShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): GraphPath<N, E>[] {
  return [...genShortestPaths(graph, opts)];
}

/**
 * Returns a single shortest path from source to target, or undefined if unreachable.
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
 * Returns all simple (acyclic) paths from a source node.
 * Uses DFS with backtracking.
 */
export function getSimplePaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): GraphPath<N, E>[] {
  return [...genSimplePaths(graph, opts)];
}

/**
 * Lazily yields all simple (acyclic) paths from a source node.
 * Use `getSimplePaths` for the full array.
 */
export function* genSimplePaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): Generator<GraphPath<N, E>> {
  const idx = getIndex(graph);
  const sourceId = resolveFrom(graph, opts);
  const sourceNi = idx.nodeById.get(sourceId);
  const sourceNode = sourceNi !== undefined ? graph.nodes[sourceNi] : graph.nodes.find((n) => n.id === sourceId)!;
  const targetId = opts?.to;
  const visited = new Set<string>();
  const currentSteps: GraphStep<N, E>[] = [];
  const found: GraphPath<N, E>[] = [];

  function dfsCollect(nodeId: string): void {
    visited.add(nodeId);

    if (targetId !== undefined) {
      if (nodeId === targetId) {
        found.push({ source: sourceNode, steps: [...currentSteps] });
        visited.delete(nodeId);
        return;
      }
    } else if (currentSteps.length > 0) {
      found.push({ source: sourceNode, steps: [...currentSteps] });
    }

    for (const { neighborId, edge } of getNeighborEdges(graph, nodeId)) {
      if (!visited.has(neighborId)) {
        const neighborNi = idx.nodeById.get(neighborId);
        const neighborNode = neighborNi !== undefined ? graph.nodes[neighborNi] : graph.nodes.find((n) => n.id === neighborId)!;
        currentSteps.push({ edge: edge as GraphEdge<E>, node: neighborNode });
        dfsCollect(neighborId);
        currentSteps.pop();
      }
    }

    visited.delete(nodeId);
  }

  // DFS finds paths in batches between yields
  // We use a trampoline: run DFS, yield found paths, repeat
  // For simplicity, collect all then yield (DFS doesn't naturally pause)
  dfsCollect(sourceId);
  yield* found;
}

/**
 * Returns a single simple (acyclic) path from source to target, or undefined if unreachable.
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

// ---------------------------------------------------------------------------
// Strongly connected components (Tarjan's)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Cycle detection — all elementary cycles
// ---------------------------------------------------------------------------

export function getCycles<N, E>(graph: Graph<N, E>): GraphPath<N, E>[] {
  return [...genCycles(graph)];
}

/**
 * Lazily yields cycles one at a time.
 * Use `getCycles` for the full array.
 */
export function* genCycles<N, E>(graph: Graph<N, E>): Generator<GraphPath<N, E>> {
  if (graph.type === 'undirected') {
    yield* genCyclesUndirected(graph);
  } else {
    yield* genCyclesDirected(graph);
  }
}

function* genCyclesDirected<N, E>(graph: Graph<N, E>): Generator<GraphPath<N, E>> {
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

        if (neighborId === startId && (steps.length > 0 || currentId === startId)) {
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

function* genCyclesUndirected<N, E>(graph: Graph<N, E>): Generator<GraphPath<N, E>> {
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

      for (const { neighborId, edge } of getNeighborEdgesAll(graph, currentId)) {
        if (neighborId === parentId) {
          parentId = null;
          continue;
        }

        if (neighborId === startId && steps.length >= 2) {
          const innerIds = steps.map((s) => s.node.id).sort().join(',');
          if (!seen.has(innerIds)) {
            seen.add(innerIds);
            found.push({
              source: startNode,
              steps: [...steps, { edge: edge as GraphEdge<E>, node: startNode }],
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

// ---------------------------------------------------------------------------
// Single canonical DFS orderings
// ---------------------------------------------------------------------------

/**
 * Returns a single canonical preorder (DFS visit-order) sequence.
 * Visits neighbors in the order they appear in the adjacency list.
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

// ---------------------------------------------------------------------------
// Traversal order enumeration — all possible DFS orderings (generators)
// ---------------------------------------------------------------------------

/** Returns all possible preorder sequences as an array. Can be exponential — prefer `genPreorders`. */
export function getPreorders<N>(
  graph: Graph<N>,
  opts?: TraversalOptions,
): GraphNode<N>[][] {
  return [...genPreorders(graph, opts)];
}

/** Returns all possible postorder sequences as an array. Can be exponential — prefer `genPostorders`. */
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

// ---------------------------------------------------------------------------
// Minimum spanning tree
// ---------------------------------------------------------------------------

/**
 * Returns a minimum spanning tree of the graph.
 * Only meaningful for connected undirected graphs (or the component reachable
 * from an arbitrary start node in directed graphs).
 */
export function getMinimumSpanningTree<N, E>(
  graph: Graph<N, E>,
  opts?: MSTOptions<E>,
): Graph<N, E> {
  const algorithm = opts?.algorithm ?? 'prim';
  const getWeight = opts?.getWeight ?? (() => 1);

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
    })),
  });
}

function primMST<E>(
  graph: Graph<any, E>,
  getWeight: (edge: GraphEdge<E>) => number,
): GraphEdge<E>[] {
  if (graph.nodes.length === 0) return [];
  const idx = getIndex(graph);
  const inMST = new Set<string>();
  const mstEdges: GraphEdge<E>[] = [];

  // Candidate edges: [weight, edge]
  const candidates: Array<{ weight: number; edge: GraphEdge<E> }> = [];

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

  while (candidates.length > 0 && inMST.size < graph.nodes.length) {
    // Extract minimum weight edge
    let minIdx = 0;
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].weight < candidates[minIdx].weight) minIdx = i;
    }
    const { edge } = candidates.splice(minIdx, 1)[0];

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

function kruskalMST<E>(
  graph: Graph<any, E>,
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

// ---------------------------------------------------------------------------
// All-pairs shortest paths
// ---------------------------------------------------------------------------

/**
 * Returns shortest paths between all pairs of nodes.
 * Algorithm 'dijkstra' (default): runs getShortestPaths per source node.
 * Algorithm 'floyd-warshall': classic O(V³) dynamic programming.
 */
export function getAllPairsShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: AllPairsShortestPathsOptions<E>,
): GraphPath<N, E>[] {
  const algorithm = opts?.algorithm ?? 'dijkstra';
  if (algorithm === 'floyd-warshall') {
    return floydWarshallAllPaths(graph, opts?.getWeight);
  }
  return dijkstraAllPaths(graph, opts?.getWeight);
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
  const w = getWeight ?? (() => 1);
  const nodeIds = graph.nodes.map((n) => n.id);
  const n = nodeIds.length;

  // dist[i][j] and prev[i][j] (using indices into nodeIds)
  const idxOf = new Map<string, number>();
  for (let i = 0; i < n; i++) idxOf.set(nodeIds[i], i);

  const INF = Infinity;
  const dist: number[][] = Array.from({ length: n }, () =>
    Array(n).fill(INF),
  );
  const prev: Array<Array<Array<{ from: number; edge: GraphEdge<E> }>>> =
    Array.from({ length: n }, () =>
      Array.from({ length: n }, () => []),
    );

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

      const paths = fwReconstruct(graph, prev, idxOf, nodeIds, sourceNode, i, j);
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
