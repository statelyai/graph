import type { Graph, GraphEdge, GraphNode } from '../types';
import { getEdgeMode } from '../mode';
import { throwIfAborted } from './abort';
import { getCSR } from './csr';

export interface IsomorphismOptions<N = any, E = any> {
  nodeMatch?: (a: GraphNode<N>, b: GraphNode<N>) => boolean;
  edgeMatch?: (a: GraphEdge<E>, b: GraphEdge<E>) => boolean;
  /**
   * Abort signal, checked once per backtracking step (candidate mapping
   * position). Throws `signal.reason`.
   */
  signal?: AbortSignal;
}

/**
 * Edges between a node and one neighbor, by how they attach to the node:
 * directed out, directed in, or non-directed. A self-loop is stored once,
 * under the node itself, as `out` (directed) or `und` (non-directed).
 */
interface Relation {
  out: number[];
  in: number[];
  und: number[];
}

interface IsomorphismView {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** node position → neighbor position → edges between them */
  adjacency: Map<number, Relation>[];
  /** node position → structural signature (shared numbering across graphs) */
  signature: Int32Array;
  /** Number of edges with both endpoints in the graph */
  edgeCount: number;
}

function getRelation(
  adjacency: Map<number, Relation>[],
  from: number,
  to: number,
): Relation {
  let relation = adjacency[from].get(to);
  if (!relation) {
    relation = { out: [], in: [], und: [] };
    adjacency[from].set(to, relation);
  }
  return relation;
}

function getIsomorphismView(
  graph: Graph,
  signatureIds: Map<string, number>,
): IsomorphismView {
  const csr = getCSR(graph);
  const n = csr.ids.length;
  const adjacency = Array.from({ length: n }, () => new Map<number, Relation>());
  let edgeCount = 0;
  for (let e = 0; e < graph.edges.length; e++) {
    const edge = graph.edges[e];
    const s = csr.indexOf.get(edge.sourceId);
    const t = csr.indexOf.get(edge.targetId);
    if (s === undefined || t === undefined) continue;
    edgeCount++;
    const directed = getEdgeMode(graph, edge) === 'directed';
    if (s === t) {
      getRelation(adjacency, s, s)[directed ? 'out' : 'und'].push(e);
    } else if (directed) {
      getRelation(adjacency, s, t).out.push(e);
      getRelation(adjacency, t, s).in.push(e);
    } else {
      getRelation(adjacency, s, t).und.push(e);
      getRelation(adjacency, t, s).und.push(e);
    }
  }

  const signature = new Int32Array(n);
  for (let u = 0; u < n; u++) {
    let out = 0;
    let inbound = 0;
    let und = 0;
    for (const [v, relation] of adjacency[u]) {
      if (v === u) continue;
      out += relation.out.length;
      inbound += relation.in.length;
      und += relation.und.length;
    }
    const loops = adjacency[u].get(u);
    const key = `${out}:${inbound}:${und}:${loops?.out.length ?? 0}:${loops?.und.length ?? 0}`;
    let id = signatureIds.get(key);
    if (id === undefined) {
      id = signatureIds.size;
      signatureIds.set(key, id);
    }
    signature[u] = id;
  }

  return { nodes: csr.nodes, edges: graph.edges, adjacency, signature, edgeCount };
}

/**
 * Whether the edges in `a` can be paired one-to-one with the edges in `b`
 * so that every pair satisfies `edgeMatch` (bipartite perfect matching via
 * BFS augmenting paths; lists are the parallel edges between two nodes).
 */
function hasEdgePairing<E>(
  a: number[],
  b: number[],
  edgesA: GraphEdge<E>[],
  edgesB: GraphEdge<E>[],
  edgeMatch: (a: GraphEdge<E>, b: GraphEdge<E>) => boolean,
): boolean {
  const k = a.length;
  const matchOfB = new Int32Array(k).fill(-1);
  const matchOfA = new Int32Array(k).fill(-1);
  for (let i = 0; i < k; i++) {
    // `reachedFrom[j]` is the A-edge whose BFS reached B-edge j
    const reachedFrom = new Int32Array(k).fill(-1);
    const queue = [i];
    let free = -1;
    for (let head = 0; head < queue.length && free === -1; head++) {
      const x = queue[head];
      for (let j = 0; j < k; j++) {
        if (reachedFrom[j] !== -1 || !edgeMatch(edgesA[a[x]], edgesB[b[j]])) {
          continue;
        }
        reachedFrom[j] = x;
        if (matchOfB[j] === -1) {
          free = j;
          break;
        }
        queue.push(matchOfB[j]);
      }
    }
    if (free === -1) return false;
    // Flip the alternating path back to `i`
    for (let j = free; j !== -1; ) {
      const x = reachedFrom[j];
      const previous = matchOfA[x];
      matchOfB[j] = x;
      matchOfA[x] = j;
      j = x === i ? -1 : previous;
    }
  }
  return true;
}

function areRelationsCompatible<E>(
  a: Relation | undefined,
  b: Relation | undefined,
  edgesA: GraphEdge<E>[],
  edgesB: GraphEdge<E>[],
  edgeMatch: ((a: GraphEdge<E>, b: GraphEdge<E>) => boolean) | undefined,
): boolean {
  if (!a || !b) return !a && !b;
  for (const key of ['out', 'in', 'und'] as const) {
    if (a[key].length !== b[key].length) return false;
    if (
      edgeMatch &&
      a[key].length > 0 &&
      !hasEdgePairing(a[key], b[key], edgesA, edgesB, edgeMatch)
    ) {
      return false;
    }
  }
  return true;
}

/**
 * Returns whether two graphs are structurally isomorphic: some one-to-one
 * mapping of nodes preserves every edge, its effective mode, and (for
 * directed edges) its direction. Parallel edges and self-loops must match
 * in number. Edges with a missing endpoint are ignored.
 *
 * Optional `nodeMatch` and `edgeMatch` predicates can refine the match using
 * node and edge payloads; parallel edges are paired exactly (not greedily).
 *
 * VF2-style backtracking: nodes are matched in breadth-first order, so each
 * candidate is a neighbor of an already-matched node, and every check is
 * local to the node's neighbors. Iterative, so deep graphs cannot overflow
 * the call stack. Worst case remains exponential, as for any exact test.
 *
 * Pass `options.signal` to cancel: the abort is checked once per backtracking
 * step and throws `signal.reason`.
 */
export function isIsomorphic<N, E>(
  graphA: Graph<N, E>,
  graphB: Graph<N, E>,
  options?: IsomorphismOptions<N, E>,
): boolean {
  if (graphA.nodes.length !== graphB.nodes.length) return false;
  if (graphA.edges.length !== graphB.edges.length) return false;

  const signatureIds = new Map<string, number>();
  const a = getIsomorphismView(graphA, signatureIds);
  const b = getIsomorphismView(graphB, signatureIds);
  if (a.edgeCount !== b.edgeCount) return false;
  const n = a.nodes.length;

  // Same multiset of signatures, and B's nodes bucketed by signature
  const bySignatureB: number[][] = Array.from({ length: signatureIds.size }, () => []);
  for (let v = 0; v < n; v++) bySignatureB[b.signature[v]].push(v);
  const countA = new Int32Array(signatureIds.size);
  for (let u = 0; u < n; u++) countA[a.signature[u]]++;
  for (let s = 0; s < signatureIds.size; s++) {
    if (countA[s] !== bySignatureB[s].length) return false;
  }

  // Matching order: breadth-first per component, each component rooted at
  // its node with the rarest signature (then highest degree).
  const priority = Array.from({ length: n }, (_, u) => u).sort(
    (x, y) =>
      countA[a.signature[x]] - countA[a.signature[y]] ||
      a.adjacency[y].size - a.adjacency[x].size ||
      x - y,
  );
  const order = new Int32Array(n);
  const parent = new Int32Array(n).fill(-1);
  const queued = new Uint8Array(n);
  let tail = 0;
  for (const root of priority) {
    if (queued[root]) continue;
    queued[root] = 1;
    order[tail++] = root;
    for (let head = tail - 1; head < tail; head++) {
      const u = order[head];
      for (const v of a.adjacency[u].keys()) {
        if (queued[v]) continue;
        queued[v] = 1;
        parent[v] = u;
        order[tail++] = v;
      }
    }
  }

  const nodeMatch = options?.nodeMatch;
  const edgeMatch = options?.edgeMatch;
  const signal = options?.signal;
  const mapA = new Int32Array(n).fill(-1);
  const mapB = new Int32Array(n).fill(-1);

  const isFeasible = (u: number, v: number): boolean => {
    if (mapB[v] !== -1 || a.signature[u] !== b.signature[v]) return false;
    if (nodeMatch && !nodeMatch(a.nodes[u] as GraphNode<N>, b.nodes[v] as GraphNode<N>)) {
      return false;
    }
    const edgesA = a.edges as GraphEdge<E>[];
    const edgesB = b.edges as GraphEdge<E>[];
    if (
      !areRelationsCompatible(
        a.adjacency[u].get(u),
        b.adjacency[v].get(v),
        edgesA,
        edgesB,
        edgeMatch,
      )
    ) {
      return false;
    }
    // Every matched neighbor of `u` must map to a neighbor of `v` with the
    // same edges, and `v` must have no other matched neighbors.
    let matchedNeighbors = 0;
    for (const [w, relation] of a.adjacency[u]) {
      if (w === u || mapA[w] === -1) continue;
      matchedNeighbors++;
      const other = b.adjacency[v].get(mapA[w]);
      if (!areRelationsCompatible(relation, other, edgesA, edgesB, edgeMatch)) {
        return false;
      }
    }
    for (const x of b.adjacency[v].keys()) {
      if (x !== v && mapB[x] !== -1) matchedNeighbors--;
    }
    return matchedNeighbors === 0;
  };

  // Iterative backtracking: per depth, the candidate list and a cursor
  const candidates: number[][] = new Array(n);
  const cursor = new Int32Array(n);
  let depth = 0;
  while (depth >= 0) {
    throwIfAborted(signal);
    if (depth === n) return true;
    const u = order[depth];
    if (candidates[depth] === undefined) {
      const p = parent[u];
      candidates[depth] =
        p === -1
          ? bySignatureB[a.signature[u]]
          : [...b.adjacency[mapA[p]].keys()];
      cursor[depth] = 0;
    } else if (mapA[u] !== -1) {
      // Returning from a failed deeper search: undo this depth's choice
      mapB[mapA[u]] = -1;
      mapA[u] = -1;
    }
    const list = candidates[depth];
    let chosen = -1;
    while (cursor[depth] < list.length) {
      const v = list[cursor[depth]++];
      if (isFeasible(u, v)) {
        chosen = v;
        break;
      }
    }
    if (chosen === -1) {
      candidates[depth] = undefined!;
      depth--;
      continue;
    }
    mapA[u] = chosen;
    mapB[chosen] = u;
    depth++;
  }
  return false;
}
