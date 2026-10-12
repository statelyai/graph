import type { Graph } from '../../types';
import { createFormatConverter } from '../converter';
import { createGraphDocumentConverter } from '../document';
import { createNativeCarrier, getNativeCarrier, getCarrierData, getClonedJSON, getNativeDocumentGraph, type FormatImportOptions, type FormatExportOptions } from '../preservation';
import { getAttributeRecord, getNativeAttributes, getUpdatedAttributes, getNodeBase, getEdgeBase, getRootBase, getValidatedGraph, getAttributeDocumentPatch, getRecordWithField } from '../structured-json';

export interface GraphologyJSON {
  options: { type?: 'directed' | 'undirected' | 'mixed'; multi?: boolean; allowSelfLoops?: boolean };
  attributes: Record<string, any>;
  nodes: Array<{ key: string; attributes?: Record<string, any> }>;
  edges: Array<{ key?: string; source: string; target: string; attributes?: Record<string, any>; undirected?: boolean }>;
}
export interface GraphologyImportOptions extends FormatImportOptions {}
export interface GraphologyExportOptions extends FormatExportOptions {}

function getValidatedSource(source: GraphologyJSON): void {
  if (!source || !Array.isArray(source.nodes) || !Array.isArray(source.edges) || !source.options || !source.attributes || typeof source.attributes !== 'object' || Array.isArray(source.attributes)) throw new Error('Graphology: expected serialized options, attributes, nodes and edges');
  const type = source.options.type ?? 'mixed';
  if (!['directed', 'undirected', 'mixed'].includes(type)) throw new Error('Graphology: invalid type');
  if (['multi', 'allowSelfLoops'].some((key) => Object.hasOwn(source.options, key) && typeof (source.options as any)[key] !== 'boolean')) throw new Error('Graphology: invalid native boolean option');
  const nodes = new Set<string>(), edges = new Set<string>(), pairs = new Set<string>();
  for (const node of source.nodes) {
    if (typeof node.key !== 'string' || nodes.has(node.key)) throw new Error('Graphology: node keys must be unique strings');
    if (Object.hasOwn(Object.prototype, node.key)) throw new Error(`Graphology: unsafe native adjacency key ${node.key}`);
    if (node.attributes !== undefined && (!node.attributes || typeof node.attributes !== 'object' || Array.isArray(node.attributes))) throw new Error('Graphology: node attributes must be an object');
    nodes.add(node.key);
  }
  for (const edge of source.edges) {
    if (!nodes.has(edge.source) || !nodes.has(edge.target)) throw new Error('Graphology: missing edge endpoint');
    if (edge.key !== undefined && (typeof edge.key !== 'string' || edges.has(edge.key))) throw new Error('Graphology: duplicate or invalid edge key');
    if (edge.key !== undefined) edges.add(edge.key);
    if (edge.attributes !== undefined && (!edge.attributes || typeof edge.attributes !== 'object' || Array.isArray(edge.attributes))) throw new Error('Graphology: edge attributes must be an object');
    if (Object.hasOwn(edge, 'undirected') && typeof edge.undirected !== 'boolean') throw new Error('Graphology: invalid edge direction');
    const undirected = edge.undirected ?? type === 'undirected';
    if ((type === 'directed' && undirected) || (type === 'undirected' && !undirected)) throw new Error('Graphology: edge direction conflicts with native type');
    if (source.options.allowSelfLoops === false && edge.source === edge.target) throw new Error('Graphology: native self-loops disabled');
    const ends = undirected ? [edge.source, edge.target].sort() : [edge.source, edge.target];
    const pair = JSON.stringify([undirected, ...ends]);
    if (!source.options.multi && pairs.has(pair)) throw new Error('Graphology: duplicate edge in simple graph');
    pairs.add(pair);
  }
}

function getGraphologyProjection(source: GraphologyJSON, native: boolean): Graph {
  const type = source.options.type ?? 'mixed';
  const mode = type === 'undirected' ? 'undirected' : 'directed';
  const keys = new Set(source.edges.flatMap((edge) => edge.key === undefined ? [] : [edge.key]));
  const ids = source.edges.map((edge, index) => {
    if (edge.key !== undefined) return edge.key;
    let id = `e${index}`, suffix = 0;
    while (keys.has(id)) id = `e${index}__statelyai${++suffix}`;
    keys.add(id); return id;
  });
  const graph = { ...getAttributeRecord(source.attributes, getRootBase(mode), 'graph', 'graphology', native),
    nodes: source.nodes.map((node) => getAttributeRecord(node.attributes, getNodeBase(node.key), 'node', 'graphology', native)),
    edges: source.edges.map((edge, index) => getAttributeRecord(edge.attributes, getEdgeBase(ids[index], edge.source, edge.target, (edge.undirected ?? type === 'undirected') ? 'undirected' : 'directed'), 'edge', 'graphology', native)) } as Graph;
  getValidatedGraph(graph, 'Graphology');
  return graph;
}

/** Import native mixed-mode JSON; unsafe native IDs and malformed topology throw. */
export function fromGraphologyJSON(source: GraphologyJSON, options: GraphologyImportOptions = {}): Graph {
  getValidatedSource(source);
  const graph = getGraphologyProjection(source, options.metadata === 'native');
  graph.data = createNativeCarrier(graph.data, 'graphology', source, graph);
  return graph;
}

function toRawGraphologyJSON(graph: Graph): GraphologyJSON {
  getValidatedGraph(graph, 'Graphology');
  const modes = new Set(graph.edges.map((edge) => edge.mode ?? graph.mode));
  if (!modes.size) modes.add(graph.mode);
  if (modes.has('bidirectional')) throw new Error('Graphology: bidirectional edges have no single native representation');
  const type = modes.size > 1 ? 'mixed' : [...modes][0] as 'directed' | 'undirected';
  const { nodes, edges, ...root } = graph;
  const source: GraphologyJSON = { options: { type, multi: true, allowSelfLoops: true }, attributes: getNativeAttributes(root, 'graph', 'graphology', getRootBase(type === 'undirected' ? 'undirected' : 'directed')),
    nodes: nodes.map((node) => ({ key: node.id, attributes: getNativeAttributes(node, 'node', 'graphology', getNodeBase(node.id)) })),
    edges: edges.map((edge) => ({ key: edge.id, source: edge.sourceId, target: edge.targetId, undirected: (edge.mode ?? graph.mode) === 'undirected', attributes: getNativeAttributes(edge, 'edge', 'graphology', getEdgeBase(edge.id, edge.sourceId, edge.targetId, (edge.mode ?? graph.mode) as 'directed' | 'undirected')) })) };
  getValidatedSource(source);
  return source;
}

/** Export native directed/undirected/mixed topology; Graph-only state uses explicit metadata. */
export function toGraphologyJSON(graph: Graph, options: GraphologyExportOptions = {}): GraphologyJSON {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, 'graphology');
  if (!carrier) return toRawGraphologyJSON(graph);
  const current = { ...graph, data: getCarrierData(graph.data, 'graphology') };
  const before = carrier.baseline as Graph;
  const source = getClonedJSON(carrier.native) as GraphologyJSON;
  const raw = toRawGraphologyJSON(current);
  const nodes = new Map(before.nodes.map((node, index) => [node.id, { node, native: source.nodes[index] }]));
  const edges = new Map(before.edges.map((edge, index) => [edge.id, { edge, native: source.edges[index] }]));
  source.nodes = current.nodes.map((node, index) => {
    const old = nodes.get(node.id);
    return old ? getRecordWithField(old.native, 'attributes', getUpdatedAttributes(old.native.attributes, old.node, node, 'node', 'graphology', getNodeBase(node.id))) : raw.nodes[index];
  });
  source.edges = current.edges.map((edge, index) => {
    const old = edges.get(edge.id);
    return old ? { ...getRecordWithField(old.native, 'attributes', getUpdatedAttributes(old.native.attributes, old.edge, edge, 'edge', 'graphology', getEdgeBase(edge.id, edge.sourceId, edge.targetId, (edge.mode ?? current.mode) as 'directed' | 'undirected'))), source: edge.sourceId, target: edge.targetId, ...((edge.mode ?? current.mode) !== (old.edge.mode ?? before.mode) && { undirected: (edge.mode ?? current.mode) === 'undirected' }) } : raw.edges[index];
  });
  const { nodes: _beforeNodes, edges: _beforeEdges, ...beforeRoot } = before;
  const { nodes: _nodes, edges: _edges, ...root } = current;
  source.attributes = getUpdatedAttributes(source.attributes, beforeRoot, root, 'graph', 'graphology', getRootBase(current.mode === 'undirected' ? 'undirected' : 'directed')) ?? {};
  if (source.options.type !== 'mixed') {
    const nativeModes = new Set(current.edges.map((edge) => edge.mode ?? current.mode));
    const type = nativeModes.size > 1 ? 'mixed' : (nativeModes.size ? [...nativeModes][0] : current.mode);
    if ((source.options.type ?? 'mixed') !== type) source.options.type = type as GraphologyJSON['options']['type'];
  }
  getValidatedSource(source);
  return source;
}

export const graphologyConverter = createFormatConverter(toGraphologyJSON, fromGraphologyJSON);
/** Exact JSON source retention; unsupported structural edits reject. */
export const graphologyDocumentConverter = createGraphDocumentConverter({
  format: 'graphology', codec: { from: fromGraphologyJSON, to: (graph) => toGraphologyJSON(graph, { nativeCarrier: false }) },
  project: (source: GraphologyJSON) => ({ graph: getNativeDocumentGraph(fromGraphologyJSON(source), 'graphology', source) }),
  patch: (context) => getAttributeDocumentPatch(context, 'graphology', (graph) => toGraphologyJSON({ ...graph, data: createNativeCarrier(graph.data, 'graphology', context.source, context.sourceGraph) })),
});
