import type {
  AStarOptions,
  AllPairsShortestPathsOptions,
  Graph,
  GraphEdge,
  GraphNode,
  GraphPath,
  GraphStep,
  PathOptions,
  SinglePathOptions,
} from '../types';
import { getIndex } from '../indexing';
import {
  getNeighborEdges,
  getNeighborEdgesAll,
  MinPriorityQueue,
  resolveFrom,
} from './shared';

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

  const useBFS = !getWeight && !graph.edges.some((edge) => edge.weight !== undefined);

  if (useBFS) {
    const queue: string[] = [sourceId];

    while (queue.length > 0) {
      const id = queue.shift()!;
      const distance = dist.get(id)!;

      for (const { neighborId, edge } of getNeighborEdges(graph, id)) {
        const nextDistance = distance + 1;
        const existing = dist.get(neighborId);

        if (existing === undefined) {
          dist.set(neighborId, nextDistance);
          prev.set(neighborId, [{ from: id, edge: edge as GraphEdge<E> }]);
          queue.push(neighborId);
        } else if (existing === nextDistance) {
          prev.get(neighborId)!.push({ from: id, edge: edge as GraphEdge<E> });
        }
      }
    }
  } else {
    const effectiveWeight = getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
    const visited = new Set<string>();
    const pq = new MinPriorityQueue<{ id: string; dist: number }>(
      (a, b) => a.dist - b.dist,
    );
    pq.push({ id: sourceId, dist: 0 });

    while (pq.size > 0) {
      const current = pq.pop()!;
      const { id, dist: distance } = current;

      if (visited.has(id) || distance !== dist.get(id)) continue;
      visited.add(id);

      for (const { neighborId, edge } of getNeighborEdges(graph, id)) {
        const weight = effectiveWeight(edge as GraphEdge<E>);
        const nextDistance = distance + weight;
        const existing = dist.get(neighborId);

        if (existing === undefined || nextDistance < existing) {
          dist.set(neighborId, nextDistance);
          prev.set(neighborId, [{ from: id, edge: edge as GraphEdge<E> }]);
          pq.push({ id: neighborId, dist: nextDistance });
        } else if (existing === nextDistance) {
          prev.get(neighborId)!.push({ from: id, edge: edge as GraphEdge<E> });
        }
      }
    }
  }

  return { dist, prev };
}

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
  const effectiveWeight = getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const isUndirected = graph.type === 'undirected';

  for (const node of graph.nodes) {
    dist.set(node.id, Infinity);
    prev.set(node.id, []);
  }
  dist.set(sourceId, 0);

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

  for (let i = 0; i < graph.nodes.length - 1; i++) {
    let changed = false;
    for (const { fromId, toId, edge } of directedEdges) {
      const distance = dist.get(fromId)!;
      if (distance === Infinity) continue;
      const weight = effectiveWeight(edge);
      const nextDistance = distance + weight;
      const existing = dist.get(toId)!;

      if (nextDistance < existing) {
        dist.set(toId, nextDistance);
        prev.set(toId, [{ from: fromId, edge }]);
        changed = true;
      } else if (nextDistance === existing && existing !== Infinity) {
        const predecessors = prev.get(toId)!;
        if (!predecessors.some((entry) => entry.from === fromId && entry.edge === edge)) {
          predecessors.push({ from: fromId, edge });
        }
      }
    }
    if (!changed) break;
  }

  for (const { fromId, toId, edge } of directedEdges) {
    const distance = dist.get(fromId)!;
    if (distance === Infinity) continue;
    const weight = effectiveWeight(edge);
    if (distance + weight < dist.get(toId)!) {
      throw new Error(
        'Graph contains a negative-weight cycle reachable from the source node',
      );
    }
  }

  for (const [id, distance] of dist) {
    if (distance === Infinity) {
      dist.delete(id);
      prev.delete(id);
    }
  }

  return { dist, prev };
}

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

  const predecessors = prev.get(targetId);
  if (!predecessors || predecessors.length === 0) return;

  const idx = getIndex(graph);
  const targetNi = idx.nodeById.get(targetId);
  const targetNode =
    targetNi !== undefined
      ? graph.nodes[targetNi]
      : graph.nodes.find((node) => node.id === targetId)!;

  for (const { from, edge } of predecessors) {
    for (const prefix of reconstructPaths(graph, prev, sourceNode, from)) {
      yield {
        source: sourceNode,
        steps: [...prefix.steps, { edge, node: targetNode }],
      };
    }
  }
}

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
      : graph.nodes.find((node) => node.id === sourceId)!;

  for (const targetId of targets) {
    yield* reconstructPaths(graph, prev, sourceNode, targetId);
  }
}

export function getShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): GraphPath<N, E>[] {
  return [...genShortestPaths(graph, opts)];
}

export function getShortestPath<N, E>(
  graph: Graph<N, E>,
  opts: SinglePathOptions<E>,
): GraphPath<N, E> | undefined {
  for (const path of genShortestPaths(graph, opts)) {
    return path;
  }
  return undefined;
}

export function getSimplePaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E>,
): GraphPath<N, E>[] {
  return [...genSimplePaths(graph, opts)];
}

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
      : graph.nodes.find((node) => node.id === sourceId)!;
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
            : graph.nodes.find((node) => node.id === neighborId)!;
        currentSteps.push({ edge: edge as GraphEdge<E>, node: neighborNode });
        yield* dfsCollect(neighborId);
        currentSteps.pop();
      }
    }

    visited.delete(nodeId);
  }

  yield* dfsCollect(sourceId);
}

export function getSimplePath<N, E>(
  graph: Graph<N, E>,
  opts: SinglePathOptions<E>,
): GraphPath<N, E> | undefined {
  for (const path of genSimplePaths(graph, opts)) {
    return path;
  }
  return undefined;
}

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
      const neighborId = graph.edges[ai].targetId;

      if (!nodeIndex.has(neighborId)) {
        strongconnect(neighborId);
        lowlink.set(id, Math.min(lowlink.get(id)!, lowlink.get(neighborId)!));
      } else if (onStack.has(neighborId)) {
        lowlink.set(id, Math.min(lowlink.get(id)!, nodeIndex.get(neighborId)!));
      }
    }

    if (lowlink.get(id) === nodeIndex.get(id)) {
      const component: GraphNode<N>[] = [];
      let neighborId: string;
      do {
        neighborId = stack.pop()!;
        onStack.delete(neighborId);
        const ni = idx.nodeById.get(neighborId);
        if (ni !== undefined) component.push(graph.nodes[ni]);
      } while (neighborId !== id);
      result.push(component);
    }
  }

  for (const node of graph.nodes) {
    if (!nodeIndex.has(node.id)) strongconnect(node.id);
  }

  return result;
}

export function getCycles<N, E>(graph: Graph<N, E>): GraphPath<N, E>[] {
  return [...genCycles(graph)];
}

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
  const sortedIds = graph.nodes.map((node) => node.id).sort();

  for (let startIndex = 0; startIndex < sortedIds.length; startIndex++) {
    const startId = sortedIds[startIndex];
    const allowed = new Set(sortedIds.slice(startIndex));
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
        const edge = graph.edges[ai];
        const neighborId = edge.targetId;

        if (
          neighborId === startId &&
          (steps.length > 0 || currentId === startId)
        ) {
          found.push({
            source: startNode,
            steps: [...steps, { edge: edge as GraphEdge<E>, node: startNode }],
          });
        } else if (allowed.has(neighborId) && !visited.has(neighborId)) {
          const ni = idx.nodeById.get(neighborId)!;
          steps.push({ edge: edge as GraphEdge<E>, node: graph.nodes[ni] });
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
  const sortedIds = graph.nodes.map((node) => node.id).sort();
  const seen = new Set<string>();

  for (let startIndex = 0; startIndex < sortedIds.length; startIndex++) {
    const startId = sortedIds[startIndex];
    const allowed = new Set(sortedIds.slice(startIndex));
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
          const innerIds = steps
            .map((step) => step.node.id)
            .sort()
            .join(',');
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
    results.push(
      ...getShortestPaths(graph, {
        from: node.id,
        getWeight,
        algorithm: 'bellman-ford',
      }),
    );
  }
  return results;
}

function dijkstraAllPaths<N, E>(
  graph: Graph<N, E>,
  getWeight?: (edge: GraphEdge<E>) => number,
): GraphPath<N, E>[] {
  const results: GraphPath<N, E>[] = [];
  for (const node of graph.nodes) {
    results.push(...getShortestPaths(graph, { from: node.id, getWeight }));
  }
  return results;
}

function floydWarshallAllPaths<N, E>(
  graph: Graph<N, E>,
  getWeight?: (edge: GraphEdge<E>) => number,
): GraphPath<N, E>[] {
  const idx = getIndex(graph);
  const weight = getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const nodeIds = graph.nodes.map((node) => node.id);
  const nodeCount = nodeIds.length;

  const indexOf = new Map<string, number>();
  for (let i = 0; i < nodeCount; i++) indexOf.set(nodeIds[i], i);

  const INF = Infinity;
  const dist: number[][] = Array.from({ length: nodeCount }, () =>
    Array(nodeCount).fill(INF),
  );
  const prev: Array<Array<Array<{ from: number; edge: GraphEdge<E> }>>> =
    Array.from({ length: nodeCount }, () =>
      Array.from({ length: nodeCount }, () => []),
    );

  for (let i = 0; i < nodeCount; i++) dist[i][i] = 0;

  for (const edge of graph.edges) {
    const source = indexOf.get(edge.sourceId)!;
    const target = indexOf.get(edge.targetId)!;
    const edgeWeight = weight(edge as GraphEdge<E>);
    if (edgeWeight < dist[source][target]) {
      dist[source][target] = edgeWeight;
      prev[source][target] = [{ from: source, edge: edge as GraphEdge<E> }];
    } else if (edgeWeight === dist[source][target] && edgeWeight < INF) {
      prev[source][target].push({ from: source, edge: edge as GraphEdge<E> });
    }

    if (graph.type === 'undirected') {
      if (edgeWeight < dist[target][source]) {
        dist[target][source] = edgeWeight;
        prev[target][source] = [{ from: target, edge: edge as GraphEdge<E> }];
      } else if (edgeWeight === dist[target][source] && edgeWeight < INF) {
        prev[target][source].push({ from: target, edge: edge as GraphEdge<E> });
      }
    }
  }

  for (let k = 0; k < nodeCount; k++) {
    for (let i = 0; i < nodeCount; i++) {
      for (let j = 0; j < nodeCount; j++) {
        if (dist[i][k] === INF || dist[k][j] === INF) continue;
        const nextDistance = dist[i][k] + dist[k][j];
        if (nextDistance < dist[i][j]) {
          dist[i][j] = nextDistance;
          prev[i][j] = prev[k][j].map((entry) => ({ ...entry }));
        } else if (nextDistance === dist[i][j] && nextDistance < INF) {
          for (const entry of prev[k][j]) {
            if (!prev[i][j].some((existing) => existing.edge.id === entry.edge.id)) {
              prev[i][j].push({ ...entry });
            }
          }
        }
      }
    }
  }

  const results: GraphPath<N, E>[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const sourceNi = idx.nodeById.get(nodeIds[i]);
    if (sourceNi === undefined) continue;
    const sourceNode = graph.nodes[sourceNi];

    for (let j = 0; j < nodeCount; j++) {
      if (i === j || dist[i][j] === INF) continue;
      results.push(
        ...fwReconstruct(graph, prev, nodeIds, sourceNode, i, j),
      );
    }
  }

  return results;
}

function fwReconstruct<N, E>(
  graph: Graph<N, E>,
  prev: Array<Array<Array<{ from: number; edge: GraphEdge<E> }>>>,
  nodeIds: string[],
  sourceNode: GraphNode<N>,
  sourceIdx: number,
  targetIdx: number,
): GraphPath<N, E>[] {
  if (sourceIdx === targetIdx) {
    return [{ source: sourceNode, steps: [] }];
  }

  const predecessors = prev[sourceIdx][targetIdx];
  if (predecessors.length === 0) return [];

  const idx = getIndex(graph);
  const targetNi = idx.nodeById.get(nodeIds[targetIdx]);
  if (targetNi === undefined) return [];
  const targetNode = graph.nodes[targetNi];

  const results: GraphPath<N, E>[] = [];
  for (const { from, edge } of predecessors) {
    const prefixPaths = fwReconstruct(
      graph,
      prev,
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

export function getAStarPath<N, E>(
  graph: Graph<N, E>,
  opts: AStarOptions<E>,
): GraphPath<N, E> | undefined {
  const idx = getIndex(graph);
  const { from: sourceId, to: targetId, heuristic } = opts;
  const getWeight = opts.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);

  const sourceNi = idx.nodeById.get(sourceId);
  if (sourceNi === undefined) return undefined;
  if (!idx.nodeById.has(targetId)) return undefined;

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
      const steps: GraphStep<N, E>[] = [];
      let current = targetId;
      while (current !== sourceId) {
        const previous = cameFrom.get(current)!;
        const ni = idx.nodeById.get(current)!;
        steps.unshift({ edge: previous.edge, node: graph.nodes[ni] });
        current = previous.from;
      }
      return { source: graph.nodes[sourceNi], steps };
    }

    closedSet.add(currentId);

    for (const { neighborId, edge } of getNeighborEdges(graph, currentId)) {
      if (closedSet.has(neighborId)) continue;

      const tentativeScore =
        (gScore.get(currentId) ?? Infinity) + getWeight(edge as GraphEdge<E>);

      if (tentativeScore < (gScore.get(neighborId) ?? Infinity)) {
        cameFrom.set(neighborId, {
          from: currentId,
          edge: edge as GraphEdge<E>,
        });
        gScore.set(neighborId, tentativeScore);
        openSet.push({
          id: neighborId,
          f: tentativeScore + heuristic(neighborId),
        });
      }
    }
  }

  return undefined;
}

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
