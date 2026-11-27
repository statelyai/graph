import type { Graph, GraphNode } from '../types';
import { getCSR } from './csr';

/**
 * Returns a fundamental cycle basis: a minimal set of cycles from which
 * every cycle of the graph can be built (by symmetric difference of edges).
 * There are `m − n + c` of them, for `c` connected components. Each cycle is
 * its nodes in order around the cycle.
 *
 * Edges are treated as undirected, like NetworkX `cycle_basis`. A spanning
 * forest is grown by breadth-first search in `graph.nodes` order, and each
 * remaining edge closes one cycle, in `graph.edges` order: a self-loop is a
 * cycle of one node, and a parallel edge a cycle of two. Dangling edges are
 * ignored. Use {@link genCycles} for directed simple cycles.
 *
 * O(n + m + total cycle length), iterative.
 *
 * @example
 * ```ts
 * // a–b–c–a triangle plus c–d
 * getCycleBasis(graph).map((cycle) => cycle.map((n) => n.id)); // [['b', 'a', 'c']]
 * ```
 */
export function getCycleBasis<N>(graph: Graph<N>): GraphNode<N>[][] {
  const csr = getCSR(graph);
  const nodes = csr.nodes as GraphNode<N>[];
  const n = nodes.length;
  // Undirected incidence lists over node positions (edge indices)
  const incident: number[][] = Array.from({ length: n }, () => []);
  const ends: Array<[number, number] | undefined> = graph.edges.map((edge, e) => {
    const s = csr.indexOf.get(edge.sourceId);
    const t = csr.indexOf.get(edge.targetId);
    if (s === undefined || t === undefined) return undefined;
    incident[s].push(e);
    if (s !== t) incident[t].push(e);
    return [s, t];
  });

  const parent = new Int32Array(n).fill(-1);
  const depth = new Int32Array(n).fill(-1);
  const treeEdge = new Uint8Array(graph.edges.length);
  const queue = new Int32Array(n);
  for (let root = 0; root < n; root++) {
    if (depth[root] !== -1) continue;
    depth[root] = 0;
    queue[0] = root;
    let tail = 1;
    for (let head = 0; head < tail; head++) {
      const u = queue[head];
      for (const e of incident[u]) {
        const [s, t] = ends[e]!;
        const v = s === u ? t : s;
        if (depth[v] !== -1) continue;
        depth[v] = depth[u] + 1;
        parent[v] = u;
        treeEdge[e] = 1;
        queue[tail++] = v;
      }
    }
  }

  const cycles: GraphNode<N>[][] = [];
  graph.edges.forEach((_, e) => {
    const pair = ends[e];
    if (!pair || treeEdge[e]) return;
    let [u, v] = pair;
    // Walk both ends up to their lowest common ancestor
    const left: number[] = [];
    const right: number[] = [];
    while (depth[u] > depth[v]) {
      left.push(u);
      u = parent[u];
    }
    while (depth[v] > depth[u]) {
      right.push(v);
      v = parent[v];
    }
    while (u !== v) {
      left.push(u);
      right.push(v);
      u = parent[u];
      v = parent[v];
    }
    left.push(u);
    cycles.push([...left, ...right.reverse()].map((i) => nodes[i]));
  });
  return cycles;
}
