import type { Graph, GraphEdge, GraphNode } from '../types';
import { getIndex } from '../indexing';
import { mulberry32 } from './shared';
import { throwIfAborted } from './abort';

export interface GirvanNewmanOptions {
  level?: number;
  maxLevels?: number;
  /** Abort signal, checked once per split round. Throws `signal.reason`. */
  signal?: AbortSignal;
}

export interface LabelPropagationOptions {
  maxIterations?: number;
  /**
   * When provided, runs *asynchronous* label propagation with a shuffled
   * node order per round and random tie-breaking, seeded with mulberry32 —
   * deterministic per seed. Without a seed, ties break lexicographically.
   */
  seed?: number;
  /** Abort signal, checked once per iteration. Throws `signal.reason`. */
  signal?: AbortSignal;
}

export interface GreedyModularityOptions {
  /** Abort signal, checked once per merge round. Throws `signal.reason`. */
  signal?: AbortSignal;
}

type Community<N = any> = GraphNode<N>[];

function getUndirectedNeighbors(
  graph: Graph,
  nodeId: string,
): Array<{ nodeId: string; edgeId: string }> {
  const idx = getIndex(graph);
  const neighbors: Array<{ nodeId: string; edgeId: string }> = [];

  for (const edgeId of idx.outEdges.get(nodeId) ?? []) {
    const edgeIndex = idx.edgeById.get(edgeId);
    if (edgeIndex !== undefined) {
      neighbors.push({
        nodeId: graph.edges[edgeIndex].targetId,
        edgeId,
      });
    }
  }

  for (const edgeId of idx.inEdges.get(nodeId) ?? []) {
    const edgeIndex = idx.edgeById.get(edgeId);
    if (edgeIndex !== undefined) {
      neighbors.push({
        nodeId: graph.edges[edgeIndex].sourceId,
        edgeId,
      });
    }
  }

  return neighbors;
}

function getUndirectedConnectedComponents<N>(
  graph: Graph<N>,
): Community<N>[] {
  const idx = getIndex(graph);
  const visited = new Set<string>();
  const communities: Community<N>[] = [];

  for (const node of graph.nodes) {
    if (visited.has(node.id)) continue;

    const community: Community<N> = [];
    const queue = [node.id];
    visited.add(node.id);

    while (queue.length > 0) {
      const currentId = queue.shift()!;
      const nodeIndex = idx.nodeById.get(currentId);
      if (nodeIndex !== undefined) {
        community.push(graph.nodes[nodeIndex]);
      }

      for (const neighbor of getUndirectedNeighbors(graph, currentId)) {
        if (visited.has(neighbor.nodeId)) continue;
        visited.add(neighbor.nodeId);
        queue.push(neighbor.nodeId);
      }
    }

    communities.push(community.sort((a, b) => a.id.localeCompare(b.id)));
  }

  return communities.sort((a, b) => a[0].id.localeCompare(b[0].id));
}

function getNodeMap<N>(graph: Graph<N>): Map<string, GraphNode<N>> {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function normalizeCommunities<N>(
  graph: Graph<N>,
  labels: Record<string, string>,
): Community<N>[] {
  const nodeMap = getNodeMap(graph);
  const grouped = new Map<string, Community<N>>();

  for (const [nodeId, label] of Object.entries(labels)) {
    if (!grouped.has(label)) {
      grouped.set(label, []);
    }
    const node = nodeMap.get(nodeId);
    if (node) {
      grouped.get(label)!.push(node);
    }
  }

  return [...grouped.values()]
    .map((community) => community.sort((a, b) => a.id.localeCompare(b.id)))
    .sort((a, b) => a[0].id.localeCompare(b[0].id));
}

function getEdgeBetweenness(graph: Graph): Record<string, number> {
  const scores = Object.fromEntries(
    graph.edges.map((edge) => [edge.id, 0]),
  ) as Record<string, number>;

  for (const source of graph.nodes) {
    const stack: string[] = [];
    const predecessors = new Map<
      string,
      Array<{ nodeId: string; edgeId: string }>
    >();
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

      for (const neighbor of getUndirectedNeighbors(graph, currentId)) {
        if (distance.get(neighbor.nodeId) === -1) {
          queue.push(neighbor.nodeId);
          distance.set(
            neighbor.nodeId,
            distance.get(currentId)! + 1,
          );
        }
        if (distance.get(neighbor.nodeId) === distance.get(currentId)! + 1) {
          sigma.set(
            neighbor.nodeId,
            sigma.get(neighbor.nodeId)! + sigma.get(currentId)!,
          );
          predecessors.get(neighbor.nodeId)!.push({
            nodeId: currentId,
            edgeId: neighbor.edgeId,
          });
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

      for (const predecessor of predecessors.get(nodeId)!) {
        const contribution =
          (sigma.get(predecessor.nodeId)! / sigmaNode) * (1 + delta.get(nodeId)!);
        scores[predecessor.edgeId] += contribution;
        delta.set(
          predecessor.nodeId,
          delta.get(predecessor.nodeId)! + contribution,
        );
      }
    }
  }

  for (const edgeId of Object.keys(scores)) {
    scores[edgeId] /= 2;
  }

  return scores;
}

function cloneWithEdges<N, E, G, P>(
  graph: Graph<N, E, G, P>,
  edges: GraphEdge<E>[],
): Graph<N, E, G, P> {
  return {
    ...graph,
    nodes: [...graph.nodes],
    edges,
  };
}

function toCommunityIds<N>(
  communities: Community<N>[],
): Set<string>[] {
  return communities.map((community) => new Set(community.map((node) => node.id)));
}

/**
 * Asynchronous LPA: labels update in place as the (seeded-shuffled) round
 * proceeds; ties among maximal neighbor labels break uniformly at random,
 * keeping the current label when it is already maximal so rounds terminate.
 * Deterministic per seed.
 */
function getSeededLabelPropagation<N>(
  graph: Graph<N>,
  seed: number,
  maxIterations: number,
  signal?: AbortSignal,
): Community<N>[] {
  const rng = mulberry32(seed);
  const labels = Object.fromEntries(
    graph.nodes.map((node) => [node.id, node.id]),
  ) as Record<string, string>;
  const order = graph.nodes.map((node) => node.id);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    throwIfAborted(signal);
    // Fisher-Yates shuffle of the visit order.
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }

    let changed = false;
    for (const nodeId of order) {
      const counts = new Map<string, number>();
      for (const neighbor of getUndirectedNeighbors(graph, nodeId)) {
        const label = labels[neighbor.nodeId];
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }
      if (counts.size === 0) continue;

      let maxCount = 0;
      for (const count of counts.values()) {
        if (count > maxCount) maxCount = count;
      }
      const best: string[] = [];
      for (const [label, count] of counts) {
        if (count === maxCount) best.push(label);
      }
      if (best.includes(labels[nodeId])) continue;

      labels[nodeId] = best[Math.floor(rng() * best.length)];
      changed = true;
    }

    if (!changed) break;
  }

  return normalizeCommunities(graph, labels);
}

/**
 * Returns label-propagation communities for the graph.
 *
 * The implementation is deterministic: ties are broken by lexicographic label
 * order so test results remain stable. Pass `options.seed` for the classic
 * asynchronous variant (shuffled node order per round, random tie-breaking)
 * — still deterministic per seed.
 *
 * Pass `options.signal` to cancel: the abort is checked once per iteration
 * and throws `signal.reason`.
 */
export function getLabelPropagationCommunities<N>(
  graph: Graph<N>,
  options?: LabelPropagationOptions,
): Community<N>[] {
  if (graph.nodes.length === 0) {
    return [];
  }

  const maxIterations = options?.maxIterations ?? 50;
  if (options?.seed !== undefined) {
    return getSeededLabelPropagation(
      graph,
      options.seed,
      maxIterations,
      options.signal,
    );
  }
  let labels = Object.fromEntries(
    graph.nodes.map((node) => [node.id, node.id]),
  ) as Record<string, string>;
  const nodeIds = graph.nodes.map((node) => node.id).sort();

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    throwIfAborted(options?.signal);
    const nextLabels = { ...labels };
    let changed = false;

    for (const nodeId of nodeIds) {
      const counts = new Map<string, number>();
      for (const neighbor of getUndirectedNeighbors(graph, nodeId)) {
        const label = labels[neighbor.nodeId];
        counts.set(label, (counts.get(label) ?? 0) + 1);
      }

      if (counts.size === 0) continue;

      const sorted = [...counts.entries()].sort((a, b) => {
        if (b[1] !== a[1]) return b[1] - a[1];
        return a[0].localeCompare(b[0]);
      });
      const bestLabel = sorted[0][0];
      if (bestLabel !== labels[nodeId]) {
        nextLabels[nodeId] = bestLabel;
        changed = true;
      }
    }

    labels = nextLabels;
    if (!changed) {
      break;
    }
  }

  return normalizeCommunities(graph, labels);
}

/**
 * Lazily yields Girvan-Newman community splits as edge betweenness removes
 * bridge-like edges from the graph.
 *
 * Pass `options.signal` to cancel: the abort is checked once per split round
 * and throws `signal.reason`.
 */
export function* genGirvanNewmanCommunities<N>(
  graph: Graph<N>,
  options?: GirvanNewmanOptions,
): Generator<Community<N>[]> {
  if (graph.nodes.length === 0 || graph.edges.length === 0) {
    return;
  }

  const maxLevels = options?.maxLevels ?? Number.POSITIVE_INFINITY;
  let yielded = 0;
  let edges = [...graph.edges];
  let previousCount = getUndirectedConnectedComponents(graph).length;

  while (edges.length > 0 && yielded < maxLevels) {
    throwIfAborted(options?.signal);
    const workingGraph = cloneWithEdges(graph, edges);
    const betweenness = getEdgeBetweenness(workingGraph);
    const maxScore = Math.max(...Object.values(betweenness));
    edges = edges.filter((edge) => betweenness[edge.id] < maxScore - 1e-12);

    const components = getUndirectedConnectedComponents(cloneWithEdges(graph, edges));
    if (components.length > previousCount) {
      yield components;
      yielded++;
      previousCount = components.length;
    }
  }
}

/**
 * Returns the requested Girvan-Newman split level eagerly.
 *
 * `level: 1` returns the first split yielded by `genGirvanNewmanCommunities`.
 *
 * Pass `options.signal` to cancel: the abort is checked once per split round
 * and throws `signal.reason`.
 */
export function getGirvanNewmanCommunities<N>(
  graph: Graph<N>,
  options?: GirvanNewmanOptions,
): Community<N>[] {
  if (graph.nodes.length === 0) {
    return [];
  }

  const targetLevel = options?.level ?? 1;
  if (targetLevel <= 0) {
    return getUndirectedConnectedComponents(graph);
  }

  let last = getUndirectedConnectedComponents(graph);
  let level = 0;
  for (const partition of genGirvanNewmanCommunities(graph, {
    maxLevels: targetLevel,
    signal: options?.signal,
  })) {
    last = partition;
    level++;
    if (level >= targetLevel) {
      break;
    }
  }
  return last;
}

/**
 * Returns the modularity score for a partition of communities.
 *
 * Community algorithms in this module treat the graph as undirected.
 */
export function getModularity<N>(
  graph: Graph<N>,
  communities: Community<N>[],
): number {
  if (graph.edges.length === 0 || communities.length === 0) {
    return 0;
  }

  const nodeIds = graph.nodes.map((node) => node.id);
  const adjacency = new Map<string, Map<string, number>>();
  const degree = Object.fromEntries(nodeIds.map((nodeId) => [nodeId, 0])) as Record<
    string,
    number
  >;

  for (const nodeId of nodeIds) {
    adjacency.set(nodeId, new Map());
  }

  for (const edge of graph.edges) {
    adjacency.get(edge.sourceId)!.set(
      edge.targetId,
      (adjacency.get(edge.sourceId)!.get(edge.targetId) ?? 0) + 1,
    );
    adjacency.get(edge.targetId)!.set(
      edge.sourceId,
      (adjacency.get(edge.targetId)!.get(edge.sourceId) ?? 0) + 1,
    );
    degree[edge.sourceId]++;
    degree[edge.targetId]++;
  }

  const m2 = graph.edges.length * 2;
  let modularity = 0;

  for (const community of toCommunityIds(communities)) {
    const ids = [...community];
    for (const i of ids) {
      for (const j of ids) {
        const aij = adjacency.get(i)!.get(j) ?? 0;
        modularity += aij - (degree[i] * degree[j]) / m2;
      }
    }
  }

  return modularity / m2;
}

/**
 * Returns communities found by greedily merging partitions that improve
 * modularity the most at each step.
 *
 * Pass `options.signal` to cancel: the abort is checked once per merge round
 * and throws `signal.reason`.
 */
export function getGreedyModularityCommunities<N>(
  graph: Graph<N>,
  options?: GreedyModularityOptions,
): Community<N>[] {
  if (graph.nodes.length === 0) {
    return [];
  }

  let communities = graph.nodes.map((node) => [node]);
  let currentScore = getModularity(graph, communities);

  while (communities.length > 1) {
    throwIfAborted(options?.signal);
    let bestScore = currentScore;
    let bestMerge: Community<N>[] | undefined;

    for (let i = 0; i < communities.length; i++) {
      for (let j = i + 1; j < communities.length; j++) {
        const merged = communities.filter((_, index) => index !== i && index !== j);
        merged.push([...communities[i], ...communities[j]].sort((a, b) => a.id.localeCompare(b.id)));
        const score = getModularity(graph, merged);
        if (score > bestScore + 1e-12) {
          bestScore = score;
          bestMerge = merged;
        }
      }
    }

    if (!bestMerge) {
      break;
    }

    communities = bestMerge.sort((a, b) => a[0].id.localeCompare(b[0].id));
    currentScore = bestScore;
  }

  return communities;
}
