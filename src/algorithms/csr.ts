import type { Graph, GraphMode } from '../types';
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
  const ids = new Array<string>(n);
  const indexOf = new Map<string, number>();
  for (let i = 0; i < n; i++) {
    ids[i] = graph.nodes[i].id;
    indexOf.set(ids[i], i);
  }

  // Classify each edge once (endpoint positions + effective directedness)
  const srcPos = new Int32Array(m);
  const tgtPos = new Int32Array(m);
  const nonDirected = new Uint8Array(m);
  const outCounts = new Int32Array(n);
  const inCounts = new Int32Array(n);
  for (let e = 0; e < m; e++) {
    const edge = graph.edges[e];
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
    const nd = getEdgeMode(graph, edge) !== 'directed' ? 1 : 0;
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
    ids,
    indexOf,
    outOffsets,
    outTargets,
    outEdgeIndex,
    inOffsets,
    inOrigins,
    inEdgeIndex,
  };
}
