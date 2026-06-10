import type { Graph } from '../types';
import { getIndex } from '../indexing';
import { getEdgeMode } from '../mode';
import { getDegree, getInDegree, getOutDegree } from '../queries';

export interface IterativeCentralityOptions {
  alpha?: number;
  maxIterations?: number;
  tolerance?: number;
}

export interface HITSResult {
  hubs: Record<string, number>;
  authorities: Record<string, number>;
}

function getNodeIds(graph: Graph): string[] {
  return graph.nodes.map((node) => node.id);
}

function getNeighborIds(graph: Graph, nodeId: string): string[] {
  const idx = getIndex(graph);
  const neighbors: string[] = [];

  for (const edgeId of idx.outEdges.get(nodeId) ?? []) {
    const edgeIndex = idx.edgeById.get(edgeId);
    if (edgeIndex !== undefined) {
      neighbors.push(graph.edges[edgeIndex].targetId);
    }
  }

  // Edges whose effective mode is not 'directed' are traversable both ways
  for (const edgeId of idx.inEdges.get(nodeId) ?? []) {
    const edgeIndex = idx.edgeById.get(edgeId);
    if (edgeIndex !== undefined) {
      const edge = graph.edges[edgeIndex];
      if (getEdgeMode(graph, edge) !== 'directed') {
        neighbors.push(edge.sourceId);
      }
    }
  }

  return neighbors;
}

function getIncomingIds(graph: Graph, nodeId: string): string[] {
  const idx = getIndex(graph);
  const incoming: string[] = [];

  for (const edgeId of idx.inEdges.get(nodeId) ?? []) {
    const edgeIndex = idx.edgeById.get(edgeId);
    if (edgeIndex !== undefined) {
      incoming.push(graph.edges[edgeIndex].sourceId);
    }
  }

  // Edges whose effective mode is not 'directed' also point "in"
  for (const edgeId of idx.outEdges.get(nodeId) ?? []) {
    const edgeIndex = idx.edgeById.get(edgeId);
    if (edgeIndex !== undefined) {
      const edge = graph.edges[edgeIndex];
      if (getEdgeMode(graph, edge) !== 'directed') {
        incoming.push(edge.targetId);
      }
    }
  }

  return incoming;
}

function createEmptyScoreMap(graph: Graph): Record<string, number> {
  return Object.fromEntries(graph.nodes.map((node) => [node.id, 0]));
}

function normalizeVector(scores: Record<string, number>): Record<string, number> {
  const magnitude = Math.sqrt(
    Object.values(scores).reduce((sum, value) => sum + value * value, 0),
  );
  if (magnitude === 0) {
    return scores;
  }

  for (const key of Object.keys(scores)) {
    scores[key] /= magnitude;
  }

  return scores;
}

function maxDiff(
  previous: Record<string, number>,
  next: Record<string, number>,
): number {
  let diff = 0;
  for (const key of Object.keys(next)) {
    diff = Math.max(diff, Math.abs((previous[key] ?? 0) - next[key]));
  }
  return diff;
}

function getReachableDistances(graph: Graph, startId: string): Map<string, number> {
  const distances = new Map<string, number>();
  const queue: string[] = [startId];
  distances.set(startId, 0);

  while (queue.length > 0) {
    const currentId = queue.shift()!;
    const currentDistance = distances.get(currentId)!;

    for (const neighborId of getNeighborIds(graph, currentId)) {
      if (distances.has(neighborId)) continue;
      distances.set(neighborId, currentDistance + 1);
      queue.push(neighborId);
    }
  }

  return distances;
}

/**
 * Returns degree centrality scores for all nodes.
 *
 * Degree centrality is the node degree normalized by `n - 1`.
 *
 * @example
 * ```ts
 * const scores = getDegreeCentrality(graph);
 * console.log(scores.a); // 0.5
 * ```
 */
export function getDegreeCentrality(graph: Graph): Record<string, number> {
  const scale = graph.nodes.length > 1 ? 1 / (graph.nodes.length - 1) : 0;
  const scores = createEmptyScoreMap(graph);

  for (const node of graph.nodes) {
    scores[node.id] = getDegree(graph, node.id) * scale;
  }

  return scores;
}

/**
 * Returns in-degree centrality scores for all nodes.
 *
 * In-degree centrality is the incoming degree normalized by `n - 1`.
 */
export function getInDegreeCentrality(graph: Graph): Record<string, number> {
  const scale = graph.nodes.length > 1 ? 1 / (graph.nodes.length - 1) : 0;
  const scores = createEmptyScoreMap(graph);

  for (const node of graph.nodes) {
    scores[node.id] = getInDegree(graph, node.id) * scale;
  }

  return scores;
}

/**
 * Returns out-degree centrality scores for all nodes.
 *
 * Out-degree centrality is the outgoing degree normalized by `n - 1`.
 */
export function getOutDegreeCentrality(graph: Graph): Record<string, number> {
  const scale = graph.nodes.length > 1 ? 1 / (graph.nodes.length - 1) : 0;
  const scores = createEmptyScoreMap(graph);

  for (const node of graph.nodes) {
    scores[node.id] = getOutDegree(graph, node.id) * scale;
  }

  return scores;
}

/**
 * Returns closeness centrality scores for all nodes.
 *
 * Distances are computed over unweighted shortest paths using the graph's
 * existing directed or undirected edge semantics.
 */
export function getClosenessCentrality(graph: Graph): Record<string, number> {
  const scores = createEmptyScoreMap(graph);
  const order = graph.nodes.length;

  for (const node of graph.nodes) {
    const distances = getReachableDistances(graph, node.id);
    distances.delete(node.id);
    if (distances.size === 0) continue;

    const totalDistance = [...distances.values()].reduce(
      (sum, distance) => sum + distance,
      0,
    );
    if (totalDistance === 0) continue;

    const reachable = distances.size;
    const closeness = reachable / totalDistance;
    scores[node.id] =
      order > 1 ? closeness * (reachable / (order - 1)) : closeness;
  }

  return scores;
}

/**
 * Returns betweenness centrality scores for all nodes.
 *
 * Uses Brandes' algorithm over unweighted shortest paths and returns
 * normalized scores.
 */
export function getBetweennessCentrality(graph: Graph): Record<string, number> {
  const scores = createEmptyScoreMap(graph);

  for (const source of graph.nodes) {
    const stack: string[] = [];
    const predecessors = new Map<string, string[]>();
    const sigma = new Map<string, number>();
    const distance = new Map<string, number>();
    const queue: string[] = [source.id];

    for (const node of graph.nodes) {
      predecessors.set(node.id, []);
      sigma.set(node.id, 0);
      distance.set(node.id, -1);
    }

    sigma.set(source.id, 1);
    distance.set(source.id, 0);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      stack.push(currentId);

      for (const neighborId of getNeighborIds(graph, currentId)) {
        if (distance.get(neighborId) === -1) {
          queue.push(neighborId);
          distance.set(neighborId, distance.get(currentId)! + 1);
        }
        if (distance.get(neighborId) === distance.get(currentId)! + 1) {
          sigma.set(neighborId, sigma.get(neighborId)! + sigma.get(currentId)!);
          predecessors.get(neighborId)!.push(currentId);
        }
      }
    }

    const delta = new Map<string, number>();
    for (const node of graph.nodes) {
      delta.set(node.id, 0);
    }

    while (stack.length > 0) {
      const nodeId = stack.pop()!;
      const sigmaNode = sigma.get(nodeId)!;
      if (sigmaNode === 0) continue;
      for (const predecessorId of predecessors.get(nodeId)!) {
        const contribution =
          (sigma.get(predecessorId)! / sigmaNode) * (1 + delta.get(nodeId)!);
        delta.set(predecessorId, delta.get(predecessorId)! + contribution);
      }
      if (nodeId !== source.id) {
        scores[nodeId] += delta.get(nodeId)!;
      }
    }
  }

  const order = graph.nodes.length;
  if (order <= 2) {
    return scores;
  }

  const scale =
    graph.mode !== 'directed'
      ? 1 / (((order - 1) * (order - 2)) / 2)
      : 1 / ((order - 1) * (order - 2));

  for (const nodeId of Object.keys(scores)) {
    if (graph.mode !== 'directed') {
      scores[nodeId] /= 2;
    }
    scores[nodeId] *= scale;
  }

  return scores;
}

/**
 * Returns PageRank scores for all nodes.
 *
 * Uses power iteration with damping factor `alpha`.
 */
export function getPageRank(
  graph: Graph,
  options?: IterativeCentralityOptions,
): Record<string, number> {
  const nodeIds = getNodeIds(graph);
  if (nodeIds.length === 0) {
    return {};
  }

  const alpha = options?.alpha ?? 0.85;
  const maxIterations = options?.maxIterations ?? 100;
  const tolerance = options?.tolerance ?? 1e-6;
  let scores = Object.fromEntries(
    nodeIds.map((nodeId) => [nodeId, 1 / nodeIds.length]),
  ) as Record<string, number>;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const nextScores = Object.fromEntries(
      nodeIds.map((nodeId) => [nodeId, (1 - alpha) / nodeIds.length]),
    ) as Record<string, number>;

    let danglingMass = 0;

    for (const nodeId of nodeIds) {
      const neighbors = getNeighborIds(graph, nodeId);
      if (neighbors.length === 0) {
        danglingMass += scores[nodeId];
        continue;
      }
      const share = scores[nodeId] / neighbors.length;
      for (const neighborId of neighbors) {
        nextScores[neighborId] += alpha * share;
      }
    }

    if (danglingMass > 0) {
      const share = (alpha * danglingMass) / nodeIds.length;
      for (const nodeId of nodeIds) {
        nextScores[nodeId] += share;
      }
    }

    if (maxDiff(scores, nextScores) <= tolerance) {
      scores = nextScores;
      break;
    }

    scores = nextScores;
  }

  const total = Object.values(scores).reduce((sum, value) => sum + value, 0);
  if (total !== 0) {
    for (const nodeId of nodeIds) {
      scores[nodeId] /= total;
    }
  }

  return scores;
}

/**
 * Returns HITS hub and authority scores for all nodes.
 *
 * Uses power iteration and L2 normalization per iteration.
 */
export function getHITS(
  graph: Graph,
  options?: IterativeCentralityOptions,
): HITSResult {
  const nodeIds = getNodeIds(graph);
  if (nodeIds.length === 0) {
    return { hubs: {}, authorities: {} };
  }

  const maxIterations = options?.maxIterations ?? 100;
  const tolerance = options?.tolerance ?? 1e-6;
  let hubs = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, 1])) as Record<
    string,
    number
  >;
  let authorities = createEmptyScoreMap(graph);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const nextAuthorities = createEmptyScoreMap(graph);
    for (const nodeId of nodeIds) {
      for (const predecessorId of getIncomingIds(graph, nodeId)) {
        nextAuthorities[nodeId] += hubs[predecessorId];
      }
    }
    normalizeVector(nextAuthorities);

    const nextHubs = createEmptyScoreMap(graph);
    for (const nodeId of nodeIds) {
      for (const neighborId of getNeighborIds(graph, nodeId)) {
        nextHubs[nodeId] += nextAuthorities[neighborId];
      }
    }
    normalizeVector(nextHubs);

    const hubDiff = maxDiff(hubs, nextHubs);
    const authorityDiff = maxDiff(authorities, nextAuthorities);
    hubs = nextHubs;
    authorities = nextAuthorities;

    if (Math.max(hubDiff, authorityDiff) <= tolerance) {
      break;
    }
  }

  return { hubs, authorities };
}

/**
 * Returns eigenvector centrality scores for all nodes.
 *
 * Uses power iteration over incoming neighbors for directed graphs and
 * undirected adjacency for undirected graphs.
 */
export function getEigenvectorCentrality(
  graph: Graph,
  options?: IterativeCentralityOptions,
): Record<string, number> {
  const nodeIds = getNodeIds(graph);
  if (nodeIds.length === 0) {
    return {};
  }

  const maxIterations = options?.maxIterations ?? 100;
  const tolerance = options?.tolerance ?? 1e-6;
  let scores = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, 1])) as Record<
    string,
    number
  >;
  normalizeVector(scores);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const nextScores = createEmptyScoreMap(graph);
    for (const nodeId of nodeIds) {
      for (const predecessorId of getIncomingIds(graph, nodeId)) {
        nextScores[nodeId] += scores[predecessorId];
      }
    }
    normalizeVector(nextScores);

    const diff = maxDiff(scores, nextScores);
    scores = nextScores;
    if (diff <= tolerance) {
      break;
    }
  }

  return scores;
}
