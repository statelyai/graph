import type { FormatExportOptions } from '../preservation';
import { createGraphDocumentConverter } from '../document';
import { getStructuredDocumentProjectionGraph, getStructuredDocumentPatch } from '../preservation';
import type { Graph, GraphFormatConverter } from '../../types';
import { createMetadata, createNativeCarrier, getCarrierData, getClonedJSON, getMetadata,
  getNativeCarrier, getRestoredRecord, getMergedNative, getEditedData, isJSONEqual, type FormatImportOptions } from '../preservation';

/** JGF v1 node; ID-keyed JGF v2 nodes omit the id field. */
export interface JGFNode { id: string; label?: string; metadata?: Record<string, any> }
export interface JGFEdge { id?: string; source: string; target: string; label?: string;
  directed?: boolean | null; relation?: string; metadata?: Record<string, any> }
export interface JGFGraph {
  graph: { id: string; label?: string; type?: string; directed?: boolean | null;
    metadata?: Record<string, any>; nodes: JGFNode[]; edges: JGFEdge[] };
}
/** Standards-valid JGF v1 omits the hybrid graph id. */
export interface JGFGraphV1 {
  graph: Omit<JGFGraph['graph'], 'id' | 'metadata' | 'nodes' | 'edges'> & {
    id?: never; metadata?: Record<string, any> | null; nodes: JGFNativeNode[]; edges: JGFNativeEdge[];
  };
}
export type JGFEdgeV2 = Omit<JGFEdge, 'directed'> & { directed?: boolean };
export interface JGFGraphV2 {
  graph: { id?: string; label?: string; type?: string; directed?: boolean;
    metadata?: Record<string, any>; nodes: Record<string, Omit<JGFNode, 'id'>>; edges: JGFEdgeV2[] };
}
/** Native v1 permits nullable metadata; explicit v2 output remains nonnullable. */
export type JGFNativeNode = Omit<JGFNode, 'metadata'> & { metadata?: Record<string, any> | null };
export type JGFNativeEdge = Omit<JGFEdge, 'metadata'> & { metadata?: Record<string, any> | null };
/** JGF v2 hyperedge documents are retained without a binary projection. */
export type JGFHyperedge = { id?: string; label?: string; relation?: string; metadata?: Record<string, any> } &
  ({ source: string[]; target: string[] } | { nodes: string[] });
export interface JGFNativeDocument {
  graph: { id?: string; label?: string; type?: string; directed?: boolean | null;
    metadata?: Record<string, any> | null; nodes?: JGFNativeNode[] | Record<string, Omit<JGFNode, 'id'>> | null;
    edges?: JGFNativeEdge[] | null; hyperedges?: JGFHyperedge[] };
}
export type JGFInput = JGFGraph | JGFGraphV1 | JGFGraphV2 | JGFNativeDocument;
export interface JGFExportOptions extends FormatExportOptions { version?: 1 | 2 }
export interface JGFImportOptions extends FormatImportOptions {}

function toMetadataObject(value: any): Record<string, any> {
  return value && typeof value === 'object' && !Array.isArray(value) ? getClonedJSON(value) : {};
}
function getEditableMetadata(metadata: any, relation?: string): Record<string, any> {
  const result = { ...metadata };
  delete result.__statelyai;
  if (relation !== undefined) result.relation = relation;
  return result;
}

const NODE_FIELDS = ['parentId', 'initialNodeId', 'x', 'y', 'width', 'height', 'shape', 'color', 'style', 'ports'];
const EDGE_FIELDS = ['mode', 'weight', 'points', 'routing', 'x', 'y', 'width', 'height', 'color', 'style', 'sourcePort', 'targetPort'];
function getFields(value: any, fields: string[]): any {
  return Object.fromEntries(fields.filter((key) => value && Object.hasOwn(value, key)).map((key) => [key, value[key]]));
}
function getJGFRoot(input: JGFInput, legacy: boolean): Omit<Graph, 'nodes' | 'edges'> {
  const graph = input.graph;
  return { id: graph.id ?? '', mode: legacy ? graph.metadata?.mode ?? (graph.directed === false ? 'undirected' : 'directed') : graph.directed === false ? 'undirected' : 'directed',
    initialNodeId: legacy ? graph.metadata?.initialNodeId ?? null : null,
    data: legacy ? graph.metadata?.data : graph.metadata,
    ...(legacy && getFields(graph.metadata, ['direction', 'style'])) };
}
function getJGFNode(node: JGFNativeNode, legacy: boolean): Graph['nodes'][number] {
  return { type: 'node', id: node.id, parentId: legacy ? node.metadata?.parentId ?? null : null,
    initialNodeId: legacy ? node.metadata?.initialNodeId ?? null : null,
    label: node.label ?? '', data: legacy ? node.metadata?.data : node.metadata,
    ...(legacy && getFields(node.metadata, NODE_FIELDS)) };
}
function getJGFEdge(edge: JGFNativeEdge, index: number, legacy: boolean): Graph['edges'][number] {
  return { type: 'edge', id: edge.id ?? `e${index}`, sourceId: edge.source, targetId: edge.target, label: edge.label ?? '',
    data: legacy ? edge.metadata?.data : { ...(edge.metadata ?? {}), ...(Object.hasOwn(edge, 'relation') && { relation: edge.relation }) },
    ...(legacy && getFields(edge.metadata, EDGE_FIELDS)),
    ...(edge.directed != null && { mode: edge.directed ? 'directed' : 'undirected' }) };
}

function getNormalizedJGF(native: JGFInput, baseline: Graph, version: 1 | 2 | 'legacy'): JGFInput {
  const before = toRawJGF(baseline, version === 'legacy' ? {} : { version });
  const nativeVersion = Array.isArray(native.graph.nodes) || native.graph.nodes == null ? native.graph.id !== undefined ? 'legacy' : 1 : 2;
  const sourceRecords = Array.isArray(native.graph.nodes) ? native.graph.nodes : Object.values(native.graph.nodes ?? {});
  const nullableMetadata = native.graph.metadata === null || sourceRecords.some((node) => node.metadata === null) || (native.graph.edges ?? []).some((edge) => edge.metadata === null);
  const nullableDirection = native.graph.directed === null || (native.graph.edges ?? []).some((edge) => edge.directed === null);
  if (nativeVersion === version && native.graph.nodes != null && Array.isArray(native.graph.edges) &&
      (version === 1 || !nullableMetadata && (version !== 2 || !nullableDirection))) {
    const unchanged = getClonedJSON(native);
    if (version === 2) unchanged.graph.directed = before.graph.directed === true;
    return unchanged;
  }
  const result = getClonedJSON(native);
  const sourceNodes: JGFNativeNode[] = Array.isArray(result.graph.nodes) ? result.graph.nodes :
    Object.entries(result.graph.nodes ?? {}).map(([id, node]) => ({ ...node, id }));
  const beforeNodes: JGFNativeNode[] = Array.isArray(before.graph.nodes) ? before.graph.nodes :
    Object.entries(before.graph.nodes ?? {}).map(([id, node]) => ({ ...node, id }));
  const nodeMetadata = new Map(beforeNodes.map((node) => [node.id, node.metadata]));
  const converted = sourceNodes.map((node) => ({ ...node, metadata: { ...node.metadata, ...nodeMetadata.get(node.id) } }));
  result.graph.nodes = version !== 2 ? converted : Object.fromEntries(converted.map(({ id, ...node }) => [id, node]));
  if (version === 1) delete result.graph.id;
  else result.graph.id = baseline.id;
  if (version === 2) result.graph.directed = before.graph.directed === true;
  result.graph.metadata = { ...result.graph.metadata, ...before.graph.metadata };
  result.graph.edges = (result.graph.edges ?? []).map((edge, index) => {
    const normalized = { ...edge, metadata: { ...edge.metadata, ...before.graph.edges?.[index]?.metadata } };
    if (version === 2 && normalized.directed === null) delete normalized.directed;
    return normalized;
  });
  return result;
}

/** Preserve the legacy array/id output by default; request standards-valid v1 or v2 explicitly. */
export function toJGF(graph: Graph): JGFGraph;
export function toJGF(graph: Graph, options: JGFExportOptions & { version?: undefined }): JGFGraph;
export function toJGF(graph: Graph, options: JGFExportOptions & { version: 1 }): JGFGraphV1;
export function toJGF(graph: Graph, options: JGFExportOptions & { version: 2 }): JGFGraphV2;
export function toJGF(graph: Graph, options: JGFExportOptions): JGFInput;
export function toJGF(graph: Graph, options: JGFExportOptions = {}): JGFInput {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, 'jgf');
  if (carrier) {
    const version = options.version ?? 'legacy';
    return getMergedNative(getNormalizedJGF(carrier.native, carrier.baseline, version),
      toRawJGF(carrier.baseline, version === 'legacy' ? {} : { version }),
      toRawJGF({ ...graph, data: getCarrierData(graph.data, 'jgf') }, version === 'legacy' ? {} : { version }));
  }
  return toRawJGF(graph, options);
}

function toRawJGF(graph: Graph, options: JGFExportOptions = {}): JGFInput {
  const { nodes, edges, ...root } = graph;
  const nativeNodes: JGFNode[] = nodes.map((node) => {
    const native: JGFNode = { id: node.id, ...(typeof node.label === 'string' && { label: node.label }) };
    native.metadata = toMetadataObject(node.data);
    const mapped = getJGFNode(native, false);
    mapped.data = getEditableMetadata(native.metadata);
    native.metadata.__statelyai = createMetadata('jgf.node', node, mapped);
    return native;
  });
  const nativeEdges: JGFEdge[] = edges.map((edge, index) => {
    const native: JGFEdge = { id: edge.id, source: edge.sourceId, target: edge.targetId,
      ...(typeof edge.label === 'string' && { label: edge.label }),
      ...(edge.mode !== undefined && { directed: edge.mode !== 'undirected' }),
      ...(typeof edge.data?.relation === 'string' && { relation: edge.data.relation }) };
    native.metadata = toMetadataObject(edge.data);
    const mapped = getJGFEdge(native, index, false);
    mapped.data = getEditableMetadata(native.metadata, native.relation);
    native.metadata.__statelyai = createMetadata('jgf.edge', edge, mapped);
    return native;
  });
  const input: JGFInput = { graph: { directed: graph.mode !== 'undirected',
    ...((options.version === 2 || options.version === undefined) && { id: graph.id }),
    nodes: options.version === 2 ? Object.fromEntries(nativeNodes.map(({ id, ...node }) => [id, node])) : nativeNodes,
    edges: nativeEdges,
  } } as JGFInput;
  input.graph.metadata = toMetadataObject(graph.data);
  const mappedRoot = getJGFRoot(input, false);
  mappedRoot.data = getEditableMetadata(input.graph.metadata);
  input.graph.metadata.__statelyai = { ...createMetadata('jgf.graph', root, mappedRoot),
    nodeOrder: nodes.map((node) => node.id), nativeNodeOrder: options.version === 2 ? Object.keys(input.graph.nodes ?? {}) : nodes.map((node) => node.id) };
  return getClonedJSON(input);
}

/** Accept v1 arrays, v2 dictionaries and the former hybrid dialect. */
export function fromJGF(input: JGFInput, options: JGFImportOptions = {}): Graph {
  if (!input || typeof input !== 'object') throw new Error('JGF: expected an object');
  if (!input.graph || typeof input.graph !== 'object') throw new Error('JGF: missing "graph" property');
  const native = input.graph;
  if ('hyperedges' in native && native.hyperedges != null) {
    if (!Array.isArray(native.hyperedges)) throw new Error('JGF: "graph.hyperedges" must be an array');
    if (native.hyperedges.length) throw new Error('JGF: hyperedges cannot be represented by a binary Graph; use jgfDocumentConverter for source retention');
  }
  if (native.nodes != null && typeof native.nodes !== 'object') throw new Error('JGF: "graph.nodes" must be an array or object');
  if (native.edges != null && !Array.isArray(native.edges)) throw new Error('JGF: "graph.edges" must be an array');
  const getWireMetadata = (value: any, format: string) => options.metadata === 'native' ? undefined : getMetadata(value?.__statelyai, format);
  const metadata = getWireMetadata(native.metadata, 'jgf.graph');
  const legacy = options.metadata === 'legacy' || (options.metadata !== 'native' && !metadata && Array.isArray(native.nodes) && native.id !== undefined);
  const nodes: JGFNativeNode[] = Array.isArray(native.nodes) ? native.nodes : Object.entries(native.nodes ?? {}).map(([id, node]) => ({ ...node, id }));
  const mappedRoot = getJGFRoot(input, legacy);
  if (metadata) mappedRoot.data = getEditedData(metadata.original.data, metadata.mapped.data, getEditableMetadata(native.metadata));
  const graph: Graph = {
    ...getRestoredRecord(mappedRoot, metadata),
    nodes: nodes.map((node) => {
      const wire = getWireMetadata(node.metadata, 'jgf.node');
      const mapped = getJGFNode(node, legacy);
      if (wire) mapped.data = getEditedData(wire.original.data, wire.mapped.data, getEditableMetadata(node.metadata));
      return getRestoredRecord(mapped, wire);
    }),
    edges: (native.edges ?? []).map((edge, index) => {
      const wire = getWireMetadata(edge.metadata, 'jgf.edge');
      const mapped = getJGFEdge(edge, index, legacy);
      if (wire) mapped.data = getEditedData(wire.original.data, wire.mapped.data, getEditableMetadata(edge.metadata, edge.relation));
      return getRestoredRecord(mapped, wire);
    }),
  };
  const order = native.metadata?.__statelyai;
  if (metadata && Array.isArray(order.nodeOrder) && isJSONEqual(nodes.map((node) => node.id), order.nativeNodeOrder)) {
    const positions = new Map(order.nodeOrder.map((id: string, index: number) => [id, index]));
    graph.nodes.sort((a, b) => Number(positions.get(a.id)) - Number(positions.get(b.id)));
  }
  if (!metadata || !isJSONEqual(input, toRawJGF(graph, Array.isArray(native.nodes) || native.nodes == null ? native.id !== undefined ? {} : { version: 1 } : { version: 2 }))) {
    graph.data = createNativeCarrier(graph.data, 'jgf', input, graph);
  }
  return graph;
}

export const jgfConverter: Omit<GraphFormatConverter<JGFGraph>, 'from'> & { from: typeof fromJGF } =
  { to: toJGF, from: fromJGF };


/** Exact native source preservation, with strict verified field edits. */
export const jgfDocumentConverter = createGraphDocumentConverter({
  format: 'jgf',
  codec: { from: (source: JGFInput) => fromJGF(source, { metadata: 'native' }), to: (graph: Graph) => toJGF(graph, { nativeCarrier: false }) },
  project: (source: JGFInput) => ({ graph: getStructuredDocumentProjectionGraph(fromJGF(source, { metadata: 'native' }), source, 'jgf') }),
  patch: (context) => getStructuredDocumentPatch(context, 'jgf'),
});
