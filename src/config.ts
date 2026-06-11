import type { GraphNode, GraphEdge, NodeConfig, EdgeConfig } from './types';

// --- Compile-time exhaustiveness guards ---
//
// If a field is added to GraphNode/GraphEdge in types.ts, these assertions
// fail to compile until the field lists below (and the clone functions) are
// updated. This prevents toNodeConfig/toEdgeConfig from silently dropping
// newly added fields.

type NodeFieldsHandled =
  | 'type'
  | 'id'
  | 'parentId'
  | 'initialNodeId'
  | 'label'
  | 'data'
  | 'ports'
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'shape'
  | 'color'
  | 'style';

type EdgeFieldsHandled =
  | 'type'
  | 'id'
  | 'sourceId'
  | 'targetId'
  | 'label'
  | 'data'
  | 'weight'
  | 'mode'
  | 'sourcePort'
  | 'targetPort'
  | 'x'
  | 'y'
  | 'width'
  | 'height'
  | 'color'
  | 'style';

// Errors if GraphNode gains a key not listed in NodeFieldsHandled,
// or if NodeFieldsHandled lists a key GraphNode no longer has.
type _AssertNodeComplete = [keyof GraphNode] extends [NodeFieldsHandled]
  ? [NodeFieldsHandled] extends [keyof GraphNode]
    ? true
    : never
  : never;
type _AssertEdgeComplete = [keyof GraphEdge] extends [EdgeFieldsHandled]
  ? [EdgeFieldsHandled] extends [keyof GraphEdge]
    ? true
    : never
  : never;

const _nodeComplete: _AssertNodeComplete = true;
const _edgeComplete: _AssertEdgeComplete = true;
void _nodeComplete;
void _edgeComplete;

// --- Shared GraphNode/GraphEdge → config conversion ---

/**
 * Convert a resolved {@link GraphNode} back into a {@link NodeConfig}.
 *
 * Faithful and complete: round-tripping through `createGraphNode` yields a
 * deep-equal node. Optional fields are only included when present; ports are
 * deep-copied so the config does not share port objects with the source node.
 */
export function toNodeConfig<N, P>(node: GraphNode<N, P>): NodeConfig<N, P> {
  const config: NodeConfig<N, P> = { id: node.id };
  if (node.parentId != null) config.parentId = node.parentId;
  if (node.initialNodeId != null) config.initialNodeId = node.initialNodeId;
  if (node.label != null) config.label = node.label;
  if (node.data != null) config.data = node.data;
  if (node.ports !== undefined) config.ports = node.ports.map((p) => ({ ...p }));
  if (node.x !== undefined) config.x = node.x;
  if (node.y !== undefined) config.y = node.y;
  if (node.width !== undefined) config.width = node.width;
  if (node.height !== undefined) config.height = node.height;
  if (node.shape !== undefined) config.shape = node.shape;
  if (node.color !== undefined) config.color = node.color;
  if (node.style !== undefined) config.style = node.style;
  return config;
}

/**
 * Convert a resolved {@link GraphEdge} back into an {@link EdgeConfig}.
 *
 * Faithful and complete: round-tripping through `createGraphEdge` yields a
 * deep-equal edge. Optional fields are only included when present.
 */
export function toEdgeConfig<E>(edge: GraphEdge<E>): EdgeConfig<E> {
  const config: EdgeConfig<E> = {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
  };
  if (edge.label != null) config.label = edge.label;
  if (edge.data != null) config.data = edge.data;
  if (edge.weight !== undefined) config.weight = edge.weight;
  if (edge.mode !== undefined) config.mode = edge.mode;
  if (edge.sourcePort !== undefined) config.sourcePort = edge.sourcePort;
  if (edge.targetPort !== undefined) config.targetPort = edge.targetPort;
  if (edge.x !== undefined) config.x = edge.x;
  if (edge.y !== undefined) config.y = edge.y;
  if (edge.width !== undefined) config.width = edge.width;
  if (edge.height !== undefined) config.height = edge.height;
  if (edge.color !== undefined) config.color = edge.color;
  if (edge.style !== undefined) config.style = edge.style;
  return config;
}
