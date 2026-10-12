import type { Graph } from '../../types';
import { createFormatConverter } from '../converter';
import { createGraphDocumentConverter } from '../document';
import { createNativeCarrier, getNativeCarrier, getCarrierData, getClonedJSON, getNativeDocumentGraph, isJSONEqual, type FormatImportOptions, type FormatExportOptions } from '../preservation';
import { getAttributeRecord, getNativeAttributes, getUpdatedAttributes, getNodeBase, getEdgeBase, getRootBase, getValidatedGraph, getUniformMode, getAttributeDocumentPatch, getRecordWithField, getNativeMetadata, getRebasedAttributes } from '../structured-json';

export interface GraphlibJSON {
  options: { directed?: boolean; multigraph?: boolean; compound?: boolean };
  value?: any;
  nodes: Array<{ v: string; value?: any; parent?: string }>;
  edges: Array<{ v: string; w: string; name?: string; value?: any }>;
}
export interface GraphlibImportOptions extends FormatImportOptions {}
export interface GraphlibExportOptions extends FormatExportOptions {}

function getGraphlibRecord(value: any, base: Record<string, any>, kind: 'graph' | 'node' | 'edge', native: boolean): any {
  return value && typeof value === 'object' && !Array.isArray(value) ? getAttributeRecord(value, base, kind, 'graphlib', native) : { ...base, data: getClonedJSON(value) };
}
function getUpdatedValue(value: any, before: any, current: any, kind: 'graph' | 'node' | 'edge', base: any): any {
  if (isJSONEqual(before, current)) return getClonedJSON(value);
  if (value && typeof value === 'object' && !Array.isArray(value)) return getUpdatedAttributes(value, before, current, kind, 'graphlib', base);
  const { data: _beforeData, ...beforeFields } = before;
  const { data: _data, ...fields } = current;
  if (isJSONEqual(beforeFields, fields)) return getClonedJSON(current.data);
  throw new Error('Graphlib: scalar/array native values cannot receive separate field or identity edits');
}
function getValidatedSource(source: GraphlibJSON): void {
  if (!source || !Array.isArray(source.nodes) || !Array.isArray(source.edges) || !source.options || ['directed', 'multigraph', 'compound'].some((key) => Object.hasOwn(source.options, key) && typeof (source.options as any)[key] !== 'boolean')) throw new Error('Graphlib: expected native options, nodes and edges');
  const nodes = new Map<string, string | undefined>(), edges = new Set<string>();
  for (const node of source.nodes) {
    if (typeof node.v !== 'string' || nodes.has(node.v)) throw new Error('Graphlib: node IDs must be unique strings');
    if (source.options.compound && node.v === '__proto__') throw new Error('Graphlib: unsafe native compound ID __proto__');
    if (node.parent !== undefined && (!source.options.compound || typeof node.parent !== 'string')) throw new Error('Graphlib: invalid native parent');
    nodes.set(node.v, node.parent);
  }
  const completed = new Set<string>();
  for (const id of nodes.keys()) {
    const visiting = new Set<string>();
    let current: string | undefined = id;
    while (current !== undefined && !completed.has(current)) {
      if (!nodes.has(current) || visiting.has(current)) throw new Error('Graphlib: missing parent or cyclic native hierarchy');
      visiting.add(current); current = nodes.get(current);
    }
    for (const parent of visiting) completed.add(parent);
  }
  for (const edge of source.edges) {
    if (!nodes.has(edge.v) || !nodes.has(edge.w)) throw new Error('Graphlib: missing edge endpoint');
    if (edge.name !== undefined && (typeof edge.name !== 'string' || !source.options.multigraph)) throw new Error('Graphlib: named edges require a multigraph');
    const ends = (source.options.directed ?? true) ? [edge.v, edge.w] : [edge.v, edge.w].sort();
    const identity = JSON.stringify([...ends, edge.name ?? null]);
    if (edges.has(identity)) throw new Error('Graphlib: duplicate native edge tuple');
    edges.add(identity);
  }
}

/** Import Graphlib serialization; arbitrary scalar/array/null labels remain Graph data. */
export function fromGraphlibJSON(source: GraphlibJSON, options: GraphlibImportOptions = {}): Graph {
  getValidatedSource(source);
  const mode = (source.options.directed ?? true) ? 'directed' : 'undirected';
  const graph: Graph = { ...getGraphlibRecord(source.value, getRootBase(mode), 'graph', options.metadata === 'native'),
    nodes: source.nodes.map((node) => {
      const record = getGraphlibRecord(node.value, getNodeBase(node.v), 'node', options.metadata === 'native');
      const metadata = options.metadata === 'native' ? undefined : getNativeMetadata(node.value, 'graphlib', 'node');
      if (!metadata || (node.parent ?? null) !== (metadata.mapped.parentId ?? null)) record.parentId = node.parent ?? null;
      return record;
    }),
    edges: source.edges.map((edge) => getGraphlibRecord(edge.value, getEdgeBase(JSON.stringify([edge.v, edge.w, edge.name ?? null]), edge.v, edge.w), 'edge', options.metadata === 'native')) };
  const rootMetadata = options.metadata === 'native' ? undefined : getNativeMetadata(source.value, 'graphlib', 'graph');
  if (rootMetadata && rootMetadata.mapped.mode !== mode) for (const edge of graph.edges) delete edge.mode;
  getValidatedGraph(graph, 'Graphlib');
  graph.data = createNativeCarrier(graph.data, 'graphlib', source, graph);
  return graph;
}

function toRawGraphlibJSON(graph: Graph): GraphlibJSON {
  getValidatedGraph(graph, 'Graphlib');
  const mode = getUniformMode(graph, 'Graphlib');
  const { nodes, edges, ...root } = graph;
  const source: GraphlibJSON = { options: { directed: mode === 'directed', multigraph: true, compound: nodes.some((node) => node.parentId != null) },
    value: getNativeAttributes(root, 'graph', 'graphlib', getRootBase(mode)),
    nodes: nodes.map((node) => ({ v: node.id, value: getNativeAttributes(node, 'node', 'graphlib', getNodeBase(node.id)), ...(node.parentId != null && { parent: node.parentId }) })),
    edges: edges.map((edge) => ({ v: edge.sourceId, w: edge.targetId, name: edge.id, value: getNativeAttributes(edge, 'edge', 'graphlib', getEdgeBase(JSON.stringify([edge.sourceId, edge.targetId, edge.id]), edge.sourceId, edge.targetId)) })) };
  getValidatedSource(source); return source;
}

/** Native topology uses one global mode; genuine mixed/bidirectional graphs throw. */
export function toGraphlibJSON(graph: Graph, options: GraphlibExportOptions = {}): GraphlibJSON {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, 'graphlib');
  if (!carrier) return toRawGraphlibJSON(graph);
  const current = { ...graph, data: getCarrierData(graph.data, 'graphlib') };
  const before = carrier.baseline as Graph;
  const source = getClonedJSON(carrier.native) as GraphlibJSON;
  const raw = toRawGraphlibJSON(current);
  const nodes = new Map(before.nodes.map((node, index) => [node.id, { node, native: source.nodes[index] }]));
  const edges = new Map(before.edges.map((edge, index) => [edge.id, { edge, native: source.edges[index] }]));
  source.nodes = current.nodes.map((node, index) => {
    const old = nodes.get(node.id);
    if (!old) return raw.nodes[index];
    const result = getRecordWithField(old.native, 'value', getUpdatedValue(old.native.value, old.node, node, 'node', getNodeBase(node.id)));
    if (node.parentId !== old.node.parentId) { if (node.parentId === null) delete result.parent; else result.parent = node.parentId; }
    return result;
  });
  source.edges = current.edges.map((edge, index) => {
    const old = edges.get(edge.id);
    const record = old ? { ...getRecordWithField(old.native, 'value', getUpdatedValue(old.native.value, old.edge, edge, 'edge', getEdgeBase(edge.id, edge.sourceId, edge.targetId))), v: edge.sourceId, w: edge.targetId } : getClonedJSON(raw.edges[index]);
    if (!source.options.multigraph) delete record.name;
    if (record.value && typeof record.value === 'object' && !Array.isArray(record.value)) record.value = getRebasedAttributes(record.value, edge, 'edge', 'graphlib', getEdgeBase(JSON.stringify([record.v, record.w, record.name ?? null]), edge.sourceId, edge.targetId));
    return record;
  });
  const { nodes: _beforeNodes, edges: _beforeEdges, ...beforeRoot } = before;
  const { nodes: _nodes, edges: _edges, ...root } = current;
  const result = getRecordWithField(source, 'value', getUpdatedValue(source.value, beforeRoot, root, 'graph', getRootBase(getUniformMode(current, 'Graphlib'))));
  if (getUniformMode(current, 'Graphlib') !== getUniformMode(before, 'Graphlib')) result.options.directed = getUniformMode(current, 'Graphlib') === 'directed';
  if (current.nodes.some((node) => node.parentId != null)) result.options.compound = true;
  getValidatedSource(result); return result;
}

export const graphlibConverter = createFormatConverter(toGraphlibJSON, fromGraphlibJSON);
/** Exact original values/source shape, with bounded edits that never replace opaque values. */
export const graphlibDocumentConverter = createGraphDocumentConverter({
  format: 'graphlib', codec: { from: fromGraphlibJSON, to: (graph) => toGraphlibJSON(graph, { nativeCarrier: false }) },
  project: (source: GraphlibJSON) => ({ graph: getNativeDocumentGraph(fromGraphlibJSON(source), 'graphlib', source) }),
  patch: (context) => getAttributeDocumentPatch(context, 'graphlib', (graph) => toGraphlibJSON({ ...graph, data: createNativeCarrier(graph.data, 'graphlib', context.source, context.sourceGraph) })),
});
