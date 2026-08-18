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
  resolveFrom,
  resolveFromIds,
} from './shared';
import { getArcWeights, getCSR, getEdgeOrderArcs } from './csr';
import { throwIfAborted } from './abort';

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
 * {@link reconstructPathsAt} walks `prevArr` on demand, so abandoning a
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

  // An early-exit search may finish without scanning a reachable negative
  // edge, so the throw-on-negative contract needs an up-front check; the
  // full search keeps its scan-time checks (identical observable behavior)
  if (stopAt !== undefined) {
    assertNoNegativeWeights(
      graph,
      csr,
      getWeight,
      'Dijkstra',
      "Use { algorithm: 'bellman-ford' } instead.",
    );
  }

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
        const weight = arcWeights
          ? arcWeights[a]
          : getWeight!(graph.edges[csr.outEdgeIndex[a]] as GraphEdge<E>);
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
        const nextDistance = distance + weight;

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
      const nextDistance = du + arcWeight[a];
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
    if (du + arcWeight[a] < distArr[arcTo[a]]) {
      throw new Error(
        'Graph contains a negative-weight cycle reachable from the source node',
      );
    }
  }

  return { source, distArr, prevArr, stopDistance: Infinity };
}

function* reconstructPathsAt<N, E>(
  graph: Graph<N, E>,
  prevArr: Array<number[] | undefined>,
  sourceNode: GraphNode<N>,
  sourcePos: number,
  targetPos: number,
): Generator<GraphPath<N, E>> {
  // Walk the predecessor pairs backward from the target with one shared step
  // buffer; each complete path is materialized exactly once (one O(length)
  // reversed copy), instead of re-spreading the prefix at every recursion
  // level. Track nodes on the current partial path — zero-weight cycles can
  // make the predecessor structure cyclic via equal-distance tie
  // predecessors, so never revisit a node already on the path being built.
  const stepsBackward: GraphStep<N, E>[] = [];
  const onPath = new Set<number>();

  function* walk(pos: number): Generator<GraphPath<N, E>> {
    if (pos === sourcePos) {
      const length = stepsBackward.length;
      const steps = new Array<GraphStep<N, E>>(length);
      for (let s = 0; s < length; s++) {
        steps[s] = stepsBackward[length - 1 - s];
      }
      yield { source: sourceNode, steps };
      return;
    }

    const pairs = prevArr[pos];
    if (!pairs || pairs.length === 0) return;

    // CSR positions are `graph.nodes` positions, so no id lookup is needed.
    const node = graph.nodes[pos] as GraphNode<N>;
    onPath.add(pos);
    for (let k = 0; k < pairs.length; k += 2) {
      const fromPos = pairs[k];
      if (onPath.has(fromPos)) continue;
      stepsBackward.push({
        edge: graph.edges[pairs[k + 1]] as GraphEdge<E>,
        node,
      });
      yield* walk(fromPos);
      stepsBackward.pop();
    }
    onPath.delete(pos);
  }

  yield* walk(targetPos);
}

export function* genShortestPaths<N, E>(
  graph: Graph<N, E>,
  opts?: PathOptions<E, N>,
): Generator<GraphPath<N, E>> {
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

  const sourceNode =
    source !== -1
      ? (graph.nodes[source] as GraphNode<N>)
      : graph.nodes.find((node) => node.id === sourceId)!;

  if (source === -1) {
    // Unknown source id: nothing is reachable; only the trivial self-path
    // when it is explicitly requested.
    if (opts?.to === sourceId) yield { source: sourceNode, steps: [] };
    return;
  }

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
    yield* reconstructPathsAt(graph, prevArr, sourceNode, source, target);
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
    yield* reconstructPathsAt(graph, prevArr, sourceNode, source, target);
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
  if (source === undefined) {
    // Unknown source: only the explicit self-path exists
    return sourceId === targetId
      ? {
          source: graph.nodes.find((node) => node.id === sourceId)!,
          steps: [],
        }
      : undefined;
  }
  if (target === undefined) return undefined;

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
      const nextDistance = du + arcWeight[a];
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
    if (du + arcWeight[a] < distArr[arcTo[a]]) {
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
    if (csr.firstNegativeEdge !== -1) {
      offending = graph.edges[csr.firstNegativeEdge] as GraphEdge<E>;
      weight = offending.weight ?? 1;
    }
  } else {
    for (const edge of graph.edges) {
      const w = getWeight(edge as GraphEdge<E>);
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
      const next = d + weight;
      if (next < distF[v]) {
        distF[v] = next;
        predF[v] = u;
        predFEdge[v] = csr.outEdgeIndex[a];
        pqF.push(next, v);
      }
      // distB[v] is the cost of a real backward path (tentative or settled),
      // so next + distB[v] is the cost of a real s→t path
      if (distB[v] !== Infinity && next + distB[v] < mu) {
        mu = next + distB[v];
        meet = v;
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
      const next = d + weight;
      if (next < distB[v]) {
        distB[v] = next;
        predB[v] = u;
        predBEdge[v] = csr.inEdgeIndex[a];
        pqB.push(next, v);
      }
      if (distF[v] !== Infinity && next + distF[v] < mu) {
        mu = next + distF[v];
        meet = v;
      }
    }
  };

  for (;;) {
    const topF = validTop(pqF, distF, settledF);
    const topB = validTop(pqB, distB, settledB);
    // A side running dry means its dist array is final everywhere reachable,
    // so mu already equals the optimum (or stays Infinity: no path)
    if (topF === undefined || topB === undefined) break;
    if (topF + topB >= mu) break;
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
    const edgeWeight = weight(edge);
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
        const nextDistance = dik + dkj;
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
  // backward from the target with one shared step buffer — each emitted path
  // costs a single O(length) copy, not a spread per recursion level.
  const results: GraphPath<N, E>[] = [];
  const edges = graph.edges;
  const stepsBackward: GraphStep<N, E>[] = [];
  // Zero-weight cycles can make tie-predecessor lists cyclic; never revisit
  // a node already on the path being built (same guard as reconstructPathsAt)
  const onPath = new Set<number>();
  let sourceIdx = 0;
  let sourceNode = nodes[0] as GraphNode<N>;

  const collect = (j: number): void => {
    if (j === sourceIdx) {
      const length = stepsBackward.length;
      const steps = new Array<GraphStep<N, E>>(length);
      for (let s = 0; s < length; s++) {
        steps[s] = stepsBackward[length - 1 - s];
      }
      results.push({ source: sourceNode, steps });
      return;
    }
    const pairs = prev[sourceIdx * nodeCount + j];
    if (pairs === undefined || pairs.length === 0) return;
    const targetNode = nodes[j] as GraphNode<N>;
    onPath.add(j);
    for (let p = 0; p < pairs.length; p += 2) {
      const from = pairs[p];
      if (onPath.has(from)) continue;
      stepsBackward.push({
        edge: edges[pairs[p + 1]] as GraphEdge<E>,
        node: targetNode,
      });
      collect(from);
      stepsBackward.pop();
    }
    onPath.delete(j);
  };

  for (let i = 0; i < nodeCount; i++) {
    sourceIdx = i;
    sourceNode = nodes[i] as GraphNode<N>;
    const rowI = i * nodeCount;
    for (let j = 0; j < nodeCount; j++) {
      if (i === j || dist[rowI + j] === INF) continue;
      collect(j);
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

  if (sourceId === targetId) {
    return { source: graph.nodes[sourceNi], steps: [] };
  }

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
      const weight = arcWeights
        ? arcWeights.out[a]
        : getWeight(graph.edges[csr.outEdgeIndex[a]] as GraphEdge<E>);
      const neighbor = csr.outTargets[a];
      if (closed[neighbor]) continue;

      const tentativeScore = gScore[current] + weight;
      if (tentativeScore < gScore[neighbor]) {
        cameFromPos[neighbor] = current;
        cameFromEdge[neighbor] = csr.outEdgeIndex[a];
        gScore[neighbor] = tentativeScore;
        openSet.push(
          tentativeScore + getHeuristic(csr.ids[neighbor]),
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
