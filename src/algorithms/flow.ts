import type { Graph, GraphEdge } from '../types';
import { getIndex } from '../indexing';
import { getEdgeMode } from '../mode';

export interface MaxFlowOptions<E = any> {
  /** Source node id. */
  from: string;
  /** Sink node id. */
  to: string;
  /** Edge capacity accessor. Defaults to `edge.weight ?? 1`. */
  getCapacity?: (edge: GraphEdge<E>) => number;
}

export interface MaxFlowResult<E = any> {
  /** Maximum flow value from source to sink. */
  value: number;
  /** Net flow per edge id (positive means source→target direction). */
  flows: Record<string, number>;
  /** Edges in the minimum cut (max-flow-min-cut theorem). */
  cutEdges: GraphEdge<E>[];
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
 * @example
 * ```ts
 * const { value, cutEdges } = getMaxFlow(graph, { from: 's', to: 't' });
 * ```
 */
export function getMaxFlow<N, E>(
  graph: Graph<N, E>,
  options: MaxFlowOptions<E>,
): MaxFlowResult<E> {
  const { from, to } = options;
  const getCapacity =
    options.getCapacity ?? ((edge: GraphEdge<E>) => edge.weight ?? 1);

  const idx = getIndex(graph);
  if (!idx.nodeById.has(from)) {
    throw new Error(
      `getMaxFlow: source node "${from}" not found in graph — pass an existing node id as options.from`,
    );
  }
  if (!idx.nodeById.has(to)) {
    throw new Error(
      `getMaxFlow: sink node "${to}" not found in graph — pass an existing node id as options.to`,
    );
  }
  if (from === to) {
    throw new Error(
      `getMaxFlow: source and sink are both "${from}" — they must be different nodes`,
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
    const capacity = getCapacity(edge as GraphEdge<E>);
    if (capacity < 0) {
      throw new Error(
        `getMaxFlow: edge "${edge.id}" has negative capacity ${capacity} — capacities must be >= 0; fix edge.weight or provide a non-negative getCapacity`,
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
    value += bottleneck;
  }

  // --- Net flow per edge id ---
  const flows = Object.fromEntries(
    graph.edges.map((edge) => [edge.id, 0]),
  ) as Record<string, number>;
  for (const arc of arcs) {
    if (arc.edgeId !== undefined && arc.flow > 0) {
      flows[arc.edgeId] += arc.sign! * arc.flow;
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

  return { value, flows, cutEdges };
}
