import type { Graph } from '../types';
import { getCSR } from './csr';

/**
 * Undirected adjacency over node positions: every edge (regardless of mode
 * or direction) contributes both arcs, matching the standard k-core
 * definition. Self-loops are ignored. Positions come from the CSR snapshot
 * so `ids` order matches `graph.nodes`.
 */
function buildUndirectedAdjacency(graph: Graph): {
  ids: string[];
  offsets: Int32Array;
  targets: Int32Array;
} {
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const m = graph.edges.length;
  const sourcePos = new Int32Array(m);
  const targetPos = new Int32Array(m);
  const degree = new Int32Array(n);
  let arcCount = 0;

  for (let e = 0; e < m; e++) {
    const edge = graph.edges[e];
    const s = csr.indexOf.get(edge.sourceId)!;
    const t = csr.indexOf.get(edge.targetId)!;
    if (s === t) {
      sourcePos[e] = -1; // self-loop: no core contribution
      continue;
    }
    sourcePos[e] = s;
    targetPos[e] = t;
    degree[s]++;
    degree[t]++;
    arcCount += 2;
  }

  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + degree[i];
  const targets = new Int32Array(arcCount);
  const cursor = Int32Array.from(offsets.subarray(0, n));
  for (let e = 0; e < m; e++) {
    if (sourcePos[e] === -1) continue;
    targets[cursor[sourcePos[e]]++] = targetPos[e];
    targets[cursor[targetPos[e]]++] = sourcePos[e];
  }

  return { ids: csr.ids, offsets, targets };
}

/**
 * Returns the core number of every node (largest `k` such that the node
 * belongs to the k-core).
 *
 * Uses Batagelj–Zaveršnik bucket peeling — O(m). Edges are treated as
 * undirected (the standard k-core definition); self-loops are ignored.
 *
 * @example
 * ```ts
 * const cores = getCoreNumbers(graph);
 * console.log(cores.a); // 3
 * ```
 */
export function getCoreNumbers(graph: Graph): Record<string, number> {
  const { ids, offsets, targets } = buildUndirectedAdjacency(graph);
  const n = ids.length;
  const core = new Int32Array(n);
  let maxDegree = 0;
  for (let i = 0; i < n; i++) {
    core[i] = offsets[i + 1] - offsets[i];
    if (core[i] > maxDegree) maxDegree = core[i];
  }

  // Bucket sort node positions by degree.
  const bin = new Int32Array(maxDegree + 1);
  for (let i = 0; i < n; i++) bin[core[i]]++;
  let start = 0;
  for (let d = 0; d <= maxDegree; d++) {
    const count = bin[d];
    bin[d] = start;
    start += count;
  }
  const vert = new Int32Array(n);
  const pos = new Int32Array(n);
  for (let i = 0; i < n; i++) {
    pos[i] = bin[core[i]];
    vert[pos[i]] = i;
    bin[core[i]]++;
  }
  for (let d = maxDegree; d > 0; d--) bin[d] = bin[d - 1];
  bin[0] = 0;

  // Peel in non-decreasing degree order, demoting higher-degree neighbors.
  for (let k = 0; k < n; k++) {
    const v = vert[k];
    for (let a = offsets[v]; a < offsets[v + 1]; a++) {
      const u = targets[a];
      if (core[u] > core[v]) {
        const du = core[u];
        const pu = pos[u];
        const pw = bin[du];
        const w = vert[pw];
        if (u !== w) {
          vert[pu] = w;
          pos[w] = pu;
          vert[pw] = u;
          pos[u] = pw;
        }
        bin[du]++;
        core[u]--;
      }
    }
  }

  const result: Record<string, number> = {};
  for (let i = 0; i < n; i++) result[ids[i]] = core[i];
  return result;
}

/**
 * Returns the ids of all nodes in the k-core: the maximal subgraph in which
 * every node has at least `k` neighbors (edges treated as undirected).
 *
 * Node order follows `graph.nodes`. `k <= 0` returns every node id.
 */
export function getKCore(graph: Graph, k: number): string[] {
  const cores = getCoreNumbers(graph);
  return graph.nodes
    .filter((node) => cores[node.id] >= k)
    .map((node) => node.id);
}
