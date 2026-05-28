import type { NodeBase, EdgeBase } from '@xyflow/system';
import type { VisualGraph, VisualGraphFormatConverter } from '../../types';

const STATELYAI_METADATA_KEY = '__statelyai';

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
  data?: Record<string, unknown>;
}

interface XYFlowMetadata {
  graph?: Partial<VisualGraph>;
  data?: unknown;
  node?: Record<string, unknown>;
  edge?: Record<string, unknown>;
}

function toDataObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? { ...(value as Record<string, unknown>) }
    : {};
}

function withMetadata(
  value: unknown,
  metadata: XYFlowMetadata,
): Record<string, unknown> {
  return {
    ...toDataObject(value),
    [STATELYAI_METADATA_KEY]: {
      ...(value !== undefined && { data: value }),
      ...metadata,
    },
  };
}

function readMetadata(value: unknown): XYFlowMetadata | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const metadata = (value as Record<string, unknown>)[STATELYAI_METADATA_KEY];
  return metadata && typeof metadata === 'object'
    ? (metadata as XYFlowMetadata)
    : undefined;
}

function readUserData(value: unknown): unknown {
  const metadata = readMetadata(value);
  if (metadata && 'data' in metadata) return metadata.data;
  return value;
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
    data: {
      [STATELYAI_METADATA_KEY]: {
        graph: {
          id: graph.id,
          mode: graph.mode,
          initialNodeId: graph.initialNodeId,
          data: graph.data,
          direction: graph.direction,
          style: graph.style,
        },
      },
    },
    nodes: graph.nodes.map((n) => {
      const node: XYFlowNode = {
        id: n.id,
        position: { x: n.x, y: n.y },
        data: withMetadata(n.data, {
          node: {
            initialNodeId: n.initialNodeId,
            label: n.label,
            color: n.color,
            style: n.style,
            ports: n.ports,
          },
        }),
      };
      if (n.parentId) node.parentId = n.parentId;
      if (n.shape) node.type = n.shape;
      if (n.width !== undefined) node.width = n.width;
      if (n.height !== undefined) node.height = n.height;
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
      edge.data = withMetadata(e.data, {
        edge: {
          label: e.label,
          weight: e.weight,
          color: e.color,
          style: e.style,
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
        },
      });
      if (e.label) edge.data.label = e.label;
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
  const graphMetadata = readMetadata(flow.data)?.graph;
  return {
    id: graphMetadata?.id?.toString() ?? '',
    mode: graphMetadata?.mode ?? 'directed',
    initialNodeId:
      graphMetadata && 'initialNodeId' in graphMetadata
        ? (graphMetadata.initialNodeId as string | null)
        : null,
    data:
      graphMetadata && 'data' in graphMetadata
        ? graphMetadata.data
        : (undefined as any),
    direction:
      (graphMetadata?.direction as VisualGraph['direction'] | undefined) ??
      'down',
    ...(graphMetadata?.style !== undefined && { style: graphMetadata.style }),
    nodes: flow.nodes.map((n) => {
      const metadata = readMetadata(n.data)?.node;
      return {
        type: 'node' as const,
        id: n.id,
        parentId: n.parentId ?? null,
        initialNodeId:
          metadata && 'initialNodeId' in metadata
            ? (metadata.initialNodeId as string | null)
            : null,
        label:
          metadata && 'label' in metadata
            ? (metadata.label as string | null)
            : '',
        data: readUserData(n.data),
        x: n.position.x,
        y: n.position.y,
        width: n.measured?.width ?? n.width ?? n.initialWidth ?? 0,
        height: n.measured?.height ?? n.height ?? n.initialHeight ?? 0,
        ...(n.type && { shape: n.type }),
        ...(metadata?.color !== undefined && { color: metadata.color as string }),
        ...(metadata?.style !== undefined && {
          style: metadata.style as VisualGraph['style'],
        }),
        ...(metadata?.ports !== undefined && {
          ports: metadata.ports as VisualGraph['nodes'][number]['ports'],
        }),
      };
    }),
    edges: flow.edges.map((e, i) => {
      const metadata = readMetadata(e.data)?.edge;
      return {
        type: 'edge' as const,
        id: e.id ?? `e${i}`,
        sourceId: e.source,
        targetId: e.target,
        label:
          metadata && 'label' in metadata
            ? (metadata.label as string | null)
            : ((e.data as Record<string, unknown> | undefined)?.label?.toString() ??
              ''),
        ...(e.sourceHandle && { sourcePort: e.sourceHandle }),
        ...(e.targetHandle && { targetPort: e.targetHandle }),
        data: readUserData(e.data),
        x: (metadata?.x as number | undefined) ?? 0,
        y: (metadata?.y as number | undefined) ?? 0,
        width: (metadata?.width as number | undefined) ?? 0,
        height: (metadata?.height as number | undefined) ?? 0,
        ...(metadata?.weight !== undefined && {
          weight: metadata.weight as number,
        }),
        ...(metadata?.color !== undefined && { color: metadata.color as string }),
        ...(metadata?.style !== undefined && {
          style: metadata.style as VisualGraph['style'],
        }),
      };
    }),
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
