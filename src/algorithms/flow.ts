import type { Graph, GraphEdge } from '../types';
import { getIndex } from '../indexing';
import { getEdgeMode } from '../mode';
import { throwIfAborted } from './abort';
import { addFiniteNumbers, assertFiniteNumber } from './numeric';

export interface MaxFlowOptions<E = any> {
  /** Source node id. */
  from: string;
  /** Sink node id. */
  to: string;
  /** Finite non-negative edge capacity. Defaults to `edge.weight ?? 1`. */
  getCapacity?: (edge: GraphEdge<E>) => number;
  /** Abort signal, checked once per augmenting path. Throws `signal.reason`. */
  signal?: AbortSignal;
}

export interface MaxFlowResult<E = any> {
  /** Maximum flow value from source to sink. */
  value: number;
  /** Net flow per edge id (positive means source→target direction). */
  flows: Record<string, number>;
  /** Edges in the minimum cut (max-flow-min-cut theorem). */
  cutEdges: GraphEdge<E>[];
}

export interface MinCutOptions<E = any> {
  /** Source node id. */
  from: string;
  /** Sink node id. */
  to: string;
  /** Finite non-negative edge capacity. Defaults to `edge.weight ?? 1`. */
  getCapacity?: (edge: GraphEdge<E>) => number;
  /** Abort signal, checked once per augmenting path. Throws `signal.reason`. */
  signal?: AbortSignal;
}

export interface MinCutResult<E = any> {
  /** Total capacity of the cut (equals the max-flow value). */
  value: number;
  /** Edges crossing the cut, in `graph.edges` order. */
  cutEdges: GraphEdge<E>[];
  /** Node ids on each side of the cut, in `graph.nodes` order. */
  partition: { source: string[]; sink: string[] };
}

interface Arc {
  to: string;
  capacity: number;
  flow: number;
  /** Originating edge id (residual arcs have none). */
  edgeId?: string;
  /** +1: arc follows edge source→target; -1: arc follows target→source. */
  sign?: 1 | -1;
}

interface MaxFlowSolution<E> extends MaxFlowResult<E> {
  /** Node ids reachable from the source in the final residual graph. */
  sourceSide: Set<string>;
}

/**
 * Shared Edmonds-Karp solver behind {@link getMaxFlow} and {@link getMinCut}.
 * `caller` only shapes the error messages. Returns `undefined` when either
 * endpoint is not in the graph.
 */
function solveMaxFlow<N, E>(
  graph: Graph<N, E>,
  caller: string,
  from: string,
  to: string,
  getCapacity: (edge: GraphEdge<E>) => number,
  signal?: AbortSignal,
): MaxFlowSolution<E> | undefined {
  const idx = getIndex(graph);
  if (!idx.nodeById.has(from) || !idx.nodeById.has(to)) return undefined;
  if (from === to) {
    throw new Error(
      `${caller}: source and sink are both "${from}" — they must be different nodes`,
    );
  }

  // --- Build residual graph ---
  const arcs: Arc[] = [];
  const outArcs = new Map<string, number[]>();
  for (const node of graph.nodes) outArcs.set(node.id, []);

  function addArc(
    u: string,
    v: string,
    capacity: number,
    edgeId: string,
    sign: 1 | -1,
  ): void {
    outArcs.get(u)!.push(arcs.length);
    arcs.push({ to: v, capacity, flow: 0, edgeId, sign });
    outArcs.get(v)!.push(arcs.length);
    arcs.push({ to: u, capacity: 0, flow: 0 });
  }

  for (const edge of graph.edges) {
    // Dangling edges carry no flow (they still appear in `flows` as 0)
    if (!outArcs.has(edge.sourceId) || !outArcs.has(edge.targetId)) continue;
    const capacity = assertFiniteNumber(
      getCapacity(edge as GraphEdge<E>),
      `${caller}: capacity for edge "${edge.id}"`,
    );
    if (capacity < 0) {
      throw new Error(
        `${caller}: edge "${edge.id}" has negative capacity ${capacity} — capacities must be >= 0; fix edge.weight or provide a non-negative getCapacity`,
      );
    }
    if (edge.sourceId === edge.targetId) continue; // self-loops carry no s-t flow
    addArc(edge.sourceId, edge.targetId, capacity, edge.id, 1);
    if (getEdgeMode(graph, edge) !== 'directed') {
      addArc(edge.targetId, edge.sourceId, capacity, edge.id, -1);
    }
  }

  function residual(arcIndex: number): number {
    return arcs[arcIndex].capacity - arcs[arcIndex].flow;
  }

  // --- Edmonds-Karp: BFS augmenting paths over the residual graph ---
  let value = 0;
  while (true) {
    throwIfAborted(signal);
    const parentArc = new Map<string, number>();
    const queue: string[] = [from];
    const visited = new Set<string>([from]);

    while (queue.length > 0 && !visited.has(to)) {
      const u = queue.shift()!;
      for (const ai of outArcs.get(u) ?? []) {
        const arc = arcs[ai];
        if (residual(ai) > 0 && !visited.has(arc.to)) {
          visited.add(arc.to);
          parentArc.set(arc.to, ai);
          queue.push(arc.to);
        }
      }
    }

    if (!visited.has(to)) break;

    // Bottleneck along the path
    let bottleneck = Infinity;
    for (let v = to; v !== from; ) {
      const ai = parentArc.get(v)!;
      bottleneck = Math.min(bottleneck, residual(ai));
      v = arcs[ai ^ 1].to;
    }

    if (bottleneck === Infinity || bottleneck <= 0) break;

    for (let v = to; v !== from; ) {
      const ai = parentArc.get(v)!;
      arcs[ai].flow += bottleneck;
      arcs[ai ^ 1].flow -= bottleneck;
      v = arcs[ai ^ 1].to;
    }
    value = addFiniteNumbers(value, bottleneck, `${caller}: total flow`);
  }

  // --- Net flow per edge id ---
  const flows = Object.fromEntries(
    graph.edges.map((edge) => [edge.id, 0]),
  ) as Record<string, number>;
  for (const arc of arcs) {
    if (arc.edgeId !== undefined && arc.flow > 0) {
      flows[arc.edgeId] = addFiniteNumbers(
        flows[arc.edgeId],
        arc.sign! * arc.flow,
        `${caller}: flow for edge "${arc.edgeId}"`,
      );
    }
  }

  // --- Min cut: edges crossing from the residual source side to the rest ---
  const sourceSide = new Set<string>([from]);
  const queue: string[] = [from];
  while (queue.length > 0) {
    const u = queue.shift()!;
    for (const ai of outArcs.get(u) ?? []) {
      const arc = arcs[ai];
      if (residual(ai) > 0 && !sourceSide.has(arc.to)) {
        sourceSide.add(arc.to);
        queue.push(arc.to);
      }
    }
  }

  const cutEdgeIds = new Set<string>();
  for (let ai = 0; ai < arcs.length; ai++) {
    const arc = arcs[ai];
    if (arc.edgeId === undefined) continue;
    const arcFrom = arcs[ai ^ 1].to;
    if (sourceSide.has(arcFrom) && !sourceSide.has(arc.to)) {
      cutEdgeIds.add(arc.edgeId);
    }
  }
  const cutEdges = graph.edges.filter((edge) =>
    cutEdgeIds.has(edge.id),
  ) as GraphEdge<E>[];

  return { value, flows, cutEdges, sourceSide };
}

/**
 * Returns the maximum flow from `from` to `to` using the Edmonds-Karp
 * algorithm (BFS augmenting paths).
 *
 * Directed edges carry capacity from source to target only. Edges whose
 * effective mode is not `'directed'` (undirected/bidirectional) are modeled
 * as two independent opposite arcs, each with the edge's full capacity.
 *
 * The returned `flows` record maps every edge id to its net flow (positive
 * in the source→target direction). `cutEdges` is a minimum s-t cut: the
 * edges crossing from the source side to the sink side of the final
 * residual graph; the sum of their capacities equals `value`.
 *
 * Returns `undefined` when `from` or `to` is not in the graph.
 *
 * Pass `options.signal` to cancel: the abort is checked once per augmenting
 * path and throws `signal.reason`.
 * Capacities and every accumulated flow value must remain finite.
 *
 * @example
 * ```ts
 * const flow = getMaxFlow(graph, { from: 's', to: 't' });
 * ```
 */
export function getMaxFlow<N, E>(
  graph: Graph<N, E>,
  options: MaxFlowOptions<E>,
): MaxFlowResult<E> | undefined {
  const getCapacity =
    options.getCapacity ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const solution = solveMaxFlow(
    graph,
    'getMaxFlow',
    options.from,
    options.to,
    getCapacity,
    options.signal,
  );
  if (!solution) return undefined;
  const { value, flows, cutEdges } = solution;
  return { value, flows, cutEdges };
}

/**
 * Returns a minimum s-t cut between `from` and `to` via the max-flow
 * min-cut theorem: runs the same Edmonds-Karp solver as {@link getMaxFlow},
 * then splits the nodes by residual reachability from the source.
 *
 * `partition.source` holds the ids of every node reachable from `from` in
 * the final residual graph; `partition.sink` holds the rest (both in
 * `graph.nodes` order). `cutEdges` are the edges crossing the cut (same
 * shape as {@link getMaxFlow}'s), and their total capacity equals `value`.
 *
 * Returns `undefined` when `from` or `to` is not in the graph.
 *
 * Pass `options.signal` to cancel: the abort is checked once per augmenting
 * path and throws `signal.reason`.
 *
 * @example
 * ```ts
 * const cut = getMinCut(graph, { from: 's', to: 't' });
 * ```
 */
export function getMinCut<N, E>(
  graph: Graph<N, E>,
  options: MinCutOptions<E>,
): MinCutResult<E> | undefined {
  const getCapacity =
    options.getCapacity ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);
  const solution = solveMaxFlow(
    graph,
    'getMinCut',
    options.from,
    options.to,
    getCapacity,
    options.signal,
  );
  if (!solution) return undefined;
  const { value, cutEdges, sourceSide } = solution;

  const sourcePartition: string[] = [];
  const sinkPartition: string[] = [];
  for (const node of graph.nodes) {
    (sourceSide.has(node.id) ? sourcePartition : sinkPartition).push(node.id);
  }

  return {
    value,
    cutEdges,
    partition: { source: sourcePartition, sink: sinkPartition },
  };
}
