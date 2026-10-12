import type { FormatExportOptions } from '../preservation';
import { createGraphDocumentConverter } from '../document';
import { getStructuredDocumentProjectionGraph, getStructuredDocumentPatch } from '../preservation';
import type { NodeBase, EdgeBase } from '@xyflow/system';
import type { VisualGraph, VisualGraphFormatConverter } from '../../types';
import { createMetadata, createNativeCarrier, getCarrierData, getClonedJSON, getMetadata,
  getNativeCarrier, getRestoredRecord, getMergedNative, isJSONEqual, type FormatMetadata, type FormatImportOptions } from '../preservation';

export type XYFlowNode<TNodeData extends Record<string, unknown> = Record<string, unknown>> = NodeBase<TNodeData>;
export type XYFlowEdge<TEdgeData extends Record<string, unknown> = Record<string, unknown>> = EdgeBase<TEdgeData> & { label?: string };
export interface XYFlow<TNodeData extends Record<string, unknown> = Record<string, unknown>, TEdgeData extends Record<string, unknown> = Record<string, unknown>> {
  nodes: XYFlowNode<TNodeData>[];
  edges: XYFlowEdge<TEdgeData>[];
  data?: Record<string, unknown>;
  viewport?: { x: number; y: number; zoom: number };
  [key: string]: unknown;
}
export interface XYFlowImportOptions extends FormatImportOptions {}

function toDataObject(value: unknown): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? getClonedJSON(value) : {};
}
function getLegacyMetadata(value: any, kind: 'graph' | 'node' | 'edge'): any {
  const metadata = value?.__statelyai;
  return metadata && typeof metadata === 'object' && !metadata.kind && metadata[kind] &&
    typeof metadata[kind] === 'object' && Object.keys(metadata).every((key) => key === kind || key === 'data') ? metadata : undefined;
}
function getUserData(value: any, metadata?: FormatMetadata, legacy?: any): any {
  if (legacy) return legacy.data;
  if (!metadata) return getClonedJSON(value);
  const current = { ...value };
  delete current.__statelyai;
  const baseline = metadata.mapped.__visibleData ?? {};
  const original = metadata.original.data;
  const result = toDataObject(original);
  let edited = false;
  for (const key of new Set([...Object.keys(current), ...Object.keys(baseline)])) {
    if (key === '__statelyai') continue;
    if (Object.hasOwn(current, key) === Object.hasOwn(baseline, key) && isJSONEqual(current[key], baseline[key])) continue;
    // The lifted renderer label belongs to Graph.label unless user data already
    // had a label field. Avoid manufacturing a data.label on unrelated edits.
    if (key === 'label' && !Object.hasOwn(result, 'label')) continue;
    edited = true;
    if (Object.hasOwn(current, key)) Object.defineProperty(result, key, { value: getClonedJSON(current[key]), enumerable: true, writable: true, configurable: true });
    else delete result[key];
  }
  return edited ? result : getClonedJSON(original);
}
function getFields(value: any, keys: string[]): any {
  return Object.fromEntries(keys.filter((key) => value && Object.hasOwn(value, key)).map((key) => [key, value[key]]));
}
function getXYRoot(flow: XYFlow, legacy?: any): Omit<VisualGraph, 'nodes' | 'edges'> {
  return { id: legacy?.graph?.id ?? '', mode: legacy?.graph?.mode ?? 'directed', initialNodeId: legacy?.graph?.initialNodeId ?? null,
    direction: legacy?.graph?.direction ?? 'down', data: legacy?.graph?.data,
    ...getFields(legacy?.graph, ['style']) };
}
function getXYNode(node: XYFlowNode, metadata?: FormatMetadata, legacy?: any): VisualGraph['nodes'][number] {
  const preserved = metadata?.original ?? legacy?.node ?? {};
  const visible = node.data as Record<string, any>;
  return { type: 'node', id: node.id, parentId: node.parentId ?? null,
    initialNodeId: preserved.initialNodeId ?? null, label: visible?.label?.toString() ?? '',
    data: getUserData(node.data, metadata, legacy), x: node.position.x, y: node.position.y,
    width: node.measured?.width ?? node.width ?? node.initialWidth ?? 0,
    height: node.measured?.height ?? node.height ?? node.initialHeight ?? 0,
    ...(Object.hasOwn(node, 'type') && { shape: node.type }),
    ...getFields(preserved, ['color', 'style', 'ports']) };
}
function getXYEdge(edge: XYFlowEdge, index: number, metadata?: FormatMetadata, legacy?: any): VisualGraph['edges'][number] {
  const preserved = metadata?.original ?? legacy?.edge ?? {};
  return { type: 'edge', id: edge.id ?? `e${index}`, sourceId: edge.source, targetId: edge.target,
    label: Object.hasOwn(edge, 'label') ? edge.label : (edge.data as any)?.label?.toString() ?? '',
    data: getUserData(edge.data, metadata, legacy),
    x: preserved.x ?? 0, y: preserved.y ?? 0, width: preserved.width ?? 0, height: preserved.height ?? 0,
    ...(edge.sourceHandle != null && { sourcePort: edge.sourceHandle }),
    ...(edge.targetHandle != null && { targetPort: edge.targetHandle }),
    ...getFields(preserved, ['mode', 'weight', 'points', 'routing', 'color', 'style']) };
}

/**
 * React Flow requires parent nodes to appear before their children in the
 * nodes array. Uses a linear queue, retaining authored sibling order. Nodes
 * left over by a parentId cycle are appended in authored order.
 */
function orderParentsFirst(nodes: XYFlowNode[]): XYFlowNode[] {
  const nodeIds = new Set(nodes.map((node) => node.id));
  const children = new Map<string, XYFlowNode[]>();
  const queue: XYFlowNode[] = [];
  for (const node of nodes) {
    if (!node.parentId || !nodeIds.has(node.parentId)) queue.push(node);
    else {
      const siblings = children.get(node.parentId) ?? [];
      siblings.push(node); children.set(node.parentId, siblings);
    }
  }
  const emitted = new Set<string>();
  const result: XYFlowNode[] = [];
  for (let cursor = 0; cursor < queue.length; cursor++) {
    const node = queue[cursor];
    result.push(node); emitted.add(node.id);
    queue.push(...(children.get(node.id) ?? []));
  }
  // Cycles and their descendants retain authored order, as in legacy exports.
  result.push(...nodes.filter((node) => !emitted.has(node.id)));
  return result;
}

/** Export renderer-visible fields and versioned metadata; snapshots are independent clones. */
export interface XYFlowExportOptions extends FormatExportOptions {}

export function toXYFlow(graph: VisualGraph, options: XYFlowExportOptions = {}): XYFlow {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, 'xyflow');
  if (carrier) return getMergedNative(carrier.native, toRawXYFlow(carrier.baseline),
    toRawXYFlow({ ...graph, data: getCarrierData(graph.data, 'xyflow') }));
  return toRawXYFlow(graph);
}

function toRawXYFlow(graph: VisualGraph): XYFlow {
  const { nodes, edges, ...root } = graph;
  const flow: XYFlow = {
    nodes: orderParentsFirst(nodes.map((node) => {
      const native: XYFlowNode = { id: node.id, position: { x: node.x, y: node.y }, data: toDataObject(node.data),
        ...getFields(node, ['width', 'height']),
        ...(Object.hasOwn(node, 'shape') && { type: node.shape }),
        ...(node.parentId != null && { parentId: node.parentId }) };
      if (node.label) native.data.label = node.label;
      const mapped = { ...getXYNode(native), data: node.data, ...getFields(node, ['color', 'style', 'ports']), __visibleData: getClonedJSON(native.data) };
      native.data.__statelyai = createMetadata('xyflow.node', node, mapped);
      return native;
    })),
    edges: edges.map((edge, index) => {
      const native: XYFlowEdge = { id: edge.id, source: edge.sourceId, target: edge.targetId,
        data: toDataObject(edge.data), ...(edge.label != null && { label: edge.label }),
        ...(edge.sourcePort !== undefined && { sourceHandle: edge.sourcePort }),
        ...(edge.targetPort !== undefined && { targetHandle: edge.targetPort }) };
      const mapped = { ...getXYEdge(native, index), data: edge.data, ...getFields(edge, ['x', 'y', 'width', 'height', 'mode', 'weight', 'points', 'routing', 'color', 'style']), __visibleData: getClonedJSON(native.data) };
      native.data!.__statelyai = createMetadata('xyflow.edge', edge, mapped);
      return native;
    }),
  };
  flow.data = { __statelyai: { ...createMetadata('xyflow.graph', root, getXYRoot(flow)),
    nodeOrder: nodes.map((node) => node.id), nativeNodeOrder: flow.nodes.map((node) => node.id) } };
  return getClonedJSON(flow);
}

/** Import native flows, with an explicit override for reserved wire conventions. */
export function fromXYFlow(flow: XYFlow, options: XYFlowImportOptions = {}): VisualGraph {
  if (!flow || typeof flow !== 'object') throw new Error('XYFlow: expected an object');
  if (!Array.isArray(flow.nodes)) throw new Error('XYFlow: "nodes" must be an array');
  if (!Array.isArray(flow.edges)) throw new Error('XYFlow: "edges" must be an array');
  const getWireMetadata = (value: any, format: string) => options.metadata === 'native' ? undefined : getMetadata(value?.__statelyai, format);
  const getLegacy = (value: any, kind: 'graph' | 'node' | 'edge') => options.metadata === 'native' ? undefined : getLegacyMetadata(value, kind);
  const metadata = getWireMetadata(flow.data, 'xyflow.graph');
  const legacy = getLegacy(flow.data, 'graph');
  const graph: VisualGraph = {
    ...getRestoredRecord(getXYRoot(flow, legacy), metadata),
    nodes: flow.nodes.map((node) => {
      const wire = getWireMetadata(node.data, 'xyflow.node');
      const mapped: any = getXYNode(node, wire, getLegacy(node.data, 'node'));
      if (wire) mapped.__visibleData = wire.mapped.__visibleData;
      const restored = getRestoredRecord(mapped, wire);
      delete restored.__visibleData;
      return restored;
    }),
    edges: flow.edges.map((edge, index) => {
      const wire = getWireMetadata(edge.data, 'xyflow.edge');
      const mapped: any = getXYEdge(edge, index, wire, getLegacy(edge.data, 'edge'));
      if (wire) mapped.__visibleData = wire.mapped.__visibleData;
      const restored = getRestoredRecord(mapped, wire);
      delete restored.__visibleData;
      return restored;
    }),
  };
  const order = flow.data?.__statelyai as any;
  if (metadata && Array.isArray(order.nodeOrder) && isJSONEqual(flow.nodes.map((node) => node.id), order.nativeNodeOrder)) {
    const indices = new Map(order.nodeOrder.map((id: string, index: number) => [id, index]));
    graph.nodes.sort((a, b) => Number(indices.get(a.id)) - Number(indices.get(b.id)));
  }
  if (!metadata) graph.data = createNativeCarrier(graph.data, 'xyflow', flow, graph);
  return graph;
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


/** Exact native source preservation, with strict verified field edits. */
export const xyflowDocumentConverter = createGraphDocumentConverter({
  format: 'xyflow',
  codec: { from: (source: XYFlow) => fromXYFlow(source, { metadata: 'native' }), to: (graph: VisualGraph) => toXYFlow(graph, { nativeCarrier: false }) },
  project: (source: XYFlow) => ({ graph: getStructuredDocumentProjectionGraph(fromXYFlow(source, { metadata: 'native' }), source, 'xyflow') }),
  patch: (context) => getStructuredDocumentPatch(context, 'xyflow'),
});
