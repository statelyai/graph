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
import { getGraphSnapshot, getIndex } from '../indexing';
import { getEdgeMode } from '../mode';
import { getNeighborEdges, resolveFrom, resolveFromIds } from './shared';
import {
  getArcWeights,
  getCSR,
  getEdgeOrderArcs,
  type GraphCSR,
} from './csr';
import { throwIfAborted } from './abort';
import { addFiniteNumbers, assertFiniteNumber } from './numeric';

function assertFiniteEdgeWeight(
  graph: Graph<any, any>,
  edgeIndex: number,
  weight: number,
  algorithmName: string,
): number {
  return assertFiniteNumber(
    weight,
    `${algorithmName}: weight for edge "${graph.edges[edgeIndex].id}"`,
  );
}

function addPathCost(left: number, right: number, algorithmName: string): number {
  return addFiniteNumbers(left, right, `${algorithmName}: path cost`);
}

/** Cold path: load the offending edge and throw the negative-weight error. */
function throwNegativeWeight(
  graph: Graph<any, any>,
  edgeIndex: number,
  weight: number,
  algorithmName: string,
  remedy: string,
): never {
  const edge = graph.edges[edgeIndex];
  throw new Error(
    `Negative edge weight ${weight} on edge "${edge.sourceId}->${edge.targetId}" (id "${edge.id}"): ${algorithmName} requires non-negative weights. ${remedy}`,
  );
}

/**
 * Flat binary min-heap of `(distance, node position)` entries in parallel
 * typed arrays. The Dijkstra/A* hot loops push one entry per relaxation, so
 * avoiding a `{ pos, dist }` wrapper object per push (allocation + property
 * loads in the sift comparisons) is a measurable win on 10k+ node graphs.
 * Sifts move "holes" instead of swapping, halving array writes.
 */
class TypedMinHeap {
  private keys: Float64Array;
  private vals: Int32Array;
  size = 0;

  constructor(capacity: number) {
    const cap = Math.max(capacity, 16);
    this.keys = new Float64Array(cap);
    this.vals = new Int32Array(cap);
  }

  push(key: number, val: number): void {
    if (this.size === this.keys.length) {
      const keys = new Float64Array(this.keys.length * 2);
      const vals = new Int32Array(this.vals.length * 2);
      keys.set(this.keys);
      vals.set(this.vals);
      this.keys = keys;
      this.vals = vals;
    }
    const { keys, vals } = this;
    let hole = this.size++;
    while (hole > 0) {
      const parent = (hole - 1) >> 1;
      if (keys[parent] <= key) break;
      keys[hole] = keys[parent];
      vals[hole] = vals[parent];
      hole = parent;
    }
    keys[hole] = key;
    vals[hole] = val;
  }

  /** Key of the minimum entry; garbage when empty (check `size` first). */
  peekKey(): number {
    return this.keys[0];
  }

  /** Value of the minimum entry; garbage when empty (check `size` first). */
  peekVal(): number {
    return this.vals[0];
  }

  /** Remove the minimum entry (no-op shape: read via peek* first). */
  pop(): void {
    const { keys, vals } = this;
    const last = --this.size;
    if (last === 0) return;
    const key = keys[last];
    const val = vals[last];
    let hole = 0;
    for (;;) {
      let child = hole * 2 + 1;
      if (child >= last) break;
      const right = child + 1;
      if (right < last && keys[right] < keys[child]) child = right;
      if (keys[child] >= key) break;
      keys[hole] = keys[child];
      vals[hole] = vals[child];
      hole = child;
    }
    keys[hole] = key;
    vals[hole] = val;
  }
}

/**
 * Result of a single-source shortest-distance search, kept in typed-array
 * form keyed by CSR node position. Paths are *not* materialized here —
 * {@link genPredecessorPaths} walks `prevArr` on demand, so abandoning a
 * `genShortestPaths` iterator early never pays for paths it didn't yield.
 */
interface ShortestDistancesResult {
  /** CSR position of the source, or -1 if the source id is unknown. */
  source: number;
  /** Distance per node position; `Infinity` = unreached. */
  distArr: Float64Array;
  /**
   * Tie predecessors per node position as flat `(fromPos, edgeIndex)` pairs;
   * `undefined` = unreached. Entries for nodes with distance beyond
   * `stopDistance` are tentative (unsettled) — callers must filter targets
   * by `stopDistance`; predecessors of any valid target are always settled
   * (their distance is ≤ the target's).
   */
  prevArr: Array<number[] | undefined>;
  /** Settled horizon after an early exit; `Infinity` for a full search. */
  stopDistance: number;
}

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
): ShortestDistancesResult {
  if (algorithm === 'bellman-ford') {
    return bellmanFordTyped(graph, sourceId, getWeight);
  }

  const csr = getCSR(graph);
  const n = csr.ids.length;
  const source = csr.indexOf.get(sourceId);
  if (source === undefined) {
    // Unknown source id: nothing is reachable (matches pre-CSR behavior)
    return {
      source: -1,
      distArr: new Float64Array(0),
      prevArr: [],
      stopDistance: Infinity,
    };
  }

  const distArr = new Float64Array(n).fill(Infinity);
  // Tie predecessors per node as (fromPos, edgeIndex) pairs
  const prevArr: Array<number[] | undefined> = new Array(n);
  distArr[source] = 0;
  prevArr[source] = [];

  const stopAt = stopAtId !== undefined ? csr.indexOf.get(stopAtId) : undefined;
  let stopDistance = Infinity;

  assertNoNegativeWeights(
    graph,
    csr,
    getWeight,
    'Dijkstra',
    "Use { algorithm: 'bellman-ford' } instead.",
  );

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
          prevArr[v]!.push(u, csr.outEdgeIndex[a]);
        }
      }
    }
  } else {
    // Default weights come from the CSR's cached per-arc Float64Array — no
    // edge-object loads in the hot loop. Custom getWeight loads the edge.
    const arcWeights = getWeight ? undefined : getArcWeights(graph, csr).out;
    const visited = new Uint8Array(n);
    const pq = new TypedMinHeap(n);
    pq.push(0, source);

    while (pq.size > 0) {
      const distance = pq.peekKey();
      const u = pq.peekVal();
      pq.pop();
      if (visited[u] || distance !== distArr[u]) continue;
      // Early exit: all nodes at distance ≤ dist(target) are settled
      if (distance > stopDistance) break;
      if (u === stopAt) stopDistance = distance;
      visited[u] = 1;

      for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
        const weight = assertFiniteEdgeWeight(
          graph,
          csr.outEdgeIndex[a],
          arcWeights
            ? arcWeights[a]
            : getWeight!(graph.edges[csr.outEdgeIndex[a]] as GraphEdge<E>),
          'Dijkstra',
        );
        if (weight < 0) {
          throwNegativeWeight(
            graph,
            csr.outEdgeIndex[a],
            weight,
            'Dijkstra',
            "Use { algorithm: 'bellman-ford' } instead.",
          );
        }
        const v = csr.outTargets[a];
        const nextDistance = addPathCost(distance, weight, 'Dijkstra');

        if (nextDistance < distArr[v]) {
          distArr[v] = nextDistance;
          prevArr[v] = [u, csr.outEdgeIndex[a]];
          pq.push(nextDistance, v);
        } else if (nextDistance === distArr[v] && distArr[v] !== Infinity) {
          prevArr[v]!.push(u, csr.outEdgeIndex[a]);
        }
      }
    }
  }

  return { source, distArr, prevArr, stopDistance };
}

/**
 * Bellman-Ford over compact typed arc arrays. Arcs are laid out in edge
 * order (forward, then the reverse arc for non-directed edges) so the
 * relaxation order — and therefore tie-predecessor order — matches the
 * classic edge-list formulation. Weights are evaluated once per arc.
 */
function bellmanFordTyped<N, E>(
  graph: Graph<N, E>,
  sourceId: string,
  getWeight?: (edge: GraphEdge<E>) => number,
): ShortestDistancesResult {
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const source = csr.indexOf.get(sourceId);
  if (source === undefined) {
    return {
      source: -1,
      distArr: new Float64Array(0),
      prevArr: [],
      stopDistance: Infinity,
    };
  }

  assertFiniteWeights(graph, csr, getWeight, 'Bellman-Ford');

  // Cached compact arcs in edge order; custom weights overlay the endpoints
  const arcs = getEdgeOrderArcs(graph, csr);
  const arcCount = arcs.count;
  const arcFrom = arcs.from;
  const arcTo = arcs.to;
  const arcEdge = arcs.edge;
  let arcWeight = arcs.weight;
  if (getWeight) {
    arcWeight = new Float64Array(arcCount);
    for (let a = 0; a < arcCount; a++) {
      arcWeight[a] = getWeight(graph.edges[arcEdge[a]] as GraphEdge<E>);
    }
  }

  const distArr = new Float64Array(n).fill(Infinity);
  const prevArr: Array<number[] | undefined> = new Array(n);
  distArr[source] = 0;
  prevArr[source] = [];

  for (let round = 1; round < n; round++) {
    let changed = false;
    for (let a = 0; a < arcCount; a++) {
      const du = distArr[arcFrom[a]];
      if (du === Infinity) continue;
      const nextDistance = addPathCost(du, arcWeight[a], 'Bellman-Ford');
      const t = arcTo[a];
      const existing = distArr[t];
      if (nextDistance < existing) {
        distArr[t] = nextDistance;
        prevArr[t] = [arcFrom[a], arcEdge[a]];
        changed = true;
      } else if (nextDistance === existing && existing !== Infinity) {
        const pairs = prevArr[t]!;
        const from = arcFrom[a];
        const edgeIndex = arcEdge[a];
        let seen = false;
        for (let k = 0; k < pairs.length; k += 2) {
          if (pairs[k] === from && pairs[k + 1] === edgeIndex) {
            seen = true;
            break;
          }
        }
        if (!seen) pairs.push(from, edgeIndex);
      }
    }
    if (!changed) break;
  }

  for (let a = 0; a < arcCount; a++) {
    const du = distArr[arcFrom[a]];
    if (du === Infinity) continue;
    if (addPathCost(du, arcWeight[a], 'Bellman-Ford') < distArr[arcTo[a]]) {
      throw new Error(
        'Graph contains a negative-weight cycle reachable from the source node',
      );
    }
  }

  return { source, distArr, prevArr, stopDistance: Infinity };
}

/**
 * Yields every path from `sourcePos` to `targetPos` through predecessor
 * pairs (`[fromPos, edgeIndex, …]` per node position, as recorded for tied
 * shortest paths). Walks backward from the target with an explicit stack and
 * one shared step buffer, so each path costs one O(length) reversed copy and
 * long paths cannot overflow the call stack. Nodes already on the partial
 * path are skipped: zero-weight ties can make the predecessors cyclic.
 */
function* genPredecessorPaths<N, E>(
  getPairs: (pos: number) => number[] | undefined,
  nodes: readonly GraphNode<N>[],
  edges: readonly GraphEdge<E>[],
  sourcePos: number,
  targetPos: number,
): Generator<GraphPath<N, E>> {
  const sourceNode = nodes[sourcePos];
  if (targetPos === sourcePos) {
    yield { source: sourceNode, steps: [] };
    return;
  }
  const stepsBackward: GraphStep<N, E>[] = [];
  const stackPos = [targetPos];
  const stackPair = [0];
  const onPath = new Set<number>([targetPos]);
  while (stackPos.length > 0) {
    const top = stackPos.length - 1;
    const pos = stackPos[top];
    const pairs = getPairs(pos);
    const k = stackPair[top];
    if (!pairs || k >= pairs.length) {
      onPath.delete(pos);
      stackPos.pop();
      stackPair.pop();
      if (top > 0) stepsBackward.pop();
      continue;
    }
    stackPair[top] = k + 2;
    const fromPos = pairs[k];
    if (onPath.has(fromPos)) continue;
    stepsBackward.push({ edge: edges[pairs[k + 1]], node: nodes[pos] });
    if (fromPos === sourcePos) {
      const length = stepsBackward.length;
      const steps = new Array<GraphStep<N, E>>(length);
      for (let i = 0; i < length; i++) steps[i] = stepsBackward[length - 1 - i];
      yield { source: sourceNode, steps };
      stepsBackward.pop();
      continue;
    }
    stackPos.push(fromPos);
    stackPair.push(0);
    onPath.add(fromPos);
  }
}

export function* genShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E, N>,
): Generator<GraphPath<N, E>> {
  graph = getGraphSnapshot(graph);
  for (const sourceId of resolveFromIds(graph, opts?.from)) {
    yield* genShortestPathsFrom(graph, sourceId, opts);
  }
}

function* genShortestPathsFrom<N, E>(
  graph: Graph<N, E>,
  sourceId: string,
  opts?: PathOptions<E, N>,
): Generator<GraphPath<N, E>> {
  const { source, distArr, prevArr, stopDistance } = computeShortestDistances(
    graph,
    sourceId,
    opts?.getWeight,
    opts?.algorithm,
    opts?.to, // single-target queries early-exit the search
  );

  // Unknown source id: there is no path, not even a trivial one.
  if (source === -1) return;

  const csr = getCSR(graph);

  if (opts?.to) {
    const target = csr.indexOf.get(opts.to);
    // After an early exit, distances beyond the settled horizon are
    // tentative — such nodes are not valid targets.
    if (
      target === undefined ||
      distArr[target] === Infinity ||
      distArr[target] > stopDistance
    ) {
      return;
    }
    yield* genPredecessorPaths<N, E>(
      (pos) => prevArr[pos],
      graph.nodes as GraphNode<N>[],
      graph.edges as GraphEdge<E>[],
      source,
      target,
    );
    return;
  }

  for (let target = 0; target < distArr.length; target++) {
    if (
      target === source ||
      distArr[target] === Infinity ||
      distArr[target] > stopDistance
    ) {
      continue;
    }
    yield* genPredecessorPaths<N, E>(
      (pos) => prevArr[pos],
      graph.nodes as GraphNode<N>[],
      graph.edges as GraphEdge<E>[],
      source,
      target,
    );
  }
}

export function getShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E, N>,
): GraphPath<N, E>[] {
  return [...genShortestPaths(graph, opts)];
}

export function getShortestPath<N, E>(
  graph: Graph<N, E>,
  opts: SinglePathOptions<E, N>,
): GraphPath<N, E> | undefined {
  if (typeof opts.from === 'function') {
    let best: GraphPath<N, E> | undefined;
    let bestWeight = Infinity;
    const getWeight = opts.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
    for (const sourceId of resolveFromIds(graph, opts.from)) {
      const candidate = getShortestPath(graph, { ...opts, from: sourceId });
      if (!candidate) continue;
      const weight = candidate.steps.reduce(
        (total, step) => total + getWeight(step.edge),
        0,
      );
      if (weight < bestWeight) {
        best = candidate;
        bestWeight = weight;
      }
    }
    return best;
  }
  // Single-pair queries use bidirectional Dijkstra — on random/small-world
  // graphs the two half-balls meet long before a unidirectional search would
  // reach the target. Bellman-Ford (negative weights) keeps the full
  // relaxation but skips tie-predecessor bookkeeping for the one path.
  const sourceId = resolveFrom(
    graph,
    typeof opts.from === 'string' ? { from: opts.from } : undefined,
  );
  if (opts.algorithm !== 'bellman-ford') {
    return bidirectionalShortestPath(graph, sourceId, opts.to, opts.getWeight);
  }
  return bellmanFordSinglePath(graph, sourceId, opts.to, opts.getWeight);
}

/**
 * Single-pair Bellman-Ford: same relaxation (and negative-cycle contract) as
 * the all-targets search, but with scalar predecessors — the returned path
 * matches the first path {@link genShortestPaths} would yield, because that
 * enumeration follows the predecessor recorded by the last strict improvement.
 */
function bellmanFordSinglePath<N, E>(
  graph: Graph<N, E>,
  sourceId: string,
  targetId: string,
  getWeight?: (edge: GraphEdge<E>) => number,
): GraphPath<N, E> | undefined {
  const csr = getCSR(graph);
  const source = csr.indexOf.get(sourceId);
  const target = csr.indexOf.get(targetId);
  if (source === undefined || target === undefined) return undefined;

  assertFiniteWeights(graph, csr, getWeight, 'Bellman-Ford');

  const n = csr.ids.length;
  const arcs = getEdgeOrderArcs(graph, csr);
  const arcCount = arcs.count;
  const arcFrom = arcs.from;
  const arcTo = arcs.to;
  const arcEdge = arcs.edge;
  let arcWeight = arcs.weight;
  if (getWeight) {
    arcWeight = new Float64Array(arcCount);
    for (let a = 0; a < arcCount; a++) {
      arcWeight[a] = getWeight(graph.edges[arcEdge[a]] as GraphEdge<E>);
    }
  }

  const distArr = new Float64Array(n).fill(Infinity);
  const prevNode = new Int32Array(n).fill(-1);
  const prevEdge = new Int32Array(n).fill(-1);
  distArr[source] = 0;

  for (let round = 1; round < n; round++) {
    let changed = false;
    for (let a = 0; a < arcCount; a++) {
      const du = distArr[arcFrom[a]];
      if (du === Infinity) continue;
      const nextDistance = addPathCost(du, arcWeight[a], 'Bellman-Ford');
      const t = arcTo[a];
      if (nextDistance < distArr[t]) {
        distArr[t] = nextDistance;
        prevNode[t] = arcFrom[a];
        prevEdge[t] = arcEdge[a];
        changed = true;
      }
    }
    if (!changed) break;
  }

  for (let a = 0; a < arcCount; a++) {
    const du = distArr[arcFrom[a]];
    if (du === Infinity) continue;
    if (addPathCost(du, arcWeight[a], 'Bellman-Ford') < distArr[arcTo[a]]) {
      throw new Error(
        'Graph contains a negative-weight cycle reachable from the source node',
      );
    }
  }

  if (distArr[target] === Infinity) return undefined;

  const sourceNode = graph.nodes[source] as GraphNode<N>;
  const steps: GraphStep<N, E>[] = [];
  for (let v = target; v !== source; v = prevNode[v]) {
    steps.push({
      edge: graph.edges[prevEdge[v]] as GraphEdge<E>,
      node: graph.nodes[v] as GraphNode<N>,
    });
  }
  steps.reverse();
  return { source: sourceNode, steps };
}

/**
 * Sublinear searches (early-exit, bidirectional) may legitimately terminate
 * without ever scanning a negative edge, so the throw-on-negative contract
 * must be enforced up front: O(1) via the CSR's cached flag for the default
 * weight, or one O(edges) sweep for a custom `getWeight`.
 */
function assertNoNegativeWeights<N, E>(
  graph: Graph<N, E>,
  csr: ReturnType<typeof getCSR>,
  getWeight: ((edge: GraphEdge<E>) => number) | undefined,
  algorithmName: string,
  remedy: string,
): void {
  let offending: GraphEdge<E> | undefined;
  let weight = 0;
  if (getWeight === undefined) {
    if (csr.firstNonFiniteWeightEdge !== -1) {
      const edge = graph.edges[csr.firstNonFiniteWeightEdge] as GraphEdge<E>;
      assertFiniteEdgeWeight(
        graph,
        csr.firstNonFiniteWeightEdge,
        edge.weight ?? 1,
        algorithmName,
      );
    }
    if (csr.firstNegativeEdge !== -1) {
      offending = graph.edges[csr.firstNegativeEdge] as GraphEdge<E>;
      weight = offending.weight ?? 1;
    }
  } else {
    for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
      const edge = graph.edges[edgeIndex] as GraphEdge<E>;
      const w = getWeight(edge as GraphEdge<E>);
      assertFiniteEdgeWeight(graph, edgeIndex, w, algorithmName);
      if (w < 0) {
        offending = edge as GraphEdge<E>;
        weight = w;
        break;
      }
    }
  }
  if (offending) {
    throw new Error(
      `Negative edge weight ${weight} on edge "${offending.sourceId}->${offending.targetId}" (id "${offending.id}"): ${algorithmName} requires non-negative weights. ${remedy}`,
    );
  }
}

function assertFiniteWeights<N, E>(
  graph: Graph<N, E>,
  csr: ReturnType<typeof getCSR>,
  getWeight: ((edge: GraphEdge<E>) => number) | undefined,
  algorithmName: string,
): void {
  if (getWeight === undefined) {
    if (csr.firstNonFiniteWeightEdge === -1) return;
    const edge = graph.edges[csr.firstNonFiniteWeightEdge] as GraphEdge<E>;
    assertFiniteEdgeWeight(
      graph,
      csr.firstNonFiniteWeightEdge,
      edge.weight ?? 1,
      algorithmName,
    );
    return;
  }
  for (let edgeIndex = 0; edgeIndex < graph.edges.length; edgeIndex++) {
    assertFiniteEdgeWeight(
      graph,
      edgeIndex,
      getWeight(graph.edges[edgeIndex] as GraphEdge<E>),
      algorithmName,
    );
  }
}

/**
 * Bidirectional Dijkstra for a single source→target query. Forward search
 * runs on the traversable arcs, backward search on the reverse arcs; `mu`
 * tracks the best meeting cost and the search stops when the two frontiers
 * prove no better meeting exists (Pohl's `topF + topB >= mu` condition).
 * Returns one shortest path (ties broken arbitrarily, as before).
 */
function bidirectionalShortestPath<N, E>(
  graph: Graph<N, E>,
  sourceId: string,
  targetId: string,
  getWeight?: (edge: GraphEdge<E>) => number,
): GraphPath<N, E> | undefined {
  const csr = getCSR(graph);
  const source = csr.indexOf.get(sourceId);
  const target = csr.indexOf.get(targetId);
  if (source === undefined || target === undefined) return undefined;

  const sourceNode = graph.nodes[source];
  if (source === target) return { source: sourceNode, steps: [] };

  assertNoNegativeWeights(
    graph,
    csr,
    getWeight,
    'Dijkstra',
    "Use { algorithm: 'bellman-ford' } instead.",
  );

  const arcWeights = getWeight ? undefined : getArcWeights(graph, csr);
  const n = csr.ids.length;
  const distF = new Float64Array(n).fill(Infinity);
  const distB = new Float64Array(n).fill(Infinity);
  const predF = new Int32Array(n).fill(-1);
  const predFEdge = new Int32Array(n).fill(-1);
  const predB = new Int32Array(n).fill(-1); // next node *toward the target*
  const predBEdge = new Int32Array(n).fill(-1);
  const settledF = new Uint8Array(n);
  const settledB = new Uint8Array(n);
  const pqF = new TypedMinHeap(n);
  const pqB = new TypedMinHeap(n);

  distF[source] = 0;
  distB[target] = 0;
  pqF.push(0, source);
  pqB.push(0, target);

  let mu = Infinity;
  let meet = -1;

  /** Discard stale/settled heap entries; return the next valid key. */
  const validTop = (
    pq: TypedMinHeap,
    dist: Float64Array,
    settled: Uint8Array,
  ): number | undefined => {
    while (pq.size > 0) {
      const key = pq.peekKey();
      const pos = pq.peekVal();
      if (settled[pos] || key !== dist[pos]) {
        pq.pop();
        continue;
      }
      return key;
    }
    return undefined;
  };

  const scanForward = () => {
    const d = pqF.peekKey();
    const u = pqF.peekVal();
    pqF.pop();
    settledF[u] = 1;
    for (let a = csr.outOffsets[u]; a < csr.outOffsets[u + 1]; a++) {
      const weight = arcWeights
        ? arcWeights.out[a]
        : getWeight!(graph.edges[csr.outEdgeIndex[a]] as GraphEdge<E>);
      const v = csr.outTargets[a];
      const next = addPathCost(d, weight, 'Dijkstra');
      if (next < distF[v]) {
        distF[v] = next;
        predF[v] = u;
        predFEdge[v] = csr.outEdgeIndex[a];
        pqF.push(next, v);
      }
      // distB[v] is the cost of a real backward path (tentative or settled),
      // so next + distB[v] is the cost of a real s→t path
      if (distB[v] !== Infinity) {
        const candidate = addPathCost(next, distB[v], 'Dijkstra');
        if (candidate < mu) {
          mu = candidate;
          meet = v;
        }
      }
    }
  };

  const scanBackward = () => {
    const d = pqB.peekKey();
    const u = pqB.peekVal();
    pqB.pop();
    settledB[u] = 1;
    for (let a = csr.inOffsets[u]; a < csr.inOffsets[u + 1]; a++) {
      const weight = arcWeights
        ? arcWeights.in[a]
        : getWeight!(graph.edges[csr.inEdgeIndex[a]] as GraphEdge<E>);
      const v = csr.inOrigins[a];
      const next = addPathCost(d, weight, 'Dijkstra');
      if (next < distB[v]) {
        distB[v] = next;
        predB[v] = u;
        predBEdge[v] = csr.inEdgeIndex[a];
        pqB.push(next, v);
      }
      if (distF[v] !== Infinity) {
        const candidate = addPathCost(next, distF[v], 'Dijkstra');
        if (candidate < mu) {
          mu = candidate;
          meet = v;
        }
      }
    }
  };

  for (;;) {
    const topF = validTop(pqF, distF, settledF);
    const topB = validTop(pqB, distB, settledB);
    // A side running dry means its dist array is final everywhere reachable,
    // so mu already equals the optimum (or stays Infinity: no path)
    if (topF === undefined || topB === undefined) break;
    if (addPathCost(topF, topB, 'Dijkstra') >= mu) break;
    if (topF <= topB) scanForward();
    else scanBackward();
  }

  if (meet === -1) return undefined;

  // Forward half: meet → source, reversed
  const steps: GraphStep<N, E>[] = [];
  for (let v = meet; v !== source; v = predF[v]) {
    steps.unshift({
      edge: graph.edges[predFEdge[v]] as GraphEdge<E>,
      node: graph.nodes[v],
    });
  }
  // Backward half: meet → target
  for (let v = meet; v !== target; ) {
    const nextNode = predB[v];
    steps.push({
      edge: graph.edges[predBEdge[v]] as GraphEdge<E>,
      node: graph.nodes[nextNode],
    });
    v = nextNode;
  }
  return { source: sourceNode, steps };
}

export function getSimplePaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E, N>,
): GraphPath<N, E>[] {
  return [...genSimplePaths(graph, opts)];
}

export function* genSimplePaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E, N>,
): Generator<GraphPath<N, E>> {
  graph = getGraphSnapshot(graph);
  for (const sourceId of resolveFromIds(graph, opts?.from)) {
    yield* genSimplePathsFrom(graph, sourceId, opts);
  }
}

function* genSimplePathsFrom<N, E>(
  graph: Graph<N, E>,
  sourceId: string,
  opts?: PathOptions<E, N>,
): Generator<GraphPath<N, E>> {
  const idx = getIndex(graph);
  const sourceNi = idx.nodeById.get(sourceId);
  // Unknown source id: there is no path, not even a trivial one.
  if (sourceNi === undefined) return;
  const sourceNode = graph.nodes[sourceNi];
  const targetId = opts?.to;
  if (targetId === sourceId) {
    yield { source: sourceNode, steps: [] };
    return;
  }

  // Iterative DFS: each frame is a node's neighbor list and the next index
  // in it; frame k > 0 belongs to the node reached by currentSteps[k - 1].
  const visited = new Set<string>([sourceId]);
  const currentSteps: GraphStep<N, E>[] = [];
  const stackNeighbors = [getNeighborEdges(graph, sourceId)];
  const stackIndex = [0];
  while (stackNeighbors.length > 0) {
    const top = stackNeighbors.length - 1;
    const neighbors = stackNeighbors[top];
    if (stackIndex[top] === neighbors.length) {
      stackNeighbors.pop();
      stackIndex.pop();
      if (top > 0) visited.delete(currentSteps.pop()!.node.id);
      continue;
    }
    const { neighborId, edge } = neighbors[stackIndex[top]++];
    if (visited.has(neighborId)) continue;
    const neighborNi = idx.nodeById.get(neighborId);
    if (neighborNi === undefined) continue; // dangling edge
    currentSteps.push({ edge: edge as GraphEdge<E>, node: graph.nodes[neighborNi] });
    if (targetId === undefined) {
      yield { source: sourceNode, steps: [...currentSteps] };
    } else if (neighborId === targetId) {
      yield { source: sourceNode, steps: [...currentSteps] };
      currentSteps.pop();
      continue;
    }
    visited.add(neighborId);
    stackNeighbors.push(getNeighborEdges(graph, neighborId));
    stackIndex.push(0);
  }
}

export function getSimplePath<N, E>(
  graph: Graph<N, E>,
  opts: SinglePathOptions<E, N>,
): GraphPath<N, E> | undefined {
  for (const path of genSimplePaths(graph, opts)) {
    return path;
  }
  return undefined;
}

export function getStronglyConnectedComponents<N>(
  graph: Graph<N>,
): GraphNode<N>[][] {
  // Iterative Tarjan over the CSR out-arcs (non-directed edges contribute
  // arcs both ways there, i.e. mutual reachability). One pass, typed-array
  // state, no recursion — stack-safe on deep graphs.
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const nodes = graph.nodes;
  const outOffsets = csr.outOffsets;
  const outTargets = csr.outTargets;
  const result: GraphNode<N>[][] = [];

  const order = new Int32Array(n).fill(-1); // discovery index; -1 = unvisited
  const lowlink = new Int32Array(n);
  const onStack = new Uint8Array(n);
  const sccStack = new Int32Array(n);
  let sccTop = 0;
  // Explicit DFS call stack: node + its next-arc cursor per frame
  const frameNodes = new Int32Array(n);
  const frameArcs = new Int32Array(n);
  let counter = 0;

  for (let root = 0; root < n; root++) {
    if (order[root] !== -1) continue;
    let top = 0;
    frameNodes[0] = root;
    frameArcs[0] = outOffsets[root];
    order[root] = lowlink[root] = counter++;
    sccStack[sccTop++] = root;
    onStack[root] = 1;

    while (top >= 0) {
      const u = frameNodes[top];
      const a = frameArcs[top];
      if (a < outOffsets[u + 1]) {
        frameArcs[top] = a + 1;
        const v = outTargets[a];
        if (order[v] === -1) {
          order[v] = lowlink[v] = counter++;
          sccStack[sccTop++] = v;
          onStack[v] = 1;
          top++;
          frameNodes[top] = v;
          frameArcs[top] = outOffsets[v];
        } else if (onStack[v] && order[v] < lowlink[u]) {
          lowlink[u] = order[v];
        }
      } else {
        if (lowlink[u] === order[u]) {
          const component: GraphNode<N>[] = [];
          for (;;) {
            const w = sccStack[--sccTop];
            onStack[w] = 0;
            component.push(nodes[w]);
            if (w === u) break;
          }
          result.push(component);
        }
        top--;
        if (top >= 0 && lowlink[u] < lowlink[frameNodes[top]]) {
          lowlink[frameNodes[top]] = lowlink[u];
        }
      }
    }
  }

  return result;
}

export function getCycles<N, E>(graph: Graph<N, E>): GraphPath<N, E>[] {
  return [...genCycles(graph)];
}

/**
 * Traversable arcs for cycle search, grouped by origin position in edge
 * order: one arc per directed edge, both directions per non-directed edge
 * (a single arc for a non-directed self-loop). Dangling edges are skipped.
 */
interface CycleArcs {
  offsets: Int32Array;
  targets: Int32Array;
  /** arc → index into `graph.edges` */
  edges: Int32Array;
  /** edge index → 1 when the edge's effective mode is `'directed'` */
  directed: Uint8Array;
}

function getCycleArcs(graph: Graph, csr: GraphCSR): CycleArcs {
  const n = csr.ids.length;
  const m = graph.edges.length;
  const from = new Int32Array(m).fill(-1);
  const to = new Int32Array(m);
  const directed = new Uint8Array(m);
  const counts = new Int32Array(n);
  for (let e = 0; e < m; e++) {
    const edge = graph.edges[e];
    const s = csr.indexOf.get(edge.sourceId);
    const t = csr.indexOf.get(edge.targetId);
    if (s === undefined || t === undefined) continue;
    from[e] = s;
    to[e] = t;
    directed[e] = getEdgeMode(graph, edge) === 'directed' ? 1 : 0;
    counts[s]++;
    if (!directed[e] && s !== t) counts[t]++;
  }
  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + counts[i];
  const cursor = offsets.slice(0, n);
  const targets = new Int32Array(offsets[n]);
  const edges = new Int32Array(offsets[n]);
  for (let e = 0; e < m; e++) {
    const s = from[e];
    if (s === -1) continue;
    const t = to[e];
    targets[cursor[s]] = t;
    edges[cursor[s]++] = e;
    if (!directed[e] && s !== t) {
      targets[cursor[t]] = s;
      edges[cursor[t]++] = e;
    }
  }
  return { offsets, targets, edges, directed };
}

/**
 * Partitions edges into the blocks (biconnected components) of the
 * underlying undirected multigraph; every simple cycle lies inside one
 * block. Each self-loop is a block of its own; dangling edges get -1.
 * Returns the block id per edge and the edges of each block.
 */
function getCycleBlocks(
  graph: Graph,
  csr: GraphCSR,
): { blockOf: Int32Array; blocks: number[][] } {
  const n = csr.ids.length;
  const m = graph.edges.length;
  const blockOf = new Int32Array(m).fill(-1);
  const blocks: number[][] = [];
  const from = new Int32Array(m).fill(-1);
  const to = new Int32Array(m);
  const counts = new Int32Array(n);
  for (let e = 0; e < m; e++) {
    const s = csr.indexOf.get(graph.edges[e].sourceId);
    const t = csr.indexOf.get(graph.edges[e].targetId);
    if (s === undefined || t === undefined) continue;
    if (s === t) {
      blockOf[e] = blocks.length;
      blocks.push([e]);
      continue;
    }
    from[e] = s;
    to[e] = t;
    counts[s]++;
    counts[t]++;
  }
  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + counts[i];
  const cursor = offsets.slice(0, n);
  const neighbors = new Int32Array(offsets[n]);
  const incident = new Int32Array(offsets[n]);
  for (let e = 0; e < m; e++) {
    if (from[e] === -1) continue;
    neighbors[cursor[from[e]]] = to[e];
    incident[cursor[from[e]]++] = e;
    neighbors[cursor[to[e]]] = from[e];
    incident[cursor[to[e]]++] = e;
  }

  // Iterative Hopcroft–Tarjan with an edge stack. Skipping only the tree
  // edge itself (not the parent node) keeps parallel edges in one block.
  const disc = new Int32Array(n).fill(-1);
  const low = new Int32Array(n);
  const stackNode = new Int32Array(n);
  const stackArc = new Int32Array(n);
  const stackEdge = new Int32Array(n);
  const edgeStack: number[] = [];
  let time = 0;
  for (let root = 0; root < n; root++) {
    if (disc[root] !== -1) continue;
    disc[root] = low[root] = time++;
    let top = 0;
    stackNode[0] = root;
    stackArc[0] = offsets[root];
    stackEdge[0] = -1;
    while (top >= 0) {
      const u = stackNode[top];
      const a = stackArc[top];
      if (a < offsets[u + 1]) {
        stackArc[top] = a + 1;
        const w = neighbors[a];
        const e = incident[a];
        if (e === stackEdge[top]) continue;
        if (disc[w] === -1) {
          edgeStack.push(e);
          disc[w] = low[w] = time++;
          top++;
          stackNode[top] = w;
          stackArc[top] = offsets[w];
          stackEdge[top] = e;
        } else if (disc[w] < disc[u]) {
          edgeStack.push(e);
          if (disc[w] < low[u]) low[u] = disc[w];
        }
        continue;
      }
      const treeEdge = stackEdge[top];
      top--;
      if (top < 0) break;
      const parent = stackNode[top];
      if (low[u] < low[parent]) low[parent] = low[u];
      if (low[u] >= disc[parent]) {
        const block: number[] = [];
        let e: number;
        do {
          e = edgeStack.pop()!;
          blockOf[e] = blocks.length;
          block.push(e);
        } while (e !== treeEdge);
        blocks.push(block);
      }
    }
  }
  return { blockOf, blocks };
}

/**
 * Lazily yields every simple cycle. Directed edges are followed from source
 * to target; non-directed edges either way, but a cycle never reuses an
 * edge, so two parallel non-directed edges form a 2-cycle while a single one
 * does not. Every self-loop is a 1-cycle.
 *
 * Each cycle is yielded once, starting and ending at its node with the
 * smallest id. A cycle made only of non-directed edges could be walked in
 * either direction; it is yielded in one canonical direction.
 *
 * Johnson's algorithm, iterative, run per biconnected block: the total time
 * is O((n + m) · (cycles + 1)), so taking the first few cycles stays cheap
 * even when the total number of cycles is exponential.
 */
export function* genCycles<N, E>(
  graph: Graph<N, E>,
): Generator<GraphPath<N, E>> {
  graph = getGraphSnapshot(graph);
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const nodes = csr.nodes as GraphNode<N>[];
  const graphEdges = graph.edges as GraphEdge<E>[];
  const arcs = getCycleArcs(graph, csr);
  const { offsets, targets } = arcs;
  const { blockOf, blocks } = getCycleBlocks(graph, csr);

  // Each cycle is searched from its node with the smallest id.
  const order = Array.from({ length: n }, (_, i) => i).sort((a, b) =>
    csr.ids[a] < csr.ids[b] ? -1 : csr.ids[a] > csr.ids[b] ? 1 : 0,
  );
  const rank = new Int32Array(n);
  for (let r = 0; r < n; r++) rank[order[r]] = r;

  // Per-start search scope: `scope[v] === scopeId` marks the strongly
  // connected component being searched.
  const scope = new Int32Array(n).fill(-1);
  let scopeId = 0;

  const blocked = new Uint8Array(n);
  const blockedBy: Array<Set<number> | undefined> = new Array(n);
  const touched: number[] = [];
  const unblockStack: number[] = [];
  function unblock(node: number): void {
    unblockStack.push(node);
    while (unblockStack.length > 0) {
      const w = unblockStack.pop()!;
      if (!blocked[w]) continue;
      blocked[w] = 0;
      const dependents = blockedBy[w];
      if (dependents) {
        for (const x of dependents) unblockStack.push(x);
        dependents.clear();
      }
    }
  }

  // Tarjan SCC state (iterative), reused across starts
  const sccIndex = new Int32Array(n).fill(-1);
  const sccLow = new Int32Array(n);
  const sccOnStack = new Uint8Array(n);
  const sccStack: number[] = [];
  const sccOf = new Int32Array(n).fill(-1);

  // Explicit DFS stacks (shared by the SCC pass and the cycle search): node,
  // next arc, arrival edge, "closed a cycle" flag, and how many directed
  // edges the path from the start node has used.
  const stackNode = new Int32Array(n);
  const stackArc = new Int32Array(n);
  const stackEdge = new Int32Array(n);
  const stackFound = new Uint8Array(n);
  const stackDirected = new Int32Array(n);

  // Visit blocks in order of their smallest node id
  const blockNodes = blocks.map((edges) => {
    const set = new Set<number>();
    for (const e of edges) {
      set.add(csr.indexOf.get(graphEdges[e].sourceId)!);
      set.add(csr.indexOf.get(graphEdges[e].targetId)!);
    }
    return [...set].sort((a, b) => rank[a] - rank[b]);
  });
  const blockOrder = blocks
    .map((_, b) => b)
    .sort((a, b) => rank[blockNodes[a][0]] - rank[blockNodes[b][0]]);

  for (const b of blockOrder) {
    // A single non-self-loop edge cannot form a cycle
    const members = blockNodes[b];
    if (blocks[b].length === 1 && members.length === 2) continue;

    for (let i = 0; i < members.length; ) {
      // Strongly connected components of this block's arcs among members
      // ranked at or after members[i] (Johnson's restriction).
      const minRank = rank[members[i]];
      let counter = 0;
      let sccCount = 0;
      for (let k = i; k < members.length; k++) sccIndex[members[k]] = -1;
      let nextStart = -1;
      let nextScc = -1;
      for (let k = i; k < members.length; k++) {
        const root = members[k];
        if (sccIndex[root] !== -1) continue;
        let top = 0;
        stackNode[0] = root;
        stackArc[0] = offsets[root];
        sccIndex[root] = sccLow[root] = counter++;
        sccStack.push(root);
        sccOnStack[root] = 1;
        while (top >= 0) {
          const u = stackNode[top];
          const a = stackArc[top];
          if (a < offsets[u + 1]) {
            stackArc[top] = a + 1;
            const w = targets[a];
            if (blockOf[arcs.edges[a]] !== b || rank[w] < minRank) continue;
            if (sccIndex[w] === -1) {
              sccIndex[w] = sccLow[w] = counter++;
              sccStack.push(w);
              sccOnStack[w] = 1;
              top++;
              stackNode[top] = w;
              stackArc[top] = offsets[w];
            } else if (sccOnStack[w] && sccIndex[w] < sccLow[u]) {
              sccLow[u] = sccIndex[w];
            }
            continue;
          }
          if (sccLow[u] === sccIndex[u]) {
            let size = 0;
            let least = u;
            let w: number;
            do {
              w = sccStack.pop()!;
              sccOnStack[w] = 0;
              sccOf[w] = sccCount;
              size++;
              if (rank[w] < rank[least]) least = w;
            } while (w !== u);
            // Nontrivial: several nodes, or one node with a self-loop here
            const nontrivial =
              size > 1 ||
              (blocks[b].length === 1 && members.length === 1);
            if (nontrivial && (nextStart === -1 || rank[least] < rank[nextStart])) {
              nextStart = least;
              nextScc = sccCount;
            }
            sccCount++;
          }
          top--;
          if (top >= 0 && sccLow[u] < sccLow[stackNode[top]]) {
            sccLow[stackNode[top]] = sccLow[u];
          }
        }
      }
      if (nextStart === -1) break;

      scopeId++;
      for (let k = i; k < members.length; k++) {
        if (sccOf[members[k]] === nextScc) scope[members[k]] = scopeId;
      }
      yield* searchFrom(b, nextStart);
      i = members.indexOf(nextStart) + 1;
    }
  }

  function* searchFrom(block: number, start: number): Generator<GraphPath<N, E>> {
    let top = 0;
    stackNode[0] = start;
    stackArc[0] = offsets[start];
    stackEdge[0] = -1;
    stackFound[0] = 0;
    stackDirected[0] = 0;
    blocked[start] = 1;
    touched.push(start);

    while (top >= 0) {
      const v = stackNode[top];
      const a = stackArc[top];
      if (a < offsets[v + 1]) {
        stackArc[top] = a + 1;
        const w = targets[a];
        const e = arcs.edges[a];
        if (scope[w] !== scopeId || blockOf[e] !== block) continue;
        if (w === start) {
          // Any closing arc (even one rejected below) means `v` reaches the
          // start, so it must not stay blocked.
          stackFound[top] = 1;
          // Walking a non-directed edge straight back is not a cycle
          if (top === 1 && e === stackEdge[1]) continue;
          if (stackDirected[top] + arcs.directed[e] === 0) {
            // All non-directed: keep one of the two walking directions
            const canonical =
              top === 0 ||
              (top === 1
                ? stackEdge[1] < e
                : rank[stackNode[1]] < rank[stackNode[top]]);
            if (!canonical) continue;
          }
          const startNode = nodes[start];
          const steps = new Array<GraphStep<N, E>>(top + 1);
          for (let i = 1; i <= top; i++) {
            steps[i - 1] = {
              edge: graphEdges[stackEdge[i]],
              node: nodes[stackNode[i]],
            };
          }
          steps[top] = { edge: graphEdges[e], node: startNode };
          yield { source: startNode, steps };
        } else if (!blocked[w]) {
          top++;
          stackNode[top] = w;
          stackArc[top] = offsets[w];
          stackEdge[top] = e;
          stackFound[top] = 0;
          stackDirected[top] = stackDirected[top - 1] + arcs.directed[e];
          blocked[w] = 1;
          touched.push(w);
        }
        continue;
      }

      // `v` is finished: unblock it if it closed a cycle, otherwise keep it
      // blocked until one of its successors is unblocked.
      const found = stackFound[top];
      if (found) {
        unblock(v);
      } else {
        for (let c = offsets[v]; c < offsets[v + 1]; c++) {
          const w = targets[c];
          if (scope[w] !== scopeId || blockOf[arcs.edges[c]] !== block) continue;
          (blockedBy[w] ??= new Set()).add(v);
        }
      }
      top--;
      if (top >= 0 && found) stackFound[top] = 1;
    }

    for (const node of touched) {
      blocked[node] = 0;
      blockedBy[node]?.clear();
    }
    touched.length = 0;
  }
}

/**
 * Returns one simple cycle, or `undefined` if the graph is acyclic, in
 * O(n + m). Same cycle rules as {@link genCycles}: directed edges are
 * followed from source to target, non-directed edges either way without
 * reusing an edge, and any self-loop is a cycle. The result is
 * deterministic, but it is not necessarily the shortest cycle or the first
 * one {@link genCycles} yields.
 *
 * Use it to report why a graph is cyclic, e.g. in an error message, without
 * enumerating cycles.
 */
export function getCycle<N, E>(
  graph: Graph<N, E>,
): GraphPath<N, E> | undefined {
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const nodes = csr.nodes as GraphNode<N>[];
  const edges = graph.edges as GraphEdge<E>[];

  // (1) Grow a spanning forest of the non-directed edges (union-find). The
  // first non-directed edge closing a loop in it, plus the forest path
  // between its endpoints, is a cycle.
  const parent = new Int32Array(n);
  for (let i = 0; i < n; i++) parent[i] = i;
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const forestHead = new Int32Array(n).fill(-1);
  const forestNext: number[] = [];
  const forestTarget: number[] = [];
  const forestEdge: number[] = [];
  const addForestArc = (u: number, v: number, e: number) => {
    forestTarget.push(v);
    forestEdge.push(e);
    forestNext.push(forestHead[u]);
    forestHead[u] = forestTarget.length - 1;
  };
  // Steps walking the forest from `from` to `to` (same tree).
  const getForestSteps = (from: number, to: number): GraphStep<N, E>[] => {
    const prevNode = new Int32Array(n).fill(-1);
    const prevEdge = new Int32Array(n);
    prevNode[from] = from;
    const queue = [from];
    for (let head = 0; prevNode[to] === -1; head++) {
      const u = queue[head];
      for (let a = forestHead[u]; a !== -1; a = forestNext[a]) {
        const v = forestTarget[a];
        if (prevNode[v] !== -1) continue;
        prevNode[v] = u;
        prevEdge[v] = forestEdge[a];
        queue.push(v);
      }
    }
    const steps: GraphStep<N, E>[] = [];
    for (let v = to; v !== from; v = prevNode[v]) {
      steps.push({ edge: edges[prevEdge[v]], node: nodes[v] });
    }
    return steps.reverse();
  };

  const directedEdges: number[] = [];
  for (let e = 0; e < edges.length; e++) {
    const edge = edges[e];
    const s = csr.indexOf.get(edge.sourceId);
    const t = csr.indexOf.get(edge.targetId);
    if (s === undefined || t === undefined) continue;
    if (getEdgeMode(graph, edge) === 'directed') {
      directedEdges.push(e);
      continue;
    }
    if (find(s) === find(t)) {
      return {
        source: nodes[s],
        steps: [{ edge: edges[e], node: nodes[t] }, ...getForestSteps(t, s)],
      };
    }
    parent[find(s)] = find(t);
    addForestArc(s, t, e);
    addForestArc(t, s, e);
  }

  // (2) The non-directed edges now form a forest. Any remaining cycle uses
  // directed edges, and it exists iff contracting each tree to one node
  // leaves a directed cycle: inside a tree there is exactly one path from
  // where the cycle enters to where it leaves.
  const head = new Int32Array(n).fill(-1);
  const next = new Int32Array(directedEdges.length);
  for (let i = directedEdges.length - 1; i >= 0; i--) {
    const component = find(csr.indexOf.get(edges[directedEdges[i]].sourceId)!);
    next[i] = head[component];
    head[component] = i;
  }
  const color = new Uint8Array(n); // per component root: 0 new, 1 open, 2 done
  const stackComponent: number[] = [];
  const stackCursor: number[] = [];
  // Directed edge used to enter each open component (-1 for the DFS root)
  const stackEntry: number[] = [];
  for (let root = 0; root < n; root++) {
    if (find(root) !== root || color[root] !== 0) continue;
    color[root] = 1;
    stackComponent.push(root);
    stackCursor.push(head[root]);
    stackEntry.push(-1);
    while (stackComponent.length > 0) {
      const top = stackComponent.length - 1;
      const cursor = stackCursor[top];
      if (cursor === -1) {
        color[stackComponent[top]] = 2;
        stackComponent.pop();
        stackCursor.pop();
        stackEntry.pop();
        continue;
      }
      stackCursor[top] = next[cursor];
      const e = directedEdges[cursor];
      const target = find(csr.indexOf.get(edges[e].targetId)!);
      if (color[target] === 0) {
        color[target] = 1;
        stackComponent.push(target);
        stackCursor.push(head[target]);
        stackEntry.push(e);
        continue;
      }
      if (color[target] !== 1) continue;

      // Found: directed edges entering each open component after `target`,
      // then `e` back into `target`. Join consecutive edges with the forest
      // path inside the component between them.
      const cycleEdges = [];
      for (let i = stackComponent.indexOf(target) + 1; i <= top; i++) {
        cycleEdges.push(stackEntry[i]);
      }
      cycleEdges.push(e);
      const sourceOf = (edge: number) => csr.indexOf.get(edges[edge].sourceId)!;
      const targetOf = (edge: number) => csr.indexOf.get(edges[edge].targetId)!;
      const start = sourceOf(cycleEdges[0]);
      const steps: GraphStep<N, E>[] = [];
      for (let i = 0; i < cycleEdges.length; i++) {
        const edge = cycleEdges[i];
        steps.push({ edge: edges[edge], node: nodes[targetOf(edge)] });
        const exit =
          i + 1 < cycleEdges.length ? sourceOf(cycleEdges[i + 1]) : start;
        if (targetOf(edge) !== exit) {
          steps.push(...getForestSteps(targetOf(edge), exit));
        }
      }
      return { source: nodes[start], steps };
    }
  }
  return undefined;
}

/**
 * Yields every shortest path between all ordered pairs of nodes, lazily.
 *
 * "Every" includes ties: graphs with many equal-weight paths (grids are the
 * extreme case) can have combinatorially many shortest paths per pair.
 * Consume this generator with early exit for such graphs, or use
 * {@link getShortestPath} per pair when one path per pair is enough.
 *
 * Pass `opts.signal` to cancel: the abort is checked once per source node
 * (dijkstra/bellman-ford) or per intermediate node `k` (floyd-warshall), and
 * throws `signal.reason`.
 */
export function* genAllPairsShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: AllPairsShortestPathsOptions<E>,
): Generator<GraphPath<N, E>> {
  graph = getGraphSnapshot(graph);
  const algorithm = opts?.algorithm ?? 'dijkstra';
  if (algorithm === 'floyd-warshall') {
    yield* floydWarshallAllPaths(graph, opts?.getWeight, opts?.signal);
    return;
  }
  for (const node of graph.nodes) {
    throwIfAborted(opts?.signal);
    yield* genShortestPaths(graph, {
      from: node.id,
      getWeight: opts?.getWeight,
      ...(algorithm === 'bellman-ford' ? { algorithm } : {}),
    });
  }
}

/**
 * Returns every shortest path between all ordered pairs of nodes.
 *
 * Materializes {@link genAllPairsShortestPaths} — see its caveat about
 * tie-heavy graphs before calling this on grid-like topologies.
 *
 * Pass `opts.signal` to cancel: the abort is checked once per source node
 * (dijkstra/bellman-ford) or per intermediate node `k` (floyd-warshall), and
 * throws `signal.reason`.
 */
export function getAllPairsShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: AllPairsShortestPathsOptions<E>,
): GraphPath<N, E>[] {
  const results: GraphPath<N, E>[] = [];
  for (const path of genAllPairsShortestPaths(graph, opts)) {
    results.push(path);
  }
  return results;
}

function floydWarshallAllPaths<N, E>(
  graph: Graph<N, E>,
  getWeight?: (edge: GraphEdge<E>) => number,
  signal?: AbortSignal,
): GraphPath<N, E>[] {
  const weight = getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const nodes = graph.nodes;
  const nodeCount = nodes.length;
  const csr = getCSR(graph); // positions match graph.nodes order
  assertFiniteWeights(graph, csr, getWeight, 'Floyd-Warshall');
  const INF = Infinity;

  // Flat n×n distance matrix; tie predecessors as flat (fromPos, edgeIndex)
  // pair lists. On a strict improvement the winning list is *shared* (not
  // cloned); `owned` tracks which slots may be appended to in place, and a
  // shared list is cloned on first write (copy-on-write).
  const dist = new Float64Array(nodeCount * nodeCount).fill(INF);
  const prev: Array<number[] | undefined> = new Array(nodeCount * nodeCount);
  const owned = new Uint8Array(nodeCount * nodeCount);
  for (let i = 0; i < nodeCount; i++) dist[i * nodeCount + i] = 0;

  for (let e = 0; e < graph.edges.length; e++) {
    const edge = graph.edges[e] as GraphEdge<E>;
    const s = csr.indexOf.get(edge.sourceId);
    const t = csr.indexOf.get(edge.targetId);
    if (s === undefined || t === undefined) continue;
    const edgeWeight = assertFiniteEdgeWeight(
      graph,
      e,
      weight(edge),
      'Floyd-Warshall',
    );
    const forward = s * nodeCount + t;
    if (edgeWeight < dist[forward]) {
      dist[forward] = edgeWeight;
      prev[forward] = [s, e];
      owned[forward] = 1;
    } else if (edgeWeight === dist[forward] && edgeWeight < INF && s !== t) {
      // A tying self-loop (zero-weight, s === t) is never recorded: it can't
      // extend any enumerated path — only cycle it — and a recorded diagonal
      // predecessor would propagate through tie merging into self-referential
      // lists. (Negative self-loops still take the strict-improvement branch
      // above and surface via the negative-cycle check.)
      prev[forward]!.push(s, e);
    }

    if (getEdgeMode(graph, edge) !== 'directed') {
      const backward = t * nodeCount + s;
      if (edgeWeight < dist[backward]) {
        dist[backward] = edgeWeight;
        prev[backward] = [t, e];
        owned[backward] = 1;
      } else if (edgeWeight === dist[backward] && edgeWeight < INF && s !== t) {
        prev[backward]!.push(t, e);
      }
    }
  }

  for (let k = 0; k < nodeCount; k++) {
    throwIfAborted(signal);
    const rowK = k * nodeCount;
    for (let i = 0; i < nodeCount; i++) {
      const dik = dist[i * nodeCount + k];
      if (dik === INF) continue;
      const rowI = i * nodeCount;
      for (let j = 0; j < nodeCount; j++) {
        const dkj = dist[rowK + j];
        if (dkj === INF) continue;
        const nextDistance = addPathCost(dik, dkj, 'Floyd-Warshall');
        const cell = rowI + j;
        const current = dist[cell];
        if (nextDistance < current) {
          dist[cell] = nextDistance;
          prev[cell] = prev[rowK + j];
          owned[cell] = 0; // shared with row k — clone before any append
        } else if (nextDistance === current && nextDistance < INF) {
          const incoming = prev[rowK + j];
          if (incoming === undefined || incoming.length === 0) continue;
          // Shared reference (a prior strict improvement copied row k's
          // list): contents are identical, merging is a no-op
          if (incoming === prev[cell]) continue;
          let pairs = prev[cell];
          if (pairs === undefined) {
            prev[cell] = pairs = [];
            owned[cell] = 1;
          }
          // Merge with dedup by edge index (matches the previous
          // edge-id-based dedup; edge indices are unique per edge)
          for (let p = 1; p < incoming.length; p += 2) {
            let seen = false;
            for (let q = 1; q < pairs.length; q += 2) {
              if (pairs[q] === incoming[p]) {
                seen = true;
                break;
              }
            }
            if (!seen) {
              if (!owned[cell]) {
                prev[cell] = pairs = pairs.slice();
                owned[cell] = 1;
              }
              pairs.push(incoming[p - 1], incoming[p]);
            }
          }
        }
      }
    }
  }

  // A negative self-distance means a negative cycle: all-pairs shortest
  // paths are undefined and reconstruction would loop forever.
  for (let i = 0; i < nodeCount; i++) {
    if (dist[i * nodeCount + i] < 0) {
      throw new Error(
        `Negative cycle detected through node "${nodes[i].id}": all-pairs shortest paths are undefined. ` +
          `Remove the negative cycle, or use getShortestPaths with { algorithm: 'bellman-ford' } per source to locate it.`,
      );
    }
  }

  // Enumerate every tie path per pair by walking the predecessor lists
  // backward from the target (see genPredecessorPaths).
  const results: GraphPath<N, E>[] = [];
  for (let i = 0; i < nodeCount; i++) {
    const rowI = i * nodeCount;
    for (let j = 0; j < nodeCount; j++) {
      if (i === j || dist[rowI + j] === INF) continue;
      for (const path of genPredecessorPaths<N, E>(
        (pos) => prev[rowI + pos],
        nodes as GraphNode<N>[],
        graph.edges as GraphEdge<E>[],
        i,
        j,
      )) {
        results.push(path);
      }
    }
  }

  return results;
}

export function getAStarPath<N, E>(
  graph: Graph<N, E>,
  opts: AStarOptions<E, N>,
): GraphPath<N, E> | undefined {
  if (typeof opts.from === 'function') {
    let best: GraphPath<N, E> | undefined;
    let bestWeight = Infinity;
    const getWeight = opts.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
    for (const sourceId of resolveFromIds(graph, opts.from)) {
      const candidate = getAStarPath(graph, { ...opts, from: sourceId });
      if (!candidate) continue;
      const weight = candidate.steps.reduce(
        (total, step) => total + getWeight(step.edge),
        0,
      );
      if (weight < bestWeight) {
        best = candidate;
        bestWeight = weight;
      }
    }
    return best;
  }

  const idx = getIndex(graph);
  const { from: sourceId, to: targetId, heuristic } = opts;
  const getWeight = opts.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const getHeuristic = (nodeId: string): number => {
    const value = heuristic(nodeId);
    if (!Number.isFinite(value)) {
      throw new Error('A* heuristic must return a finite number');
    }
    return value;
  };

  const sourceNi = idx.nodeById.get(sourceId);
  if (sourceNi === undefined) return undefined;
  if (!idx.nodeById.has(targetId)) return undefined;

  const csr = getCSR(graph);
  const n = csr.ids.length;
  const source = csr.indexOf.get(sourceId)!;
  const target = csr.indexOf.get(targetId)!;
  const arcWeights = opts.getWeight ? undefined : getArcWeights(graph, csr);

  const gScore = new Float64Array(n).fill(Infinity);
  // Predecessor as (fromPos, edgeIndex); -1 = none
  const cameFromPos = new Int32Array(n).fill(-1);
  const cameFromEdge = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  // Heap key is the f-score (g + heuristic)
  const openSet = new TypedMinHeap(n);

  // A* with a heuristic may finish without scanning a reachable negative
  // edge — enforce the throw-on-negative contract up front
  assertNoNegativeWeights(
    graph,
    csr,
    opts.getWeight,
    'A*',
    "Use getShortestPath with { algorithm: 'bellman-ford' } instead.",
  );

  if (sourceId === targetId) {
    getHeuristic(sourceId);
    return { source: graph.nodes[sourceNi], steps: [] };
  }

  gScore[source] = 0;
  openSet.push(getHeuristic(sourceId), source);

  while (openSet.size > 0) {
    const current = openSet.peekVal();
    openSet.pop();
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
      const weight = assertFiniteEdgeWeight(
        graph,
        csr.outEdgeIndex[a],
        arcWeights
          ? arcWeights.out[a]
          : getWeight(graph.edges[csr.outEdgeIndex[a]] as GraphEdge<E>),
        'A*',
      );
      const neighbor = csr.outTargets[a];
      if (closed[neighbor]) continue;

      const tentativeScore = addPathCost(gScore[current], weight, 'A*');
      if (tentativeScore < gScore[neighbor]) {
        cameFromPos[neighbor] = current;
        cameFromEdge[neighbor] = csr.outEdgeIndex[a];
        gScore[neighbor] = tentativeScore;
        openSet.push(
          addPathCost(
            tentativeScore,
            getHeuristic(csr.ids[neighbor]),
            'A*',
          ),
          neighbor,
        );
      }
    }
  }

  return undefined;
}

export function getJoinedPath<N, E>(
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

/**
 * @deprecated Use {@link getJoinedPath}.
 */
export function joinPaths<N, E>(
  headPath: GraphPath<N, E>,
  tailPath: GraphPath<N, E>,
): GraphPath<N, E> {
  return getJoinedPath(headPath, tailPath);
}
