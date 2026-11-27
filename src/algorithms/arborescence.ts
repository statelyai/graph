import type { Graph, GraphEdge } from '../types';
import { createGraph } from '../graph';
import { toEdgeConfig, toNodeConfig } from '../config';
import { getEdgeMode } from '../mode';

export interface SpanningArborescenceOptions<E = any> {
  /** Finite edge weight accessor. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<E>) => number;
  /** Required root. Default: whichever root gives the cheapest arborescence. */
  from?: string;
  /** Find the maximum-weight arborescence instead. Default `false`. */
  maximum?: boolean;
}

interface Arc {
  u: number;
  v: number;
  w: number;
  /** Index into `graph.edges` (-1 for a virtual arc). */
  parent: number;
}

/** Skew-heap node over incoming arcs, with a lazy weight offset. */
interface HeapNode {
  arc: number;
  w: number;
  delta: number;
  left: HeapNode | null;
  right: HeapNode | null;
}

function push(node: HeapNode): void {
  if (node.delta === 0) return;
  node.w += node.delta;
  if (node.left) node.left.delta += node.delta;
  if (node.right) node.right.delta += node.delta;
  node.delta = 0;
}

/** Iterative skew-heap merge (no recursion, so no stack limit). */
function merge(a0: HeapNode | null, b0: HeapNode | null): HeapNode | null {
  let a = a0;
  let b = b0;
  if (!a) return b;
  if (!b) return a;
  let root: HeapNode | null = null;
  let tail: HeapNode | null = null;
  while (a && b) {
    push(a);
    push(b);
    if (a.w > b.w) [a, b] = [b, a];
    // `a` joins the merged spine; its old left child becomes its right
    if (tail) tail.left = a;
    else root = a;
    const next: HeapNode | null = a.right;
    a.right = a.left;
    a.left = null;
    tail = a;
    a = next;
  }
  tail!.left = a ?? b;
  return root;
}

/** Union-find with union by size and rollback (no path compression). */
class RollbackUnionFind {
  private parent: Int32Array;
  private history: number[] = [];
  constructor(n: number) {
    this.parent = new Int32Array(n).fill(-1);
  }
  find(x: number): number {
    while (this.parent[x] >= 0) x = this.parent[x];
    return x;
  }
  time(): number {
    return this.history.length;
  }
  rollback(t: number): void {
    while (this.history.length > t) {
      const value = this.history.pop()!;
      const index = this.history.pop()!;
      this.parent[index] = value;
    }
  }
  join(a0: number, b0: number): boolean {
    let a = this.find(a0);
    let b = this.find(b0);
    if (a === b) return false;
    if (this.parent[a] > this.parent[b]) [a, b] = [b, a];
    this.history.push(a, this.parent[a], b, this.parent[b]);
    this.parent[a] += this.parent[b];
    this.parent[b] = a;
    return true;
  }
}

/**
 * Chu–Liu/Edmonds with mergeable heaps (Tarjan / Gabow et al.):
 * O(m log n). Returns the chosen incoming arc per node (`-1` for the root),
 * or `undefined` when some node cannot be reached.
 */
function solve(n: number, arcs: Arc[], root: number): Int32Array | undefined {
  const uf = new RollbackUnionFind(n);
  const heap: Array<HeapNode | null> = new Array(n).fill(null);
  arcs.forEach((arc, i) => {
    if (arc.u === arc.v) return;
    heap[arc.v] = merge(heap[arc.v], {
      arc: i,
      w: arc.w,
      delta: 0,
      left: null,
      right: null,
    });
  });
  const seen = new Int32Array(n).fill(-1);
  seen[root] = root;
  const path = new Int32Array(n);
  const queue = new Int32Array(n);
  const incoming = new Int32Array(n).fill(-1);
  const cycles: Array<{ u: number; time: number; arcs: number[] }> = [];

  for (let s = 0; s < n; s++) {
    let u = s;
    let qi = 0;
    while (seen[u] < 0) {
      const top = heap[u];
      if (!top) return undefined;
      push(top);
      const arc = top.arc;
      top.delta -= top.w;
      push(top);
      heap[u] = merge(top.left, top.right);
      queue[qi] = arc;
      path[qi++] = u;
      seen[u] = s;
      u = uf.find(arcs[arc].u);
      if (seen[u] === s) {
        // Found a cycle: contract it into one super node
        let cycleHeap: HeapNode | null = null;
        const end = qi;
        const time = uf.time();
        let w: number;
        do {
          w = path[--qi];
          cycleHeap = merge(cycleHeap, heap[w]);
        } while (uf.join(u, w));
        u = uf.find(u);
        heap[u] = cycleHeap;
        seen[u] = -1;
        cycles.push({ u, time, arcs: Array.from(queue.subarray(qi, end)) });
      }
    }
    for (let i = 0; i < qi; i++) incoming[uf.find(arcs[queue[i]].v)] = queue[i];
  }

  // Expand contracted cycles, most recent first
  for (let c = cycles.length - 1; c >= 0; c--) {
    const { u, time, arcs: cycleArcs } = cycles[c];
    uf.rollback(time);
    const entering = incoming[u];
    for (const arc of cycleArcs) incoming[uf.find(arcs[arc].v)] = arc;
    incoming[uf.find(arcs[entering].v)] = entering;
  }
  return incoming;
}

/**
 * Returns a minimum spanning arborescence: a directed spanning tree in which
 * every node except the root has exactly one incoming edge, all reachable
 * from the root, with the smallest total weight (Chu–Liu/Edmonds). The
 * directed counterpart of {@link getMinimumSpanningTree}: think "the
 * cheapest way to reach every state from one start state".
 *
 * - Without `from`, the root is chosen to minimize the total weight.
 * - Non-directed edges can be used in either direction. Self-loops and
 *   dangling edges are ignored. Weights may be negative.
 * - Returns `undefined` when no spanning arborescence exists (no single root
 *   reaches every node), for an unknown `from`, or for an empty graph.
 *
 * The result is a new graph with every node and the chosen edges, both
 * unchanged, in their original order. O(m log n) with mergeable heaps.
 *
 * @example
 * ```ts
 * const tree = getMinimumSpanningArborescence(graph, { from: 'idle' });
 * isArborescence(tree!); // true (when every chosen edge is directed)
 * ```
 */
export function getMinimumSpanningArborescence<N, E, G, P>(
  graph: Graph<N, E, G, P>,
  options?: SpanningArborescenceOptions<E>,
): Graph<N, E, G, P> | undefined {
  const n = graph.nodes.length;
  if (n === 0) return undefined;
  const sign = options?.maximum ? -1 : 1;
  const getWeight =
    options?.getWeight ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const indexOf = new Map(graph.nodes.map((node, i) => [node.id, i]));

  const arcs: Arc[] = [];
  let magnitude = 1;
  graph.edges.forEach((edge, e) => {
    const u = indexOf.get(edge.sourceId);
    const v = indexOf.get(edge.targetId);
    if (u === undefined || v === undefined || u === v) return;
    const weight = getWeight(edge as GraphEdge<E>);
    if (!Number.isFinite(weight)) {
      throw new Error(
        `getMinimumSpanningArborescence: edge "${edge.id}" has non-finite weight ${weight}`,
      );
    }
    magnitude += Math.abs(weight);
    arcs.push({ u, v, w: sign * weight, parent: e });
    if (getEdgeMode(graph, edge) !== 'directed') {
      arcs.push({ u: v, v: u, w: sign * weight, parent: e });
    }
  });

  let incoming: Int32Array | undefined;
  let root: number;
  if (options?.from !== undefined) {
    const from = indexOf.get(options.from);
    if (from === undefined) return undefined;
    root = from;
    incoming = solve(n, arcs, root);
  } else {
    // A virtual root with one expensive arc to every node: the optimum uses
    // exactly one virtual arc iff a spanning arborescence exists.
    root = n;
    const virtualArcs = Array.from(
      { length: n },
      (_, v): Arc => ({ u: n, v, w: magnitude, parent: -1 }),
    );
    incoming = solve(n + 1, [...arcs, ...virtualArcs], n);
    if (incoming) {
      let virtualCount = 0;
      for (let v = 0; v < n; v++) if (incoming[v] >= arcs.length) virtualCount++;
      if (virtualCount !== 1) return undefined;
    }
  }
  if (!incoming) return undefined;
  const chosen: number[] = [];
  for (let v = 0; v < n; v++) {
    if (v !== root && incoming[v] < arcs.length) chosen.push(incoming[v]);
  }

  const edgeIndices = new Set(chosen.map((i) => arcs[i].parent));
  return createGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    nodes: graph.nodes.map(toNodeConfig),
    edges: graph.edges.filter((_, e) => edgeIndices.has(e)).map(toEdgeConfig),
    data: graph.data,
    direction: graph.direction,
    style: graph.style,
  });
}
