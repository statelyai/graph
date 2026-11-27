import type { Graph, GraphEdge, GraphNode } from '../types';
import { getEdgeMode } from '../mode';
import { throwIfAborted } from './abort';

export interface SubgraphIsomorphismOptions<N = any, E = any> {
  /**
   * Require an *induced* match: mapped graph nodes may have no arcs between
   * them that the pattern lacks. Default `false` (a monomorphism: the
   * pattern's edges must exist, extra graph edges are allowed).
   */
  induced?: boolean;
  /** Whether a graph node may play a pattern node. Default: always. */
  nodeMatch?: (graphNode: GraphNode<N>, patternNode: GraphNode<N>) => boolean;
  /** Whether a graph edge may play a pattern edge. Default: always. */
  edgeMatch?: (graphEdge: GraphEdge<E>, patternEdge: GraphEdge<E>) => boolean;
  /** Abort signal, checked once per candidate tried. Throws `signal.reason`. */
  signal?: AbortSignal;
}

/**
 * Arcs of a graph: one per directed edge, both directions per non-directed
 * edge (one arc for a non-directed self-loop). Dangling edges are ignored.
 */
interface ArcModel {
  nodes: GraphNode[];
  n: number;
  indexOf: Map<string, number>;
  /** `u * n + v` → edges realizing arc u→v */
  arcs: Map<number, GraphEdge[]>;
  out: number[][];
  in: number[][];
}

function getArcModel(graph: Graph): ArcModel {
  const n = graph.nodes.length;
  const indexOf = new Map<string, number>();
  graph.nodes.forEach((node, i) => indexOf.set(node.id, i));
  const arcs = new Map<number, GraphEdge[]>();
  const out = Array.from({ length: n }, () => [] as number[]);
  const inn = Array.from({ length: n }, () => [] as number[]);
  const addArc = (u: number, v: number, edge: GraphEdge) => {
    const key = u * n + v;
    const list = arcs.get(key);
    if (list) {
      list.push(edge);
      return;
    }
    arcs.set(key, [edge]);
    out[u].push(v);
    inn[v].push(u);
  };
  for (const edge of graph.edges) {
    const s = indexOf.get(edge.sourceId);
    const t = indexOf.get(edge.targetId);
    if (s === undefined || t === undefined) continue;
    addArc(s, t, edge);
    if (s !== t && getEdgeMode(graph, edge) !== 'directed') addArc(t, s, edge);
  }
  // Snapshot the nodes so mutations mid-iteration cannot desync positions
  return { nodes: graph.nodes.slice(), n, indexOf, arcs, out, in: inn };
}

/**
 * Lazily yields every way the `pattern` graph occurs inside `graph`, as a
 * mapping from pattern node ids to distinct graph node ids (in
 * `pattern.nodes` order). Use it to find motifs: "every state with a
 * transition back to its predecessor", "every diamond", and so on.
 *
 * - Edges are arcs: a directed edge one way, a non-directed edge both ways.
 *   Every pattern arc must exist between the mapped graph nodes (so a
 *   directed pattern edge matches a non-directed graph edge, but not the
 *   other way around).
 * - By default extra graph edges are allowed (monomorphism). Pass
 *   `induced: true` to also forbid graph arcs the pattern does not have.
 * - With `edgeMatch`, each pattern edge needs some graph edge on the same
 *   arc that matches it.
 * - Hierarchy is ignored. An empty pattern yields one empty mapping.
 *
 * Backtracking (VF2-style) with connectivity-ordered candidates;
 * exponential in the worst case. Pass `options.signal` to cancel.
 *
 * @example
 * ```ts
 * const pattern = createGraph({
 *   nodes: [{ id: 'x' }, { id: 'y' }],
 *   edges: [
 *     { id: 'xy', sourceId: 'x', targetId: 'y' },
 *     { id: 'yx', sourceId: 'y', targetId: 'x' },
 *   ],
 * });
 * for (const match of genSubgraphIsomorphisms(graph, pattern)) {
 *   console.log(match.x, match.y); // a pair of mutually connected nodes
 * }
 * ```
 */
export function* genSubgraphIsomorphisms<N, E>(
  graph: Graph<N, E>,
  pattern: Graph<N, E>,
  options?: SubgraphIsomorphismOptions<N, E>,
): Generator<Record<string, string>> {
  const g = getArcModel(graph);
  const p = getArcModel(pattern);
  if (p.n === 0) {
    yield {};
    return;
  }
  if (p.n > g.n) return;
  const induced = options?.induced ?? false;
  const nodeMatch = options?.nodeMatch;
  const edgeMatch = options?.edgeMatch;

  // Pattern visit order: BFS per component from its highest-degree node, so
  // every later node has an already-mapped anchor neighbor.
  const degree = (i: number) => p.out[i].length + p.in[i].length;
  const order: number[] = [];
  const anchor: Array<{ q: number; out: boolean } | null> = [];
  const placed = new Uint8Array(p.n);
  while (order.length < p.n) {
    let start = -1;
    for (let i = 0; i < p.n; i++) {
      if (!placed[i] && (start === -1 || degree(i) > degree(start))) start = i;
    }
    placed[start] = 1;
    order.push(start);
    anchor.push(null);
    for (let head = order.length - 1; head < order.length; head++) {
      const q = order[head];
      for (const [list, out] of [
        [p.out[q], true],
        [p.in[q], false],
      ] as const) {
        for (const v of list) {
          if (placed[v]) continue;
          placed[v] = 1;
          order.push(v);
          anchor.push({ q, out });
        }
      }
    }
  }

  const mapping = new Int32Array(p.n).fill(-1);
  const used = new Uint8Array(g.n);

  const arcEdgesMatch = (pArc: GraphEdge[], gArc: GraphEdge[] | undefined) => {
    if (!gArc) return false;
    if (!edgeMatch) return true;
    return pArc.every((pe) =>
      gArc.some((ge) => edgeMatch(ge as GraphEdge<E>, pe as GraphEdge<E>)),
    );
  };
  // Arcs between pattern node pu (about to map to gu) and mapped node pv
  const pairFeasible = (pu: number, gu: number, pv: number, gv: number) => {
    for (const [a, b, ga, gb] of [
      [pu, pv, gu, gv],
      [pv, pu, gv, gu],
    ]) {
      const pArc = p.arcs.get(a * p.n + b);
      const gArc = g.arcs.get(ga * g.n + gb);
      if (pArc ? !arcEdgesMatch(pArc, gArc) : induced && gArc) return false;
      if (a === b) break;
    }
    return true;
  };
  const feasible = (pu: number, gu: number): boolean => {
    if (used[gu]) return false;
    if (!induced) {
      if (g.out[gu].length < p.out[pu].length) return false;
      if (g.in[gu].length < p.in[pu].length) return false;
    }
    if (nodeMatch && !nodeMatch(g.nodes[gu] as GraphNode<N>, p.nodes[pu] as GraphNode<N>)) {
      return false;
    }
    if (!pairFeasible(pu, gu, pu, gu)) return false;
    for (let k = 0; k < p.n; k++) {
      if (mapping[k] !== -1 && !pairFeasible(pu, gu, k, mapping[k])) return false;
    }
    return true;
  };
  const allNodes = Array.from({ length: g.n }, (_, i) => i);
  const candidatesAt = (depth: number): number[] => {
    const a = anchor[depth];
    if (!a) return allNodes;
    const image = mapping[a.q];
    return a.out ? g.out[image] : g.in[image];
  };

  const candidates: number[][] = [candidatesAt(0)];
  const cursor: number[] = [0];
  let depth = 0;
  while (depth >= 0) {
    const list = candidates[depth];
    if (cursor[depth] >= list.length) {
      depth--;
      if (depth >= 0) {
        const pu = order[depth];
        used[mapping[pu]] = 0;
        mapping[pu] = -1;
      }
      continue;
    }
    const gu = list[cursor[depth]++];
    throwIfAborted(options?.signal);
    const pu = order[depth];
    if (!feasible(pu, gu)) continue;
    if (depth + 1 === p.n) {
      mapping[pu] = gu;
      const result: Record<string, string> = {};
      for (let k = 0; k < p.n; k++) {
        result[p.nodes[k].id] = g.nodes[mapping[k]].id;
      }
      mapping[pu] = -1;
      yield result;
      continue;
    }
    mapping[pu] = gu;
    used[gu] = 1;
    depth++;
    candidates[depth] = candidatesAt(depth);
    cursor[depth] = 0;
  }
}

/**
 * Returns every occurrence of `pattern` inside `graph`. Eager form of
 * {@link genSubgraphIsomorphisms}; the output can be exponential.
 */
export function getSubgraphIsomorphisms<N, E>(
  graph: Graph<N, E>,
  pattern: Graph<N, E>,
  options?: SubgraphIsomorphismOptions<N, E>,
): Record<string, string>[] {
  return [...genSubgraphIsomorphisms(graph, pattern, options)];
}

/**
 * Whether `pattern` occurs inside `graph` (see
 * {@link genSubgraphIsomorphisms}). Stops at the first match.
 */
export function hasSubgraphIsomorphism<N, E>(
  graph: Graph<N, E>,
  pattern: Graph<N, E>,
  options?: SubgraphIsomorphismOptions<N, E>,
): boolean {
  return !genSubgraphIsomorphisms(graph, pattern, options).next().done;
}
