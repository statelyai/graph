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
import { getEdgeMode } from '../mode';
import {
  getEffectiveModeKind,
  getNeighborEdges,
  getNeighborEdgesAll,
  getNeighborIds,
  MinPriorityQueue,
  resolveFrom,
} from './shared';
import { getCSR } from './csr';

function computeShortestDistances<N, E>(
  graph: Graph<N, E>,
  sourceId: string,
  getWeight?: (edge: GraphEdge<E>) => number,
  algorithm?: 'dijkstra' | 'bellman-ford',
  /**
   * Early-exit target: stop once every node at distance ≤ dist(target) is
   * settled (not merely when the target settles — equal-distance predecessors
   * via zero-weight edges must still be recorded so *all* shortest paths to
   * the target survive). Bellman-Ford ignores this (it must relax globally).
   */
  stopAtId?: string,
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

  const csr = getCSR(graph);
  const source = csr.indexOf.get(sourceId);
  if (source === undefined) {
    // Unknown source id: nothing is reachable (matches pre-CSR behavior)
    return { dist, prev };
  }

  const n = csr.ids.length;
  const distArr = new Float64Array(n).fill(Infinity);
  // Tie predecessors per node as (fromPos, edgeIndex) pairs
  const prevArr: Array<number[]> = new Array(n);
  distArr[source] = 0;
  prevArr[source] = [];

  const stopAt = stopAtId !== undefined ? csr.indexOf.get(stopAtId) : undefined;
  let stopDistance = Infinity;

  const useBFS = !getWeight && !graph.edges.some((edge) => edge.weight !== undefined);

  if (useBFS) {
    const queue = new Int32Array(n);
    queue[0] = source;
    let head = 0;
    let tail = 1;

    while (head < tail) {
      const u = queue[head++];
      // Early exit: everything at distance ≤ dist(target) has been dequeued
      if (distArr[u] > stopDistance) break;
      if (u === stopAt) stopDistance = distArr[u];
      const nextDistance = distArr[u] + 1;

      for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
        const v = csr.outTargets[a];
        if (distArr[v] === Infinity) {
          distArr[v] = nextDistance;
          prevArr[v] = [u, csr.outEdgeIndex[a]];
          queue[tail++] = v;
        } else if (distArr[v] === nextDistance) {
          prevArr[v].push(u, csr.outEdgeIndex[a]);
        }
      }
    }
  } else {
    const effectiveWeight = getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
    const visited = new Uint8Array(n);
    const pq = new MinPriorityQueue<{ pos: number; dist: number }>(
      (a, b) => a.dist - b.dist,
    );
    pq.push({ pos: source, dist: 0 });

    while (pq.size > 0) {
      const { pos: u, dist: distance } = pq.pop()!;
      if (visited[u] || distance !== distArr[u]) continue;
      // Early exit: all nodes at distance ≤ dist(target) are settled
      if (distance > stopDistance) break;
      if (u === stopAt) stopDistance = distance;
      visited[u] = 1;

      for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
        const edge = graph.edges[csr.outEdgeIndex[a]] as GraphEdge<E>;
        const weight = effectiveWeight(edge);
        if (weight < 0) {
          throw new Error(
            `Negative edge weight ${weight} on edge "${edge.sourceId}->${edge.targetId}" (id "${edge.id}"): Dijkstra requires non-negative weights. Use { algorithm: 'bellman-ford' } instead.`,
          );
        }
        const v = csr.outTargets[a];
        const nextDistance = distance + weight;

        if (nextDistance < distArr[v]) {
          distArr[v] = nextDistance;
          prevArr[v] = [u, csr.outEdgeIndex[a]];
          pq.push({ pos: v, dist: nextDistance });
        } else if (nextDistance === distArr[v] && distArr[v] !== Infinity) {
          prevArr[v].push(u, csr.outEdgeIndex[a]);
        }
      }
    }
  }

  // Convert reached nodes back to the id-keyed shape reconstruction expects.
  // After an early exit, nodes beyond the stop distance hold tentative
  // (unsettled) values — exclude them; they cannot lie on any shortest path
  // to the target.
  for (let i = 0; i < n; i++) {
    if (distArr[i] === Infinity || distArr[i] > stopDistance) continue;
    dist.set(csr.ids[i], distArr[i]);
    const pairs = prevArr[i];
    const predecessors: Array<{ from: string; edge: GraphEdge<E> }> = [];
    for (let k = 0; k < pairs.length; k += 2) {
      predecessors.push({
        from: csr.ids[pairs[k]],
        edge: graph.edges[pairs[k + 1]] as GraphEdge<E>,
      });
    }
    prev.set(csr.ids[i], predecessors);
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
    if (getEdgeMode(graph, edge) !== 'directed') {
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
  onPath: Set<string> = new Set(),
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

  // Track nodes on the current partial path — zero-weight cycles can make
  // the `prev` structure cyclic via equal-distance tie predecessors, so
  // never revisit a node already on the path being reconstructed.
  onPath.add(targetId);
  for (const { from, edge } of predecessors) {
    if (onPath.has(from)) continue;
    for (const prefix of reconstructPaths(graph, prev, sourceNode, from, onPath)) {
      yield {
        source: sourceNode,
        steps: [...prefix.steps, { edge, node: targetNode }],
      };
    }
  }
  onPath.delete(targetId);
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
    opts?.to, // single-target queries early-exit the search
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

    // getNeighborIds traverses non-directed (undirected/bidirectional) edges
    // in both directions — such edges imply mutual reachability.
    for (const neighborId of getNeighborIds(graph, id)) {
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
  // Dispatch on the *effective* modes of the edges (per-edge overrides
  // included), not just graph.mode. Genuinely mixed graphs use an exact
  // simple-cycle search — correct, but potentially expensive on large dense
  // mixed graphs.
  const kind = getEffectiveModeKind(graph);
  if (kind === 'mixed') {
    yield* genCyclesMixed(graph);
  } else if (kind === 'non-directed') {
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

    function dfsFind(currentId: string, arrivalEdgeId: string | null): void {
      visited.add(currentId);

      for (const { neighborId, edge } of getNeighborEdgesAll(graph, currentId)) {
        // An undirected edge cannot be re-traversed back the way we came;
        // skipping by edge id (not parent node) keeps parallel edges distinct,
        // so two parallel edges between the same pair form a genuine 2-cycle.
        if (edge.id === arrivalEdgeId) continue;

        if (
          neighborId === startId &&
          (steps.length >= 1 || edge.sourceId === edge.targetId)
        ) {
          // Identify a cycle by its full set of traversed edge ids — distinct
          // cycles can share the same vertex set (e.g. parallel chords).
          const cycleEdgeIds = [...steps.map((step) => step.edge.id), edge.id]
            .sort()
            .join(',');
          if (!seen.has(cycleEdgeIds)) {
            seen.add(cycleEdgeIds);
            found.push({
              source: startNode,
              steps: [...steps, { edge: edge as GraphEdge<E>, node: startNode }],
            });
          }
        } else if (allowed.has(neighborId) && !visited.has(neighborId)) {
          const ni = idx.nodeById.get(neighborId)!;
          steps.push({ edge: edge as GraphEdge<E>, node: graph.nodes[ni] });
          dfsFind(neighborId, edge.id);
          steps.pop();
        }
      }

      visited.delete(currentId);
    }

    dfsFind(startId, null);
    yield* found;
  }
}

/**
 * Exact simple-cycle enumeration for graphs mixing directed and non-directed
 * edges. Traverses directed edges source→target only and non-directed edges
 * both ways; a cycle may use each edge at most once, visits distinct nodes,
 * and is identified by its set of traversed edge ids.
 */
function* genCyclesMixed<N, E>(
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
    const pathEdgeIds = new Set<string>();
    const startNi = idx.nodeById.get(startId)!;
    const startNode = graph.nodes[startNi];
    const found: GraphPath<N, E>[] = [];

    function dfsFind(currentId: string): void {
      visited.add(currentId);

      for (const { neighborId, edge } of getNeighborEdges(graph, currentId)) {
        if (pathEdgeIds.has(edge.id)) continue;

        if (
          neighborId === startId &&
          (steps.length >= 1 || edge.sourceId === edge.targetId)
        ) {
          const cycleEdgeIds = [...steps.map((step) => step.edge.id), edge.id]
            .sort()
            .join(',');
          if (!seen.has(cycleEdgeIds)) {
            seen.add(cycleEdgeIds);
            found.push({
              source: startNode,
              steps: [...steps, { edge: edge as GraphEdge<E>, node: startNode }],
            });
          }
        } else if (allowed.has(neighborId) && !visited.has(neighborId)) {
          const ni = idx.nodeById.get(neighborId)!;
          steps.push({ edge: edge as GraphEdge<E>, node: graph.nodes[ni] });
          pathEdgeIds.add(edge.id);
          dfsFind(neighborId);
          pathEdgeIds.delete(edge.id);
          steps.pop();
        }
      }

      visited.delete(currentId);
    }

    dfsFind(startId);
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

    if (getEdgeMode(graph, edge) !== 'directed') {
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

  // A negative self-distance means a negative cycle: all-pairs shortest
  // paths are undefined and reconstruction would loop forever.
  for (let i = 0; i < nodeCount; i++) {
    if (dist[i][i] < 0) {
      throw new Error(
        `Negative cycle detected through node "${nodeIds[i]}": all-pairs shortest paths are undefined. ` +
          `Remove the negative cycle, or use getShortestPaths with { algorithm: 'bellman-ford' } per source to locate it.`,
      );
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

  const csr = getCSR(graph);
  const n = csr.ids.length;
  const source = csr.indexOf.get(sourceId)!;
  const target = csr.indexOf.get(targetId)!;

  const gScore = new Float64Array(n).fill(Infinity);
  // Predecessor as (fromPos, edgeIndex); -1 = none
  const cameFromPos = new Int32Array(n).fill(-1);
  const cameFromEdge = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const openSet = new MinPriorityQueue<{ pos: number; f: number }>(
    (a, b) => a.f - b.f,
  );

  gScore[source] = 0;
  openSet.push({ pos: source, f: heuristic(sourceId) });

  while (openSet.size > 0) {
    const { pos: current } = openSet.pop()!;
    if (closed[current]) continue;

    if (current === target) {
      const steps: GraphStep<N, E>[] = [];
      let cursor = target;
      while (cursor !== source) {
        steps.unshift({
          edge: graph.edges[cameFromEdge[cursor]] as GraphEdge<E>,
          node: graph.nodes[cursor],
        });
        cursor = cameFromPos[cursor];
      }
      return { source: graph.nodes[sourceNi], steps };
    }

    closed[current] = 1;

    for (let a = csr.outOffsets[current]; a < csr.outOffsets[current + 1]; a++) {
      const edge = graph.edges[csr.outEdgeIndex[a]] as GraphEdge<E>;
      const weight = getWeight(edge);
      if (weight < 0) {
        throw new Error(
          `Negative edge weight ${weight} on edge "${edge.sourceId}->${edge.targetId}" (id "${edge.id}"): A* requires non-negative weights. Use getShortestPath with { algorithm: 'bellman-ford' } instead.`,
        );
      }

      const neighbor = csr.outTargets[a];
      if (closed[neighbor]) continue;

      const tentativeScore = gScore[current] + weight;
      if (tentativeScore < gScore[neighbor]) {
        cameFromPos[neighbor] = current;
        cameFromEdge[neighbor] = csr.outEdgeIndex[a];
        gScore[neighbor] = tentativeScore;
        openSet.push({
          pos: neighbor,
          f: tentativeScore + heuristic(csr.ids[neighbor]),
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
