import type { NodeBase, EdgeBase } from '@xyflow/system';
import type { VisualGraph, VisualGraphFormatConverter } from '../../types';

const STATELYAI_METADATA_KEY = '__statelyai';

/** xyflow Node — re-exported from `@xyflow/system`. */
export type XYFlowNode<
  TNodeData extends Record<string, unknown> = Record<string, unknown>,
> = NodeBase<TNodeData>;

/**
 * xyflow Edge — `EdgeBase` from `@xyflow/system` plus the top-level `label`
 * that React Flow / Svelte Flow actually render (it's a renderer prop, so
 * `EdgeBase` itself doesn't declare it).
 */
export type XYFlowEdge<
  TEdgeData extends Record<string, unknown> = Record<string, unknown>,
> = EdgeBase<TEdgeData> & { label?: string };

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
  // No metadata blob: external xyflow input — pass the data through as-is.
  if (!metadata) return value;
  // Metadata blob present: the original user data (possibly `undefined`) was
  // captured at conversion time; never leak the wrapper object itself.
  return 'data' in metadata ? metadata.data : undefined;
}

/**
 * React Flow requires parent nodes to appear before their children in the
 * nodes array. Reorders iteratively, keeping authored order otherwise: each
 * pass emits nodes whose parent is already emitted (or absent). Nodes left
 * over by a parentId cycle are appended in authored order rather than hanging.
 */
function orderParentsFirst(nodes: XYFlowNode[]): XYFlowNode[] {
  const nodeIds = new Set(nodes.map((n) => n.id));
  const emitted = new Set<string>();
  const result: XYFlowNode[] = [];
  let remaining = nodes;
  while (remaining.length > 0) {
    const deferred: XYFlowNode[] = [];
    for (const node of remaining) {
      if (
        !node.parentId ||
        emitted.has(node.parentId) ||
        // Parent isn't in the graph at all: treat as a root.
        !nodeIds.has(node.parentId)
      ) {
        result.push(node);
        emitted.add(node.id);
      } else {
        deferred.push(node);
      }
    }
    if (deferred.length === remaining.length) {
      // No progress: parentId cycle. Keep the rest in authored order.
      result.push(...deferred);
      break;
    }
    remaining = deferred;
  }
  return result;
}

// --- Conversion ---

/**
 * Converts a visual graph to xyflow (React Flow / Svelte Flow) format.
 *
 * @example
 * ```ts
 * import { createVisualGraph } from '@statelyai/graph';
 * import { toXYFlow } from '@statelyai/graph/xyflow';
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
    nodes: orderParentsFirst(graph.nodes.map((n) => {
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
      // React Flow's built-in nodes render `data.label`
      if (n.label) node.data.label = n.label;
      if (n.shape) node.type = n.shape;
      if (n.width !== undefined) node.width = n.width;
      if (n.height !== undefined) node.height = n.height;
      return node;
    })),
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
          mode: e.mode,
          weight: e.weight,
          points: e.points,
          routing: e.routing,
          color: e.color,
          style: e.style,
          x: e.x,
          y: e.y,
          width: e.width,
          height: e.height,
        },
      });
      // Top-level `label` is what React Flow / Svelte Flow render for edges
      // (their built-in edge components ignore `data.label`)
      if (e.label) edge.label = e.label;
      return edge;
    }),
  };
}

/**
 * Parses an xyflow (React Flow / Svelte Flow) object into a visual graph.
 *
 * @example
 * ```ts
 * import { fromXYFlow } from '@statelyai/graph/xyflow';
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
            : ((n.data as Record<string, unknown> | undefined)?.label?.toString() ??
              ''),
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
            : (e.label ??
              (e.data as Record<string, unknown> | undefined)?.label?.toString() ??
              ''),
        ...(e.sourceHandle && { sourcePort: e.sourceHandle }),
        ...(e.targetHandle && { targetPort: e.targetHandle }),
        data: readUserData(e.data),
        x: (metadata?.x as number | undefined) ?? 0,
        y: (metadata?.y as number | undefined) ?? 0,
        width: (metadata?.width as number | undefined) ?? 0,
        height: (metadata?.height as number | undefined) ?? 0,
        ...(metadata?.mode !== undefined && {
          mode: metadata.mode as VisualGraph['mode'],
        }),
        ...(metadata?.weight !== undefined && {
          weight: metadata.weight as number,
        }),
        ...(metadata?.points !== undefined && {
          points: metadata.points as VisualGraph['edges'][number]['points'],
        }),
        ...(metadata?.routing !== undefined && {
          routing: metadata.routing as VisualGraph['edges'][number]['routing'],
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
 * import { xyflowConverter } from '@statelyai/graph/xyflow';
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
