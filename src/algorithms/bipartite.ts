import type { Graph } from '../types';
import { getCSR } from './csr';

export interface BipartiteMatch {
  /** Source node id of the matched edge (as stored on the edge). */
  sourceId: string;
  /** Target node id of the matched edge (as stored on the edge). */
  targetId: string;
  /** Id of the edge realizing the match. */
  edgeId: string;
}

interface TwoColoring {
  /** 0/1 color per node position (CSR order). */
  colors: Int8Array;
}

interface ColoringConflict {
  /** Edge whose endpoints received the same color (or a self-loop). */
  conflictEdgeId: string;
}

/**
 * BFS 2-coloring over undirected adjacency. Edges are treated as undirected
 * regardless of mode/direction. Returns either the coloring or the edge that
 * proves the graph is not bipartite.
 */
function getTwoColoring(graph: Graph): TwoColoring | ColoringConflict {
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const m = graph.edges.length;

  // Undirected adjacency with the originating edge index per arc.
  const degree = new Int32Array(n);
  for (let e = 0; e < m; e++) {
    const edge = graph.edges[e];
    if (edge.sourceId === edge.targetId) {
      return { conflictEdgeId: edge.id };
    }
    degree[csr.indexOf.get(edge.sourceId)!]++;
    degree[csr.indexOf.get(edge.targetId)!]++;
  }
  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + degree[i];
  const targets = new Int32Array(offsets[n]);
  const arcEdge = new Int32Array(offsets[n]);
  const cursor = Int32Array.from(offsets.subarray(0, n));
  for (let e = 0; e < m; e++) {
    const edge = graph.edges[e];
    const s = csr.indexOf.get(edge.sourceId)!;
    const t = csr.indexOf.get(edge.targetId)!;
    targets[cursor[s]] = t;
    arcEdge[cursor[s]++] = e;
    targets[cursor[t]] = s;
    arcEdge[cursor[t]++] = e;
  }

  const colors = new Int8Array(n).fill(-1);
  const queue = new Int32Array(n);
  for (let root = 0; root < n; root++) {
    if (colors[root] !== -1) continue;
    colors[root] = 0;
    queue[0] = root;
    let head = 0;
    let tail = 1;
    while (head < tail) {
      const u = queue[head++];
      for (let a = offsets[u]; a < offsets[u + 1]; a++) {
        const v = targets[a];
        if (colors[v] === -1) {
          colors[v] = (1 - colors[u]) as 0 | 1;
          queue[tail++] = v;
        } else if (colors[v] === colors[u]) {
          return { conflictEdgeId: graph.edges[arcEdge[a]].id };
        }
      }
    }
  }

  return { colors };
}

/**
 * Returns whether the graph is bipartite (2-colorable).
 *
 * Edges are treated as undirected; self-loops make a graph non-bipartite.
 * Runs a BFS 2-coloring per connected component — O(n + m).
 */
export function isBipartite(graph: Graph): boolean {
  return 'colors' in getTwoColoring(graph);
}

/**
 * Returns a maximum-cardinality matching of a bipartite graph using
 * Hopcroft–Karp — O(m·√n).
 *
 * The bipartition is derived by 2-coloring (edges treated as undirected).
 * Each match reports the realizing edge with its stored `sourceId`/
 * `targetId` orientation; for parallel edges between a matched pair, the
 * first edge used by the algorithm is reported.
 *
 * Throws if the graph is not bipartite, naming the offending edge.
 */
export function getMaximumBipartiteMatching(graph: Graph): BipartiteMatch[] {
  const coloring = getTwoColoring(graph);
  if (!('colors' in coloring)) {
    throw new Error(
      `getMaximumBipartiteMatching: graph is not bipartite — edge "${coloring.conflictEdgeId}" closes an odd cycle (or is a self-loop); a maximum bipartite matching requires a bipartite graph, check with isBipartite() first`,
    );
  }

  const { colors } = coloring;
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const m = graph.edges.length;

  // Left→right adjacency (left = color 0), with edge index per arc.
  const degree = new Int32Array(n);
  for (let e = 0; e < m; e++) {
    const edge = graph.edges[e];
    const s = csr.indexOf.get(edge.sourceId)!;
    const t = csr.indexOf.get(edge.targetId)!;
    degree[colors[s] === 0 ? s : t]++;
  }
  const offsets = new Int32Array(n + 1);
  for (let i = 0; i < n; i++) offsets[i + 1] = offsets[i] + degree[i];
  const targets = new Int32Array(offsets[n]);
  const arcEdge = new Int32Array(offsets[n]);
  const cursor = Int32Array.from(offsets.subarray(0, n));
  for (let e = 0; e < m; e++) {
    const edge = graph.edges[e];
    const s = csr.indexOf.get(edge.sourceId)!;
    const t = csr.indexOf.get(edge.targetId)!;
    const left = colors[s] === 0 ? s : t;
    const right = colors[s] === 0 ? t : s;
    targets[cursor[left]] = right;
    arcEdge[cursor[left]++] = e;
  }

  const INF = 0x7fffffff;
  const matchLeft = new Int32Array(n).fill(-1); // left pos → right pos
  const matchRight = new Int32Array(n).fill(-1); // right pos → left pos
  const matchEdge = new Int32Array(n).fill(-1); // left pos → edge index
  const dist = new Int32Array(n);
  const queue = new Int32Array(n);

  function bfs(): boolean {
    let head = 0;
    let tail = 0;
    for (let u = 0; u < n; u++) {
      if (colors[u] !== 0) continue;
      if (matchLeft[u] === -1) {
        dist[u] = 0;
        queue[tail++] = u;
      } else {
        dist[u] = INF;
      }
    }
    let foundAugmenting = false;
    while (head < tail) {
      const u = queue[head++];
      for (let a = offsets[u]; a < offsets[u + 1]; a++) {
        const w = matchRight[targets[a]];
        if (w === -1) {
          foundAugmenting = true;
        } else if (dist[w] === INF) {
          dist[w] = dist[u] + 1;
          queue[tail++] = w;
        }
      }
    }
    return foundAugmenting;
  }

  function dfs(u: number): boolean {
    for (let a = offsets[u]; a < offsets[u + 1]; a++) {
      const v = targets[a];
      const w = matchRight[v];
      if (w === -1 || (dist[w] === dist[u] + 1 && dfs(w))) {
        matchLeft[u] = v;
        matchRight[v] = u;
        matchEdge[u] = arcEdge[a];
        return true;
      }
    }
    dist[u] = INF;
    return false;
  }

  while (bfs()) {
    for (let u = 0; u < n; u++) {
      if (colors[u] === 0 && matchLeft[u] === -1) {
        dfs(u);
      }
    }
  }

  const matches: BipartiteMatch[] = [];
  for (let u = 0; u < n; u++) {
    if (matchEdge[u] === -1) continue;
    const edge = graph.edges[matchEdge[u]];
    matches.push({
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      edgeId: edge.id,
    });
  }
  return matches;
}
