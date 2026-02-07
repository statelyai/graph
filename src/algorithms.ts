import type { Graph, GraphNode, GraphEdge, GraphPath, GraphStep, PathOptions } from './types';

// --- Traversal generators ---

export function* bfs<N>(graph: Graph<N>, startId: string): Generator<GraphNode<N>> {
  const visited = new Set<string>();
  const queue: string[] = [startId];
  visited.add(startId);

  while (queue.length > 0) {
    const id = queue.shift()!;
    const node = graph.nodes.find((n) => n.id === id);
    if (!node) continue;
    yield node;

    const neighborIds = getNeighborIds(graph, id);
    for (const nId of neighborIds) {
      if (!visited.has(nId)) {
        visited.add(nId);
        queue.push(nId);
      }
    }
  }
}

export function* dfs<N>(graph: Graph<N>, startId: string): Generator<GraphNode<N>> {
  const visited = new Set<string>();
  const stack: string[] = [startId];

  while (stack.length > 0) {
    const id = stack.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);

    const node = graph.nodes.find((n) => n.id === id);
    if (!node) continue;
    yield node;

    const neighborIds = getNeighborIds(graph, id);
    for (const nId of neighborIds) {
      if (!visited.has(nId)) {
        stack.push(nId);
      }
    }
  }
}

function getNeighborIds(graph: Graph, nodeId: string): string[] {
  const ids: string[] = [];
  for (const e of graph.edges) {
    if (graph.type === 'undirected') {
      if (e.sourceId === nodeId) ids.push(e.targetId);
      if (e.targetId === nodeId) ids.push(e.sourceId);
    } else {
      if (e.sourceId === nodeId) ids.push(e.targetId);
    }
  }
  return ids;
}

function getSuccessorIds(graph: Graph, nodeId: string): string[] {
  return graph.edges
    .filter((e) => e.sourceId === nodeId)
    .map((e) => e.targetId);
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
  const visited = new Set<string>();

  const hasCycle = (id: string, parentId: string | null): boolean => {
    visited.add(id);
    for (const e of graph.edges) {
      let neighborId: string | null = null;
      if (e.sourceId === id) neighborId = e.targetId;
      else if (e.targetId === id) neighborId = e.sourceId;
      if (neighborId === null) continue;

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
  const visited = new Set<string>();
  const components: GraphNode<N>[][] = [];

  for (const n of graph.nodes) {
    if (visited.has(n.id)) continue;
    const component: GraphNode<N>[] = [];
    const queue: string[] = [n.id];
    visited.add(n.id);

    while (queue.length > 0) {
      const id = queue.shift()!;
      const node = graph.nodes.find((x) => x.id === id);
      if (node) component.push(node);

      for (const e of graph.edges) {
        let neighborId: string | null = null;
        if (e.sourceId === id) neighborId = e.targetId;
        else if (e.targetId === id) neighborId = e.sourceId;
        if (neighborId !== null && !visited.has(neighborId)) {
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
    const node = graph.nodes.find((n) => n.id === id);
    if (node) result.push(node);

    for (const e of graph.edges) {
      if (e.sourceId === id) {
        const newDeg = (inDeg.get(e.targetId) ?? 1) - 1;
        inDeg.set(e.targetId, newDeg);
        if (newDeg === 0) queue.push(e.targetId);
      }
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
  const result: Array<{ neighborId: string; edge: GraphEdge }> = [];
  for (const e of graph.edges) {
    if (e.sourceId === nodeId) {
      result.push({ neighborId: e.targetId, edge: e });
    } else if (graph.type === 'undirected' && e.targetId === nodeId) {
      result.push({ neighborId: e.sourceId, edge: e });
    }
  }
  return result;
}

/**
 * Returns all shortest paths from a source node.
 * Returns all paths of equal minimum length per target (not just one).
 * Uses BFS by default; Dijkstra when `opts.getWeight` is provided.
 */
export function getShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): GraphPath<N, E>[] {
  const sourceId = resolveFrom(graph, opts);
  const getWeight = opts?.getWeight;

  // dist[nodeId] = shortest distance from source
  const dist = new Map<string, number>();
  // prev[nodeId] = all predecessors at shortest distance
  const prev = new Map<string, Array<{ from: string; edge: GraphEdge<E> }>>();

  dist.set(sourceId, 0);
  prev.set(sourceId, []);

  if (!getWeight) {
    // BFS (uniform weight = 1)
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
    // Dijkstra (weighted)
    const visited = new Set<string>();
    // Simple array-based priority queue
    const pq: Array<{ id: string; dist: number }> = [{ id: sourceId, dist: 0 }];

    while (pq.length > 0) {
      // Extract min
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

  // Reconstruct all paths
  const targets = opts?.to
    ? [opts.to].filter((id) => dist.has(id))
    : [...dist.keys()].filter((id) => id !== sourceId);

  const sourceNode = graph.nodes.find((n) => n.id === sourceId)!;
  const results: GraphPath<N, E>[] = [];

  for (const targetId of targets) {
    const paths = reconstructAllPaths<N, E>(graph, prev, sourceNode, targetId);
    results.push(...paths);
  }

  return results;
}

/** Reconstruct all shortest paths to a target by backtracking through prev map. */
function reconstructAllPaths<N, E>(
  graph: Graph<N, E>,
  prev: Map<string, Array<{ from: string; edge: GraphEdge<E> }>>,
  sourceNode: GraphNode<N>,
  targetId: string,
): GraphPath<N, E>[] {
  if (targetId === sourceNode.id) {
    return [{ source: sourceNode, steps: [] }];
  }

  const preds = prev.get(targetId);
  if (!preds || preds.length === 0) return [];

  const results: GraphPath<N, E>[] = [];
  const targetNode = graph.nodes.find((n) => n.id === targetId)!;

  for (const { from, edge } of preds) {
    const prefixPaths = reconstructAllPaths(graph, prev, sourceNode, from);
    for (const prefix of prefixPaths) {
      results.push({
        source: sourceNode,
        steps: [...prefix.steps, { edge, node: targetNode }],
      });
    }
  }

  return results;
}

/**
 * Returns all simple (acyclic) paths from a source node.
 * Uses DFS with backtracking.
 */
export function getSimplePaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): GraphPath<N, E>[] {
  const sourceId = resolveFrom(graph, opts);
  const sourceNode = graph.nodes.find((n) => n.id === sourceId)!;
  const targetId = opts?.to;
  const results: GraphPath<N, E>[] = [];
  const visited = new Set<string>();
  const currentSteps: GraphStep<N, E>[] = [];

  function dfsCollect(nodeId: string): void {
    visited.add(nodeId);

    if (targetId !== undefined) {
      if (nodeId === targetId) {
        results.push({ source: sourceNode, steps: [...currentSteps] });
        visited.delete(nodeId);
        return; // don't explore past target
      }
    } else if (currentSteps.length > 0) {
      // no specific target: collect path to every reachable node
      results.push({ source: sourceNode, steps: [...currentSteps] });
    }

    for (const { neighborId, edge } of getNeighborEdges(graph, nodeId)) {
      if (!visited.has(neighborId)) {
        const neighborNode = graph.nodes.find((n) => n.id === neighborId)!;
        currentSteps.push({ edge: edge as GraphEdge<E>, node: neighborNode });
        dfsCollect(neighborId);
        currentSteps.pop();
      }
    }

    visited.delete(nodeId);
  }

  dfsCollect(sourceId);
  return results;
}
