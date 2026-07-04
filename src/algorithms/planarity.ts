import type { Graph } from '../types';

/**
 * Test whether a graph is planar using the Left-Right (LR) planarity
 * algorithm of Brandes ("The left-right planarity test", 2009) — a linear-time
 * reformulation of the de Fraysseix–Rosenstiehl–de Mendez characterization.
 * This is a faithful port of networkx's `check_planarity` / `LRPlanarity`
 * (networkx/algorithms/planarity.py, BSD-3-Clause).
 *
 * Edges are treated as **undirected**. Self-loops and multi-edges do not affect
 * planarity and are stripped before testing (a graph with a self-loop or a
 * doubled edge is planar iff its underlying simple graph is). Disconnected
 * graphs are planar iff every connected component is planar — components are
 * tested independently.
 *
 * Fast reject: a simple planar graph on `k ≥ 3` vertices has at most `3k − 6`
 * edges, so any component exceeding that bound is non-planar without running
 * the full test.
 *
 * @returns `true` if the graph can be drawn in the plane without edge crossings.
 */
export function isPlanar<N, E>(graph: Graph<N, E>): boolean {
  const n = graph.nodes.length;
  // K5 and K3,3 (the forbidden minors/subdivisions) both need ≥ 5 vertices.
  if (n < 5) return true;

  const indexOf = new Map<string, number>();
  for (let i = 0; i < n; i++) indexOf.set(graph.nodes[i].id, i);

  // Simple undirected adjacency: dedupe parallel edges, drop self-loops.
  const adjSet: Array<Set<number>> = Array.from({ length: n }, () => new Set());
  for (const edge of graph.edges) {
    const u = indexOf.get(edge.sourceId);
    const v = indexOf.get(edge.targetId);
    if (u === undefined || v === undefined || u === v) continue;
    adjSet[u].add(v);
    adjSet[v].add(u);
  }
  const adj: number[][] = adjSet.map((s) => [...s]);

  // Test each connected component independently.
  const visited = new Uint8Array(n);
  for (let s = 0; s < n; s++) {
    if (visited[s]) continue;
    const comp = collectComponent(s, adj, visited);
    if (comp.length < 5) continue;
    if (!lrTestComponent(comp, adj)) return false;
  }
  return true;
}

function collectComponent(
  start: number,
  adj: number[][],
  visited: Uint8Array,
): number[] {
  const comp: number[] = [];
  const stack = [start];
  visited[start] = 1;
  while (stack.length > 0) {
    const u = stack.pop()!;
    comp.push(u);
    for (const v of adj[u]) {
      if (!visited[v]) {
        visited[v] = 1;
        stack.push(v);
      }
    }
  }
  return comp;
}

/**
 * Half-open interval of return (oriented back) edges, referenced by arc index.
 * `low`/`high` are arc indices, or `-1` for the empty end.
 */
interface Interval {
  low: number;
  high: number;
}

/** Constraint between two intervals: the two sides must be oriented apart. */
interface ConflictPair {
  left: Interval;
  right: Interval;
}

const NONE = -1;

/**
 * Left-Right planarity test for a single connected component (Brandes 2009),
 * ported faithfully from networkx's iterative `LRPlanarity` implementation.
 *
 * Oriented edges are represented by integer arc indices; `src[e]`/`dst[e]`
 * recover the `(v, w)` endpoints that the Python version keeps as tuples.
 * We only decide planarity, so embedding construction (`dfs_embedding`,
 * `sign`, `left_ref`/`right_ref`) is omitted — but every piece of logic that
 * affects the True/False result is preserved exactly.
 *
 * `comp` lists the global vertex indices of the component; they are renumbered
 * locally to 0..k-1.
 */
function lrTestComponent(comp: number[], globalAdj: number[][]): boolean {
  const k = comp.length;
  const local = new Map<number, number>();
  for (let i = 0; i < k; i++) local.set(comp[i], i);

  const adjs: number[][] = Array.from({ length: k }, () => []);
  let mLocal = 0;
  for (let i = 0; i < k; i++) {
    for (const gv of globalAdj[comp[i]]) {
      const lv = local.get(gv);
      if (lv !== undefined) adjs[i].push(lv);
    }
    mLocal += adjs[i].length;
  }
  mLocal /= 2;
  // if order > 2 and size > 3*order - 6 then not planar (k >= 5 here).
  if (mLocal > 3 * k - 6) return false;

  // ---- Per-vertex state ----
  const height = new Int32Array(k).fill(NONE);
  const parentEdge = new Int32Array(k).fill(NONE);

  // ---- Oriented DFS graph (arcs) ----
  const src: number[] = [];
  const dst: number[] = [];
  const lowpt: number[] = [];
  const lowpt2: number[] = [];
  const nestingDepth: number[] = [];
  // Directed-edge existence check, keyed by v*k + w (only one direction added).
  const arcOf = new Map<number, number>();

  function addArc(v: number, w: number): number {
    const e = src.length;
    src.push(v);
    dst.push(w);
    lowpt.push(0);
    lowpt2.push(0);
    nestingDepth.push(0);
    arcOf.set(v * k + w, e);
    return e;
  }

  function hasArc(a: number, b: number): boolean {
    return arcOf.has(a * k + b) || arcOf.has(b * k + a);
  }

  const roots: number[] = [];

  // ---- dfs_orientation (iterative, mirrors networkx) ----
  for (let s = 0; s < k; s++) {
    if (height[s] !== NONE) continue;
    height[s] = 0;
    roots.push(s);

    const dfsStack: number[] = [s];
    const ind = new Int32Array(k); // 0-initialized
    // skip_init keyed by arc index once the arc exists; but we need it before
    // the arc is created. In networkx skip_init is keyed by (v,w) tuple. We key
    // by v*k+w so it's addressable before orientation.
    const skipInit = new Set<number>();

    while (dfsStack.length > 0) {
      const v = dfsStack.pop()!;
      const e = parentEdge[v];

      let broke = false;
      while (ind[v] < adjs[v].length) {
        const w = adjs[v][ind[v]];
        const vwKey = v * k + w;

        if (!skipInit.has(vwKey)) {
          if (hasArc(v, w)) {
            ind[v]++;
            continue; // already oriented
          }

          const vw = addArc(v, w);
          lowpt[vw] = height[v];
          lowpt2[vw] = height[v];

          if (height[w] === NONE) {
            // tree edge
            parentEdge[w] = vw;
            height[w] = height[v] + 1;
            dfsStack.push(v); // revisit v after w
            dfsStack.push(w); // visit w next
            skipInit.add(vwKey);
            broke = true;
            break;
          } else {
            // back edge
            lowpt[vw] = height[w];
          }
        }

        // vw is the arc for (v, w)
        const vw = arcOf.get(vwKey)!;

        // nesting depth
        nestingDepth[vw] = 2 * lowpt[vw];
        if (lowpt2[vw] < height[v]) nestingDepth[vw] += 1; // chordal

        // update lowpoints of parent edge e
        if (e !== NONE) {
          if (lowpt[vw] < lowpt[e]) {
            lowpt2[e] = Math.min(lowpt[e], lowpt2[vw]);
            lowpt[e] = lowpt[vw];
          } else if (lowpt[vw] > lowpt[e]) {
            lowpt2[e] = Math.min(lowpt2[e], lowpt[vw]);
          } else {
            lowpt2[e] = Math.min(lowpt2[e], lowpt2[vw]);
          }
        }

        ind[v]++;
      }
      // if we broke, v was re-pushed; loop continues with w on top.
      void broke;
    }
  }

  // ---- ordered adjacency lists by nesting depth ----
  // For each vertex v, the arcs leaving v sorted by nesting_depth[(v,w)].
  const outArcs: number[][] = Array.from({ length: k }, () => []);
  for (let e = 0; e < src.length; e++) outArcs[src[e]].push(e);
  const orderedAdjs: number[][] = outArcs.map((arcs) =>
    [...arcs].sort((a, b) => nestingDepth[a] - nestingDepth[b]),
  );

  // ---- dfs_testing (iterative, mirrors networkx) ----
  const S: ConflictPair[] = [];
  const stackBottom = new Int32Array(src.length).fill(NONE);
  const lowptEdge = new Int32Array(src.length).fill(NONE);
  const ref = new Int32Array(src.length).fill(NONE);
  // side is only needed for embedding; omitted for the boolean test.

  const emptyInterval = (): Interval => ({ low: NONE, high: NONE });
  const isIntervalEmpty = (iv: Interval): boolean =>
    iv.low === NONE && iv.high === NONE;
  const copyInterval = (iv: Interval): Interval => ({
    low: iv.low,
    high: iv.high,
  });

  // top_of_stack index (-1 when empty), used for stack_bottom comparisons.
  const topIndex = (): number => S.length - 1;

  function conflicting(iv: Interval, b: number): boolean {
    return !isIntervalEmpty(iv) && lowpt[iv.high] > lowpt[b];
  }

  function lowest(P: ConflictPair): number {
    if (isIntervalEmpty(P.left)) return lowpt[P.right.low];
    if (isIntervalEmpty(P.right)) return lowpt[P.left.low];
    return Math.min(lowpt[P.left.low], lowpt[P.right.low]);
  }

  function addConstraints(ei: number, e: number): boolean {
    const P: ConflictPair = { left: emptyInterval(), right: emptyInterval() };
    // merge return edges of e_i into P.right
    // Loop condition: break when top_of_stack index == stack_bottom[ei].
    while (true) {
      const Q = S.pop()!;
      if (!isIntervalEmpty(Q.left)) {
        // swap
        const t = Q.left;
        Q.left = Q.right;
        Q.right = t;
      }
      if (!isIntervalEmpty(Q.left)) {
        // not planar
        return false;
      }
      if (lowpt[Q.right.low] > lowpt[e]) {
        // merge intervals
        if (isIntervalEmpty(P.right)) {
          P.right = copyInterval(Q.right);
        } else {
          ref[P.right.low] = Q.right.high;
        }
        P.right.low = Q.right.low;
      } else {
        // align
        ref[Q.right.low] = lowptEdge[e];
      }
      if (topIndex() === stackBottom[ei]) break;
    }
    // merge conflicting return edges of e_1..e_{i-1} into P.left
    while (
      S.length > 0 &&
      (conflicting(S[S.length - 1].left, ei) ||
        conflicting(S[S.length - 1].right, ei))
    ) {
      const Q = S.pop()!;
      if (conflicting(Q.right, ei)) {
        const t = Q.left;
        Q.left = Q.right;
        Q.right = t;
      }
      if (conflicting(Q.right, ei)) {
        // not planar
        return false;
      }
      // merge interval below lowpt(e_i) into P.right
      ref[P.right.low] = Q.right.high;
      if (Q.right.low !== NONE) {
        P.right.low = Q.right.low;
      }
      if (isIntervalEmpty(P.left)) {
        P.left = copyInterval(Q.left);
      } else {
        ref[P.left.low] = Q.left.high;
      }
      P.left.low = Q.left.low;
    }

    if (!(isIntervalEmpty(P.left) && isIntervalEmpty(P.right))) {
      S.push(P);
    }
    return true;
  }

  function removeBackEdges(e: number): void {
    const u = src[e];
    // drop entire conflict pairs returning to parent u
    while (S.length > 0 && lowest(S[S.length - 1]) === height[u]) {
      S.pop();
      // side handling omitted (embedding only)
    }
    if (S.length > 0) {
      const P = S.pop()!;
      // trim left interval
      while (P.left.high !== NONE && dst[P.left.high] === u) {
        P.left.high = ref[P.left.high];
      }
      if (P.left.high === NONE && P.left.low !== NONE) {
        ref[P.left.low] = P.right.low;
        P.left.low = NONE;
      }
      // trim right interval
      while (P.right.high !== NONE && dst[P.right.high] === u) {
        P.right.high = ref[P.right.high];
      }
      if (P.right.high === NONE && P.right.low !== NONE) {
        ref[P.right.low] = P.left.low;
        P.right.low = NONE;
      }
      S.push(P);
    }
    // side of e is side of a highest return edge (ref[e] used only for sign).
    if (lowpt[e] < height[u]) {
      const top = S[S.length - 1];
      const hl = top.left.high;
      const hr = top.right.high;
      if (hl !== NONE && (hr === NONE || lowpt[hl] > lowpt[hr])) {
        ref[e] = hl;
      } else {
        ref[e] = hr;
      }
    }
  }

  function dfsTesting(root: number): boolean {
    const dfsStack: number[] = [root];
    const ind = new Int32Array(k);
    const skipInit = new Set<number>(); // keyed by arc index ei

    while (dfsStack.length > 0) {
      const v = dfsStack.pop()!;
      const e = parentEdge[v];
      let skipFinal = false;

      let broke = false;
      while (ind[v] < orderedAdjs[v].length) {
        const ei = orderedAdjs[v][ind[v]];
        const w = dst[ei];

        if (!skipInit.has(ei)) {
          stackBottom[ei] = topIndex();

          if (ei === parentEdge[w]) {
            // tree edge
            dfsStack.push(v); // revisit v after w
            dfsStack.push(w); // visit w next
            skipInit.add(ei);
            skipFinal = true;
            broke = true;
            break;
          } else {
            // back edge
            lowptEdge[ei] = ei;
            S.push({
              left: emptyInterval(),
              right: { low: ei, high: ei },
            });
          }
        }

        // integrate new return edges
        if (lowpt[ei] < height[v]) {
          if (ei === orderedAdjs[v][0]) {
            // e_i has return edge
            lowptEdge[e] = lowptEdge[ei];
          } else {
            // add constraints of e_i
            if (!addConstraints(ei, e)) return false;
          }
        }

        ind[v]++;
      }
      void broke;

      if (!skipFinal) {
        // remove back edges returning to parent
        if (e !== NONE) {
          removeBackEdges(e);
        }
      }
    }
    return true;
  }

  for (const root of roots) {
    if (!dfsTesting(root)) return false;
  }
  return true;
}
