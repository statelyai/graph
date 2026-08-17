import type { Graph, GraphMode, GraphNode } from '../types';
import { getIndex, type GraphIndex } from '../indexing';
import { getEdgeMode } from '../mode';

/**
 * Compressed-sparse-row snapshot of a graph's *traversable arcs*, used by the
 * hot algorithm loops. Nodes are addressed by their position in `graph.nodes`
 * (`ids`/`indexOf` translate); arcs live in flat `Int32Array`s, so traversal
 * pays no string hashing or Map lookups.
 *
 * - A directed edge contributes one arc source→target.
 * - An edge whose effective mode is not `'directed'` contributes arcs both
 *   ways (each carrying the same `edgeIndex` into `graph.edges`).
 * - `in*` mirrors the arcs ("which arcs can reach me, and from where").
 *
 * Cached per {@link GraphIndex} object and revalidated against the index
 * `version` and `graph.mode`, so it inherits the index staleness contract:
 * array replacement / length changes / API mutations are detected; direct
 * in-place field mutation requires `invalidateIndex()` (same as the index).
 */
export interface GraphCSR {
  /**
   * Snapshot of `graph.nodes` at build time (same positions as the arcs).
   * Traversal iterators serve node objects from here, so an in-flight
   * iterator is insulated from later structural mutations without paying a
   * per-iterator array copy.
   */
  nodes: GraphNode[];
  /** node position → node id (same order as `graph.nodes`) */
  ids: string[];
  /** node id → node position */
  indexOf: Map<string, number>;
  outOffsets: Int32Array;
  outTargets: Int32Array;
  /** arc → index into `graph.edges` */
  outEdgeIndex: Int32Array;
  inOffsets: Int32Array;
  /** the arc's origin node position */
  inOrigins: Int32Array;
  inEdgeIndex: Int32Array;
  /**
   * Index into `graph.edges` of the first edge with a negative *default*
   * weight (`edge.weight`), or -1. Lets sublinear searches (early-exit,
   * bidirectional) enforce the throw-on-negative contract in O(1) without
   * scanning edges they would never visit. Only valid for the default
   * weight; custom `getWeight` callbacks need their own scan.
   */
  firstNegativeEdge: number;
  /**
   * Whether any edge's *effective* mode is not `'directed'` (dangling edges
   * included). Lets directed-only algorithms (topological sort) bail out in
   * O(1) instead of re-scanning every edge per call.
   */
  hasNonDirected: boolean;
}

interface CsrCacheEntry {
  version: number;
  mode: GraphMode;
  csr: GraphCSR;
}

const csrCache = new WeakMap<GraphIndex, CsrCacheEntry>();

/** Get or lazily (re)build the CSR snapshot for a graph. */
export function getCSR(graph: Graph): GraphCSR {
  const idx = getIndex(graph);
  const cached = csrCache.get(idx);
  if (cached && cached.version === idx.version && cached.mode === graph.mode) {
    return cached.csr;
  }
  const csr = buildCSR(graph);
  csrCache.set(idx, { version: idx.version, mode: graph.mode, csr });
  return csr;
}

function buildCSR(graph: Graph): GraphCSR {
  const n = graph.nodes.length;
  const m = graph.edges.length;
  const nodes = graph.nodes.slice();
  const ids = new Array<string>(n);
  const indexOf = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    ids[i] = nodes[i].id;
    indexOf.set(ids[i], i);
  }

  // Classify each edge once (endpoint positions + effective directedness)
  const srcPos = new Int32Array(m);
  const tgtPos = new Int32Array(m);
  const nonDirected = new Uint8Array(m);
  const outCounts = new Int32Array(n);
  const inCounts = new Int32Array(n);
  let firstNegativeEdge = -1;
  let hasNonDirected = false;
  for (let e = 0; e < m; e++) {
    const edge = graph.edges[e];
    if (firstNegativeEdge === -1 && (edge.weight ?? 1) < 0) {
      firstNegativeEdge = e;
    }
    const nd = getEdgeMode(graph, edge) !== 'directed' ? 1 : 0;
    if (nd) hasNonDirected = true;
    const s = indexOf.get(edge.sourceId);
    const t = indexOf.get(edge.targetId);
    if (s === undefined || t === undefined) {
      // Dangling endpoint — skip, matching the index's adjacency behavior
      srcPos[e] = -1;
      tgtPos[e] = -1;
      continue;
    }
    srcPos[e] = s;
    tgtPos[e] = t;
    nonDirected[e] = nd;
    outCounts[s]++;
    inCounts[t]++;
    if (nd) {
      outCounts[t]++;
      inCounts[s]++;
    }
  }

  const outOffsets = new Int32Array(n + 1);
  const inOffsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) {
    outOffsets[i + 1] = outOffsets[i] + outCounts[i];
    inOffsets[i + 1] = inOffsets[i] + inCounts[i];
  }

  const outTargets = new Int32Array(outOffsets[n]);
  const outEdgeIndex = new Int32Array(outOffsets[n]);
  const inOrigins = new Int32Array(inOffsets[n]);
  const inEdgeIndex = new Int32Array(inOffsets[n]);
  const outCursor = outOffsets.slice(0, n);
  const inCursor = inOffsets.slice(0, n);
  for (let e = 0; e < m; e++) {
    const s = srcPos[e];
    const t = tgtPos[e];
    if (s < 0) continue;
    outTargets[outCursor[s]] = t;
    outEdgeIndex[outCursor[s]++] = e;
    inOrigins[inCursor[t]] = s;
    inEdgeIndex[inCursor[t]++] = e;
    if (nonDirected[e]) {
      outTargets[outCursor[t]] = s;
      outEdgeIndex[outCursor[t]++] = e;
      inOrigins[inCursor[s]] = t;
      inEdgeIndex[inCursor[s]++] = e;
    }
  }

  return {
    nodes,
    ids,
    indexOf,
    outOffsets,
    outTargets,
    outEdgeIndex,
    inOffsets,
    inOrigins,
    inEdgeIndex,
    firstNegativeEdge,
    hasNonDirected,
  };
}

/**
 * Default arc weights (`edge.weight ?? 1`) for the CSR's out-arcs and
 * in-arcs, as flat `Float64Array`s aligned with `outEdgeIndex`/`inEdgeIndex`.
 *
 * Weighted hot loops (Dijkstra, A*, bidirectional search) read these instead
 * of loading the edge object per arc — no property loads, no `?? 1` megamorphic
 * hits, and the arrays persist across calls. Cached per CSR snapshot, so the
 * staleness contract is inherited: `updateEdge` weight changes bump the index
 * version, which rebuilds the CSR and thereby this cache. Only used when the
 * caller did not supply a custom `getWeight`.
 */
export interface ArcWeights {
  out: Float64Array;
  in: Float64Array;
}

const arcWeightCache = new WeakMap<GraphCSR, ArcWeights>();

/**
 * Compact traversable arcs in *edge order*: one arc per directed edge, plus a
 * reverse arc per non-directed edge (immediately after its forward arc).
 * Endpoints are CSR positions; `weight` holds the default (`edge.weight ?? 1`).
 * This is the layout edge-relaxation algorithms (Bellman-Ford) want — cached
 * per CSR snapshot so repeated queries skip the id→position conversion.
 */
export interface EdgeOrderArcs {
  count: number;
  from: Int32Array;
  to: Int32Array;
  /** Index into `graph.edges` per arc. */
  edge: Int32Array;
  weight: Float64Array;
}

const edgeOrderArcCache = new WeakMap<GraphCSR, EdgeOrderArcs>();

/**
 * Edge-list in-degrees per node position (dangling *sources* still count
 * toward an existing target, unlike the CSR arcs which skip such edges).
 * Kahn-style algorithms copy this instead of re-scanning the edge list —
 * the id→position Map lookups per edge are the expensive part.
 */
const inDegreeCache = new WeakMap<GraphCSR, Int32Array>();

export function getEdgeListInDegrees(graph: Graph, csr: GraphCSR): Int32Array {
  const cached = inDegreeCache.get(csr);
  if (cached) return cached;
  const inDegree = new Int32Array(csr.ids.length);
  for (const edge of graph.edges) {
    const t = csr.indexOf.get(edge.targetId);
    if (t !== undefined) inDegree[t]++;
  }
  inDegreeCache.set(csr, inDegree);
  return inDegree;
}

export function getEdgeOrderArcs(graph: Graph, csr: GraphCSR): EdgeOrderArcs {
  const cached = edgeOrderArcCache.get(csr);
  if (cached) return cached;

  const m = graph.edges.length;
  const from = new Int32Array(2 * m);
  const to = new Int32Array(2 * m);
  const edgeIndex = new Int32Array(2 * m);
  const weight = new Float64Array(2 * m);
  let count = 0;
  for (let e = 0; e < m; e++) {
    const edge = graph.edges[e];
    const s = csr.indexOf.get(edge.sourceId);
    const t = csr.indexOf.get(edge.targetId);
    if (s === undefined || t === undefined) continue; // dangling — no arc
    const w = edge.weight ?? 1;
    from[count] = s;
    to[count] = t;
    weight[count] = w;
    edgeIndex[count++] = e;
    if (getEdgeMode(graph, edge) !== 'directed') {
      from[count] = t;
      to[count] = s;
      weight[count] = w;
      edgeIndex[count++] = e;
    }
  }

  const arcs: EdgeOrderArcs = { count, from, to, edge: edgeIndex, weight };
  edgeOrderArcCache.set(csr, arcs);
  return arcs;
}

export function getArcWeights(graph: Graph, csr: GraphCSR): ArcWeights {
  const cached = arcWeightCache.get(csr);
  if (cached) return cached;

  const edges = graph.edges;
  const out = new Float64Array(csr.outEdgeIndex.length);
  for (let a = 0; a < out.length; a++) {
    out[a] = edges[csr.outEdgeIndex[a]].weight ?? 1;
  }
  const inW = new Float64Array(csr.inEdgeIndex.length);
  for (let a = 0; a < inW.length; a++) {
    inW[a] = edges[csr.inEdgeIndex[a]].weight ?? 1;
  }
  const weights: ArcWeights = { out, in: inW };
  arcWeightCache.set(csr, weights);
  return weights;
}
