import type { NodeBase, EdgeBase } from '@xyflow/system';
import type { VisualGraph, VisualGraphFormatConverter } from '../../types';

/** xyflow Node — re-exported from `@xyflow/system`. */
export type XYFlowNode<
  TNodeData extends Record<string, unknown> = Record<string, unknown>,
> = NodeBase<TNodeData>;

/** xyflow Edge — re-exported from `@xyflow/system`. */
export type XYFlowEdge<
  TEdgeData extends Record<string, unknown> = Record<string, unknown>,
> = EdgeBase<TEdgeData>;

export interface XYFlow<
  TNodeData extends Record<string, unknown> = Record<string, unknown>,
  TEdgeData extends Record<string, unknown> = Record<string, unknown>,
> {
  nodes: XYFlowNode<TNodeData>[];
  edges: XYFlowEdge<TEdgeData>[];
}

// --- Conversion ---

/**
 * Converts a visual graph to xyflow (React Flow / Svelte Flow) format.
 *
 * @example
 * ```ts
 * import { createVisualGraph } from '@statelyai/graph';
 * import { toXYFlow } from '@statelyai/graph/formats/xyflow';
 *
 * const graph = createVisualGraph({
 *   nodes: [
 *     { id: 'a', x: 0, y: 0, width: 100, height: 50 },
 *     { id: 'b', x: 200, y: 100, width: 100, height: 50 },
 *   ],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const flow = toXYFlow(graph);
 * // { nodes: [...], edges: [...] }
 * ```
 */
export function toXYFlow(graph: VisualGraph): XYFlow {
  return {
    nodes: graph.nodes.map((n) => {
      const node: XYFlowNode = {
        id: n.id,
        position: { x: n.x, y: n.y },
        data: n.data ?? {},
      };
      if (n.parentId) node.parentId = n.parentId;
      if (n.shape) node.type = n.shape;
      if (n.width) node.width = n.width;
      if (n.height) node.height = n.height;
      return node;
    }),
    edges: graph.edges.map((e) => {
      const edge: XYFlowEdge = {
        id: e.id,
        source: e.sourceId,
        target: e.targetId,
      };
      if (e.sourcePort) edge.sourceHandle = e.sourcePort;
      if (e.targetPort) edge.targetHandle = e.targetPort;
      if (e.data !== undefined) edge.data = e.data;
      if (e.label) {
        edge.data = { ...edge.data, label: e.label } as Record<
          string,
          unknown
        >;
      }
      return edge;
    }),
  };
}

/**
 * Parses an xyflow (React Flow / Svelte Flow) object into a visual graph.
 *
 * @example
 * ```ts
 * import { fromXYFlow } from '@statelyai/graph/formats/xyflow';
 *
 * const graph = fromXYFlow({
 *   nodes: [
 *     { id: 'a', position: { x: 0, y: 0 }, data: {} },
 *     { id: 'b', position: { x: 200, y: 100 }, data: {} },
 *   ],
 *   edges: [{ id: 'e0', source: 'a', target: 'b' }],
 * });
 * ```
 */
export function fromXYFlow(flow: XYFlow): VisualGraph {
  if (!flow || typeof flow !== 'object') {
    throw new Error('XYFlow: expected an object');
  }
  if (!Array.isArray(flow.nodes)) {
    throw new Error('XYFlow: "nodes" must be an array');
  }
  if (!Array.isArray(flow.edges)) {
    throw new Error('XYFlow: "edges" must be an array');
  }
  return {
    id: '',
    type: 'directed',
    initialNodeId: null,
    data: undefined as any,
    direction: 'down',
    nodes: flow.nodes.map((n) => ({
      type: 'node' as const,
      id: n.id,
      parentId: n.parentId ?? null,
      initialNodeId: null,
      label: '',
      data: n.data,
      x: n.position.x,
      y: n.position.y,
      width: n.measured?.width ?? n.width ?? n.initialWidth ?? 0,
      height: n.measured?.height ?? n.height ?? n.initialHeight ?? 0,
      ...(n.type && { shape: n.type }),
    })),
    edges: flow.edges.map((e, i) => ({
      type: 'edge' as const,
      id: e.id ?? `e${i}`,
      sourceId: e.source,
      targetId: e.target,
      label:
        (e.data as Record<string, unknown> | undefined)?.label?.toString() ??
        '',
      ...(e.sourceHandle && { sourcePort: e.sourceHandle }),
      ...(e.targetHandle && { targetPort: e.targetHandle }),
      data: e.data,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    })),
  };
}

/**
 * Bidirectional converter for xyflow (React Flow / Svelte Flow) format.
 *
 * @example
 * ```ts
 * import { createVisualGraph } from '@statelyai/graph';
 * import { xyflowConverter } from '@statelyai/graph/formats/xyflow';
 *
 * const graph = createVisualGraph({
 *   nodes: [
 *     { id: 'a', x: 0, y: 0, width: 100, height: 50 },
 *     { id: 'b', x: 200, y: 100, width: 100, height: 50 },
 *   ],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const flow = xyflowConverter.to(graph);
 * const roundTripped = xyflowConverter.from(flow);
 * ```
 */
export const xyflowConverter: VisualGraphFormatConverter<XYFlow> = {
  to: toXYFlow,
  from: fromXYFlow,
};
