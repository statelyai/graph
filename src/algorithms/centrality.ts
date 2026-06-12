import type { Graph, GraphEdge } from '../types';
import { getDegree, getInDegree, getOutDegree } from '../queries';
import { getCSR } from './csr';

export interface IterativeCentralityOptions {
  alpha?: number;
  maxIterations?: number;
  tolerance?: number;
}

export interface EigenvectorCentralityOptions<E = any>
  extends IterativeCentralityOptions {
  /** Edge weight accessor. Defaults to unweighted (every edge counts 1). */
  getWeight?: (edge: GraphEdge<E>) => number;
}

export interface KatzCentralityOptions<E = any>
  extends IterativeCentralityOptions {
  /** Constant added to every node each iteration. Defaults to `1`. */
  beta?: number;
  /** Edge weight accessor. Defaults to unweighted (every edge counts 1). */
  getWeight?: (edge: GraphEdge<E>) => number;
}

export interface HITSResult {
  hubs: Record<string, number>;
  authorities: Record<string, number>;
}

function getNodeIds(graph: Graph): string[] {
  return graph.nodes.map((node) => node.id);
}

function createEmptyScoreMap(graph: Graph): Record<string, number> {
  return Object.fromEntries(graph.nodes.map((node) => [node.id, 0]));
}

function normalizeTypedVector(values: Float64Array): void {
  let sumOfSquares = 0;
  for (let i = 0; i < values.length; i++) {
    sumOfSquares += values[i] * values[i];
  }
  const magnitude = Math.sqrt(sumOfSquares);
  if (magnitude === 0) return;
  for (let i = 0; i < values.length; i++) {
    values[i] /= magnitude;
  }
}

/**
 * BFS hop distances from a start position over the CSR arc snapshot.
 * `dist[i] === -1` means unreachable. Returns the visit count.
 */
function bfsDistances(
  csr: ReturnType<typeof getCSR>,
  start: number,
  dist: Int32Array,
  queue: Int32Array,
): number {
  dist.fill(-1);
  dist[start] = 0;
  queue[0] = start;
  let head = 0;
  let tail = 1;
  while (head < tail) {
    const u = queue[head++];
    const du = dist[u];
    for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
      const v = csr.outTargets[a];
      if (dist[v] === -1) {
        dist[v] = du + 1;
        queue[tail++] = v;
      }
    }
  }
  return tail;
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
  const csr = getCSR(graph);
  const order = csr.ids.length;
  const dist = new Int32Array(order);
  const queue = new Int32Array(order);

  for (let s = 0; s < order; s++) {
    const visited = bfsDistances(csr, s, dist, queue);
    const reachable = visited - 1; // excluding the start node itself
    if (reachable === 0) continue;

    let totalDistance = 0;
    for (let k = 0; k < visited; k++) totalDistance += dist[queue[k]];
    if (totalDistance === 0) continue;

    const closeness = reachable / totalDistance;
    scores[csr.ids[s]] =
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
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const totals = new Float64Array(n);
  const sigma = new Float64Array(n);
  const dist = new Int32Array(n);
  const delta = new Float64Array(n);
  // BFS visit order doubles as the stack: accumulate in reverse visit order
  const order_ = new Int32Array(n);

  for (let s = 0; s < n; s++) {
    sigma.fill(0);
    dist.fill(-1);
    delta.fill(0);
    sigma[s] = 1;
    dist[s] = 0;
    order_[0] = s;
    let head = 0;
    let tail = 1;

    while (head < tail) {
      const u = order_[head++];
      const du = dist[u];
      for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
        const v = csr.outTargets[a];
        if (dist[v] === -1) {
          dist[v] = du + 1;
          order_[tail++] = v;
        }
        if (dist[v] === du + 1) {
          sigma[v] += sigma[u];
        }
      }
    }

    // Accumulation: predecessors of w are exactly the origins of in-arcs
    // whose distance is dist[w] - 1, so no predecessor lists are stored.
    for (let k = tail - 1; k >= 0; k--) {
      const w = order_[k];
      const sigmaW = sigma[w];
      if (sigmaW === 0) continue;
      const coefficient = (1 + delta[w]) / sigmaW;
      for (let a = csr.inOffsets[w]; a < csr.inOffsets[w + 1]; a++) {
        const v = csr.inOrigins[a];
        if (dist[v] === dist[w] - 1) {
          delta[v] += sigma[v] * coefficient;
        }
      }
      if (w !== s) {
        totals[w] += delta[w];
      }
    }
  }

  const scores = createEmptyScoreMap(graph);
  for (let i = 0; i < n; i++) scores[csr.ids[i]] = totals[i];

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

  const csr = getCSR(graph);
  const n = csr.ids.length;
  let current = new Float64Array(n).fill(1 / n);
  // Seed from `scores` so callers' shape (Record keyed by id) stays authoritative
  for (let i = 0; i < n; i++) current[i] = scores[csr.ids[i]];

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const next = new Float64Array(n).fill((1 - alpha) / n);

    let danglingMass = 0;
    for (let u = 0; u < n; u++) {
      const arcCount = csr.outOffsets[u + 1] - csr.outOffsets[u];
      if (arcCount === 0) {
        danglingMass += current[u];
        continue;
      }
      const share = (alpha * current[u]) / arcCount;
      for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
        next[csr.outTargets[a]] += share;
      }
    }

    if (danglingMass > 0) {
      const share = (alpha * danglingMass) / n;
      for (let i = 0; i < n; i++) next[i] += share;
    }

    let diff = 0;
    for (let i = 0; i < n; i++) {
      diff = Math.max(diff, Math.abs(current[i] - next[i]));
    }
    current = next;
    if (diff <= tolerance) break;
  }

  for (let i = 0; i < n; i++) scores[csr.ids[i]] = current[i];

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
  const csr = getCSR(graph);
  const n = csr.ids.length;
  let hubs = new Float64Array(n).fill(1);
  let authorities = new Float64Array(n);

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const nextAuthorities = new Float64Array(n);
    for (let w = 0; w < n; w++) {
      for (let a = csr.inOffsets[w]; a < csr.inOffsets[w + 1]; a++) {
        nextAuthorities[w] += hubs[csr.inOrigins[a]];
      }
    }
    normalizeTypedVector(nextAuthorities);

    const nextHubs = new Float64Array(n);
    for (let u = 0; u < n; u++) {
      for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
        nextHubs[u] += nextAuthorities[csr.outTargets[a]];
      }
    }
    normalizeTypedVector(nextHubs);

    let diff = 0;
    for (let i = 0; i < n; i++) {
      diff = Math.max(
        diff,
        Math.abs(hubs[i] - nextHubs[i]),
        Math.abs(authorities[i] - nextAuthorities[i]),
      );
    }
    hubs = nextHubs;
    authorities = nextAuthorities;
    if (diff <= tolerance) break;
  }

  const hubScores = createEmptyScoreMap(graph);
  const authorityScores = createEmptyScoreMap(graph);
  for (let i = 0; i < n; i++) {
    hubScores[csr.ids[i]] = hubs[i];
    authorityScores[csr.ids[i]] = authorities[i];
  }
  return { hubs: hubScores, authorities: authorityScores };
}

/**
 * Returns eigenvector centrality scores for all nodes.
 *
 * Power iteration with the `A + I` shift (same scheme as graphology and
 * networkx, so bipartite structures converge instead of oscillating).
 * Scores flow along edge direction: a node's score is fed by its incoming
 * neighbors; undirected edges feed both endpoints. The result vector is
 * Euclidean (L2) normalized.
 *
 * Throws when the iteration has not converged (L1 error < `n × tolerance`)
 * within `maxIterations`.
 */
export function getEigenvectorCentrality<N, E>(
  graph: Graph<N, E>,
  options?: EigenvectorCentralityOptions<E>,
): Record<string, number> {
  const nodeIds = getNodeIds(graph);
  if (nodeIds.length === 0) {
    return {};
  }

  const maxIterations = options?.maxIterations ?? 100;
  const tolerance = options?.tolerance ?? 1e-6;
  const getWeight = options?.getWeight;
  const csr = getCSR(graph);
  const n = csr.ids.length;
  let current = new Float64Array(n).fill(1 / n);
  let converged = false;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    // Start from `current` (the implicit +I) so bipartite graphs converge.
    const next = Float64Array.from(current);
    for (let w = 0; w < n; w++) {
      for (let a = csr.inOffsets[w]; a < csr.inOffsets[w + 1]; a++) {
        const weight = getWeight
          ? getWeight(graph.edges[csr.inEdgeIndex[a]] as GraphEdge<E>)
          : 1;
        next[w] += current[csr.inOrigins[a]] * weight;
      }
    }
    normalizeTypedVector(next);

    let error = 0;
    for (let i = 0; i < n; i++) {
      error += Math.abs(next[i] - current[i]);
    }
    current = next;
    if (error < n * tolerance) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    throw new Error(
      `getEigenvectorCentrality: power iteration failed to converge within ${maxIterations} iterations (tolerance ${tolerance}) — increase options.maxIterations or loosen options.tolerance`,
    );
  }

  const scores = createEmptyScoreMap(graph);
  for (let i = 0; i < n; i++) scores[csr.ids[i]] = current[i];
  return scores;
}

/**
 * Returns Katz centrality scores for all nodes.
 *
 * Iterates `x' = alpha · Aᵀx + beta` to its fixed point (networkx-style),
 * then Euclidean (L2) normalizes the result. Scores flow along edge
 * direction: a node's score is fed by its incoming neighbors; undirected
 * edges feed both endpoints.
 *
 * Converges only when `alpha` is below the reciprocal of the largest
 * eigenvalue of the adjacency matrix; throws when the iteration has not
 * converged (L1 error < `n × tolerance`) within `maxIterations`.
 */
export function getKatzCentrality<N, E>(
  graph: Graph<N, E>,
  options?: KatzCentralityOptions<E>,
): Record<string, number> {
  const nodeIds = getNodeIds(graph);
  if (nodeIds.length === 0) {
    return {};
  }

  const alpha = options?.alpha ?? 0.1;
  const beta = options?.beta ?? 1;
  const maxIterations = options?.maxIterations ?? 100;
  const tolerance = options?.tolerance ?? 1e-6;
  const getWeight = options?.getWeight;
  const csr = getCSR(graph);
  const n = csr.ids.length;
  let current = new Float64Array(n);
  let converged = false;

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    const next = new Float64Array(n).fill(beta);
    for (let w = 0; w < n; w++) {
      for (let a = csr.inOffsets[w]; a < csr.inOffsets[w + 1]; a++) {
        const weight = getWeight
          ? getWeight(graph.edges[csr.inEdgeIndex[a]] as GraphEdge<E>)
          : 1;
        next[w] += alpha * current[csr.inOrigins[a]] * weight;
      }
    }

    let error = 0;
    for (let i = 0; i < n; i++) {
      error += Math.abs(next[i] - current[i]);
    }
    current = next;
    if (error < n * tolerance) {
      converged = true;
      break;
    }
  }

  if (!converged) {
    throw new Error(
      `getKatzCentrality: iteration failed to converge within ${maxIterations} iterations — alpha ${alpha} may be >= 1/λ_max of the adjacency matrix; decrease options.alpha or increase options.maxIterations`,
    );
  }

  normalizeTypedVector(current);
  const scores = createEmptyScoreMap(graph);
  for (let i = 0; i < n; i++) scores[csr.ids[i]] = current[i];
  return scores;
}
