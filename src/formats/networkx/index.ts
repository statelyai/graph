import type { Graph } from '../../types';
import { createFormatConverter } from '../converter';
import { createGraphDocumentConverter } from '../document';
import { createNativeCarrier, getNativeCarrier, getCarrierData, getClonedJSON, getNativeDocumentGraph, type FormatImportOptions, type FormatExportOptions } from '../preservation';
import { getAttributeRecord, getNativeAttributes, getUpdatedAttributes, getNodeBase, getEdgeBase, getRootBase, getValidatedGraph, getUniformMode, getAttributeDocumentPatch, getNativeMetadata, getRebasedAttributes } from '../structured-json';

export type NetworkXID = string | number | boolean;
export interface NetworkXNodeLinkJSON {
  directed: boolean;
  multigraph: boolean;
  graph: Record<string, any>;
  nodes: Array<{ id: NetworkXID; [attribute: string]: any }>;
  edges?: Array<{ source: NetworkXID; target: NetworkXID; key?: NetworkXID; [attribute: string]: any }>;
  links?: Array<{ source: NetworkXID; target: NetworkXID; key?: NetworkXID; [attribute: string]: any }>;
}
export interface NetworkXImportOptions extends FormatImportOptions {}
export interface NetworkXExportOptions extends FormatExportOptions { edgeKey?: 'edges' | 'links' }

/** Python numeric/bool equality is part of native identity; strings remain distinct. */
function getIdentity(id: unknown): string {
  if (typeof id === 'string') return JSON.stringify(['string', id]);
  if (typeof id === 'boolean') return JSON.stringify(['number', Number(id)]);
  if (typeof id === 'number' && Number.isFinite(id)) return JSON.stringify(['number', id]);
  throw new Error('NetworkX: IDs and multigraph keys must be finite numbers, booleans or strings; null/tuple/object IDs are unsupported');
}
function getEdges(source: NetworkXNodeLinkJSON): NonNullable<NetworkXNodeLinkJSON['edges']> {
  if (Object.hasOwn(source, 'edges') && Object.hasOwn(source, 'links')) throw new Error('NetworkX: ambiguous edges and links collections');
  const edges = source.edges ?? source.links;
  if (!Array.isArray(edges)) throw new Error('NetworkX: expected an edges or links array');
  return edges;
}
function getAttributes(record: Record<string, any>, keys: string[]): Record<string, any> {
  return Object.fromEntries(Object.entries(record).filter(([key]) => !keys.includes(key)));
}
function getValidatedSource(source: NetworkXNodeLinkJSON): Array<{ identity: string; key?: NetworkXID }> {
  if (!source || !Array.isArray(source.nodes) || !source.graph || typeof source.graph !== 'object' || Array.isArray(source.graph) || typeof source.directed !== 'boolean' || typeof source.multigraph !== 'boolean') throw new Error('NetworkX: expected native directed/multigraph flags, graph attributes and nodes');
  const nodes = new Set<string>();
  for (const node of source.nodes) {
    const identity = getIdentity(node.id);
    if (nodes.has(identity)) throw new Error('NetworkX: duplicate Python-equivalent node IDs');
    nodes.add(identity);
  }
  const pairs = new Map<string, Set<string>>();
  return getEdges(source).map((edge) => {
    const endpoints = [getIdentity(edge.source), getIdentity(edge.target)];
    if (endpoints.some((id) => !nodes.has(id))) throw new Error('NetworkX: missing edge endpoint');
    if (!source.directed) endpoints.sort();
    const pair = JSON.stringify(endpoints);
    const keys = pairs.get(pair) ?? new Set<string>();
    let key = edge.key;
    if (source.multigraph && key === undefined) {
      let generated = keys.size;
      while (keys.has(getIdentity(generated))) generated++;
      key = generated;
    }
    const identity = source.multigraph ? getIdentity(key) : 'simple';
    if (keys.has(identity)) throw new Error('NetworkX: duplicate native edge tuple/key');
    keys.add(identity); pairs.set(pair, keys);
    return { identity: JSON.stringify([pair, identity]), ...(source.multigraph && { key }) };
  });
}

/** Import the JSON scalar-ID profile without conflating numeric and string identities. */
export function fromNetworkXNodeLink(source: NetworkXNodeLinkJSON, options: NetworkXImportOptions = {}): Graph {
  const identities = getValidatedSource(source);
  const mode = source.directed ? 'directed' : 'undirected';
  const nodes = source.nodes.map((node) => getAttributeRecord(getAttributes(node, ['id']), getNodeBase(`networkx:${getIdentity(node.id)}`), 'node', 'networkx', options.metadata === 'native'));
  const ids = new Map(source.nodes.map((node, index) => [getIdentity(node.id), nodes[index].id]));
  const graph: Graph = { ...getAttributeRecord(source.graph, getRootBase(mode), 'graph', 'networkx', options.metadata === 'native'), nodes,
    edges: getEdges(source).map((edge, index) => getAttributeRecord(getAttributes(edge, source.multigraph ? ['source', 'target', 'key'] : ['source', 'target']), getEdgeBase(`networkx:${identities[index].identity}`, ids.get(getIdentity(edge.source))!, ids.get(getIdentity(edge.target))!), 'edge', 'networkx', options.metadata === 'native')) };
  const rootMetadata = options.metadata === 'native' ? undefined : getNativeMetadata(source.graph, 'networkx', 'graph');
  if (rootMetadata && rootMetadata.mapped.mode !== mode) for (const edge of graph.edges) delete edge.mode;
  getValidatedGraph(graph, 'NetworkX');
  graph.data = createNativeCarrier(graph.data, 'networkx', source, graph);
  return graph;
}

function toRawNetworkXNodeLink(graph: Graph, edgeKey: 'edges' | 'links'): NetworkXNodeLinkJSON {
  getValidatedGraph(graph, 'NetworkX');
  const mode = getUniformMode(graph, 'NetworkX');
  const { nodes, edges, ...root } = graph;
  const source: NetworkXNodeLinkJSON = { directed: mode === 'directed', multigraph: true, graph: getNativeAttributes(root, 'graph', 'networkx', getRootBase(mode)),
    nodes: nodes.map((node) => ({ ...getNativeAttributes(node, 'node', 'networkx', getNodeBase(`networkx:${getIdentity(node.id)}`)), id: node.id })) };
  source[edgeKey] = edges.map((edge) => {
    const endpoints = [getIdentity(edge.sourceId), getIdentity(edge.targetId)];
    if (mode === 'undirected') endpoints.sort();
    const identity = JSON.stringify([JSON.stringify(endpoints), getIdentity(edge.id)]);
    return { ...getNativeAttributes(edge, 'edge', 'networkx', getEdgeBase(`networkx:${identity}`, edge.sourceId, edge.targetId)), source: edge.sourceId, target: edge.targetId, key: edge.id };
  });
  getValidatedSource(source); return source;
}

/** Current `edges` by default; opt into legacy `links`. Mixed/bidirectional modes throw. */
export function toNetworkXNodeLink(graph: Graph, options: NetworkXExportOptions = {}): NetworkXNodeLinkJSON {
  const edgeKey = options.edgeKey ?? 'edges';
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, 'networkx');
  if (!carrier) return toRawNetworkXNodeLink(graph, edgeKey);
  const current = { ...graph, data: getCarrierData(graph.data, 'networkx') };
  const before = carrier.baseline as Graph;
  const source = getClonedJSON(carrier.native) as NetworkXNodeLinkJSON;
  const sourceEdges = getEdges(source);
  const sourceIdentities = getValidatedSource(source);
  const raw = toRawNetworkXNodeLink(current, edgeKey);
  const nodes = new Map(before.nodes.map((node, index) => [node.id, { node, native: source.nodes[index] }]));
  const nativeIDs = new Map(current.nodes.map((node) => [node.id, nodes.get(node.id)?.native.id ?? node.id]));
  const edges = new Map(before.edges.map((edge, index) => [edge.id, { edge, native: sourceEdges[index], index }]));
  source.nodes = current.nodes.map((node, index) => {
    const old = nodes.get(node.id);
    return old ? { ...getUpdatedAttributes(getAttributes(old.native, ['id']), old.node, node, 'node', 'networkx', getNodeBase(`networkx:${getIdentity(old.native.id)}`)), id: old.native.id } : raw.nodes[index];
  });
  const updated = current.edges.map((edge, index) => {
    const old = edges.get(edge.id);
    if (!old) {
      const record = { ...raw[edgeKey]![index], source: nativeIDs.get(edge.sourceId)!, target: nativeIDs.get(edge.targetId)! };
      if (!source.multigraph) delete record.key;
      return record;
    }
    const attrs = getUpdatedAttributes(getAttributes(old.native, source.multigraph ? ['source', 'target', 'key'] : ['source', 'target']), old.edge, edge, 'edge', 'networkx', getEdgeBase(`networkx:${sourceIdentities[old.index].identity}`, edge.sourceId, edge.targetId));
    return { ...attrs, source: nativeIDs.get(edge.sourceId)!, target: nativeIDs.get(edge.targetId)!, ...(source.multigraph && (Object.hasOwn(old.native, 'key') || index !== old.index) && { key: Object.hasOwn(old.native, 'key') ? old.native.key : sourceIdentities[old.index].key }) };
  });
  delete source.edges; delete source.links; source[edgeKey] = updated;
  const { nodes: _beforeNodes, edges: _beforeEdges, ...beforeRoot } = before;
  const { nodes: _nodes, edges: _edges, ...root } = current;
  source.graph = getUpdatedAttributes(source.graph, beforeRoot, root, 'graph', 'networkx', getRootBase(getUniformMode(current, 'NetworkX'))) ?? {};
  source.directed = getUniformMode(current, 'NetworkX') === 'directed';
  const finalIdentities = getValidatedSource(source);
  source[edgeKey] = source[edgeKey]!.map((record, index) => ({
    ...getRebasedAttributes(getAttributes(record, source.multigraph ? ['source', 'target', 'key'] : ['source', 'target']), current.edges[index], 'edge', 'networkx', getEdgeBase(`networkx:${finalIdentities[index].identity}`, current.edges[index].sourceId, current.edges[index].targetId)),
    source: record.source, target: record.target, ...(source.multigraph && Object.hasOwn(record, 'key') && { key: record.key }),
  }));
  return source;
}

export const networkxConverter = createFormatConverter(toNetworkXNodeLink, fromNetworkXNodeLink);
/** Exact original scalar-ID JSON, with strict known-field edits by verified identity. */
export const networkxDocumentConverter = createGraphDocumentConverter({
  format: 'networkx', codec: { from: fromNetworkXNodeLink, to: (graph) => toNetworkXNodeLink(graph, { nativeCarrier: false }) },
  project: (source: NetworkXNodeLinkJSON) => ({ graph: getNativeDocumentGraph(fromNetworkXNodeLink(source), 'networkx', source) }),
  patch: (context) => getAttributeDocumentPatch(context, 'networkx', (graph) => toNetworkXNodeLink({ ...graph, data: createNativeCarrier(graph.data, 'networkx', context.source, context.sourceGraph) }, { edgeKey: context.source.links ? 'links' : 'edges' })),
});
