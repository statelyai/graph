import type { FormatExportOptions } from '../preservation';
import { createGraphDocumentConverter } from '../document';
import { getStructuredDocumentProjectionGraph, getStructuredDocumentPatch } from '../preservation';
import type { Graph, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import { createMetadata, createNativeCarrier, getCarrierData, getClonedJSON, getMetadata,
  getNativeCarrier, getRestoredRecord, getMergedNative, isJSONEqual, type FormatImportOptions } from '../preservation';

export interface CytoscapeNode {
  data: { id: string; parent?: string; [key: string]: any };
  position?: { x: number; y: number };
  [key: string]: any;
}
export interface CytoscapeEdge {
  data: { id?: string; source: string; target: string; [key: string]: any };
  [key: string]: any;
}
export interface CytoscapeJSON {
  data?: Record<string, any>;
  elements: { nodes: CytoscapeNode[]; edges: CytoscapeEdge[] };
  [key: string]: any;
}
export interface CytoscapeFlatJSON {
  data?: Record<string, any>;
  elements: Array<CytoscapeNode | CytoscapeEdge>;
  [key: string]: any;
}
/** Native cy.json() omits empty element groups. */
export interface CytoscapeNativeJSON extends Omit<CytoscapeJSON, 'elements'> {
  elements: { nodes?: CytoscapeNode[]; edges?: CytoscapeEdge[]; [key: string]: any };
}
export type CytoscapeInput = CytoscapeJSON | CytoscapeFlatJSON | CytoscapeNativeJSON;
export interface CytoscapeImportOptions extends FormatImportOptions {}

const NODE_FIELDS = ['initialNodeId', 'label', 'width', 'height', 'shape', 'color', 'style', 'ports'];
const EDGE_FIELDS = ['label', 'mode', 'weight', 'points', 'routing', 'x', 'y', 'width', 'height', 'color', 'style', 'sourcePort', 'targetPort'];
function getFields(value: Record<string, any>, fields: string[]): Record<string, any> {
  return Object.fromEntries(fields.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
}
function getUserData(data: Record<string, any>, key: string, known: string[], native = false): any {
  if (!native && Object.hasOwn(data, key)) return data[key];
  const unknown = Object.fromEntries(Object.entries(data).filter(([name]) => !known.includes(name) && (name !== '__statelyai' || native || !['cytoscape.node', 'cytoscape.edge', 'cytoscape.graph'].some((format) => getMetadata(data[name], format)))));
  return Object.keys(unknown).length > 0 ? unknown : undefined;
}
function getCytoscapeRoot(cyto: CytoscapeJSON, native = false): Omit<Graph, 'nodes' | 'edges'> {
  return { id: cyto.data?.id ?? '', mode: cyto.data?.mode ?? 'directed',
    initialNodeId: cyto.data?.initialNodeId ?? null,
    data: getUserData(cyto.data ?? {}, 'graphData', ['id', 'mode', 'initialNodeId', 'direction', 'style'], native),
    ...getFields(cyto.data ?? {}, ['direction', 'style']) };
}
function getCytoscapeNode(node: CytoscapeNode, native = false): Graph['nodes'][number] {
  return { type: 'node', id: node.data.id, parentId: node.data.parent ?? null,
    initialNodeId: node.data.initialNodeId ?? null, label: Object.hasOwn(node.data, 'label') ? node.data.label : '',
    data: getUserData(node.data, 'nodeData', ['id', 'parent', 'x', 'y', ...NODE_FIELDS], native),
    ...getFields(node.data, NODE_FIELDS),
    ...(node.position?.x !== undefined ? { x: node.position.x } : getFields(node.data, ['x'])),
    ...(node.position?.y !== undefined ? { y: node.position.y } : getFields(node.data, ['y'])),
  };
}
function getCytoscapeEdge(edge: CytoscapeEdge, index: number, native = false): Graph['edges'][number] {
  return { type: 'edge', id: edge.data.id ?? `e${index}`, sourceId: edge.data.source, targetId: edge.data.target,
    label: Object.hasOwn(edge.data, 'label') ? edge.data.label : '',
    data: getUserData(edge.data, 'edgeData', ['id', 'source', 'target', ...EDGE_FIELDS], native),
    ...getFields(edge.data, EDGE_FIELDS) };
}

/** Export grouped Cytoscape elements, with versioned adapter metadata. */
export interface CytoscapeExportOptions extends FormatExportOptions {}

export function toCytoscapeJSON(graph: Graph, options: CytoscapeExportOptions = {}): CytoscapeJSON {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, 'cytoscape');
  if (carrier) return getMergedNative(carrier.native, toRawCytoscapeJSON(carrier.baseline),
    toRawCytoscapeJSON({ ...graph, data: getCarrierData(graph.data, 'cytoscape') }));
  return toRawCytoscapeJSON(graph);
}

function toRawCytoscapeJSON(graph: Graph): CytoscapeJSON {
  const { nodes, edges, ...root } = graph;
  const used = new Set<string>();
  for (const node of nodes) {
    if (typeof node.id !== 'string' || !node.id || used.has(node.id)) throw new Error('Cytoscape: node IDs must be unique non-empty strings');
    used.add(node.id);
  }
  function createEdgeId(preferred: string): string {
    if (typeof preferred !== 'string' || !preferred) throw new Error('Cytoscape: edge IDs must be non-empty strings');
    let id = preferred;
    for (let suffix = 1; used.has(id); suffix++) id = `${preferred}__statelyai${suffix}`;
    used.add(id); return id;
  }
  const cyto: CytoscapeJSON = {
    data: { ...getFields(root, ['id', 'mode', 'initialNodeId', 'direction', 'style']), graphData: graph.data },
    elements: {
      nodes: nodes.map((node) => {
        const native: CytoscapeNode = { data: { id: node.id,
          ...getFields(node, NODE_FIELDS), nodeData: node.data,
          ...(node.parentId != null && { parent: node.parentId }),
          ...(node.x !== undefined && node.y !== undefined ? {} : getFields(node, ['x', 'y'])),
        }, ...(node.x !== undefined && node.y !== undefined && { position: { x: node.x, y: node.y } }) };
        native.data.__statelyai = createMetadata('cytoscape.node', node, getCytoscapeNode(native));
        return native;
      }),
      edges: edges.map((edge, index) => {
        const native: CytoscapeEdge = { data: { id: createEdgeId(edge.id), source: edge.sourceId, target: edge.targetId,
          ...getFields(edge, EDGE_FIELDS), edgeData: edge.data } };
        native.data.__statelyai = createMetadata('cytoscape.edge', edge, getCytoscapeEdge(native, index));
        return native;
      }),
    },
  };
  cyto.data!.__statelyai = createMetadata('cytoscape.graph', root, getCytoscapeRoot(cyto));
  return getClonedJSON(cyto);
}

/** Import grouped or flat Cytoscape elements. `metadata: native` treats reserved blobs as user data. */
export function fromCytoscapeJSON(input: CytoscapeInput, options: CytoscapeImportOptions = {}): Graph {
  if (!input || typeof input !== 'object') throw new Error('Cytoscape: expected an object');
  if (!input.elements || typeof input.elements !== 'object') throw new Error('Cytoscape: missing "elements" property');
  let cyto: CytoscapeJSON;
  if (Array.isArray(input.elements)) {
    cyto = { ...input, elements: { nodes: [], edges: [] } };
    for (const element of input.elements) {
      if (element.group === 'edges' || ('source' in element.data && 'target' in element.data)) cyto.elements.edges.push(element as CytoscapeEdge);
      else cyto.elements.nodes.push(element as CytoscapeNode);
    }
  } else {
    if (Object.hasOwn(input.elements, 'nodes') && !Array.isArray(input.elements.nodes)) throw new Error('Cytoscape: "elements.nodes" must be an array');
    if (Object.hasOwn(input.elements, 'edges') && !Array.isArray(input.elements.edges)) throw new Error('Cytoscape: "elements.edges" must be an array');
    cyto = { ...input, elements: { ...input.elements, nodes: input.elements.nodes ?? [], edges: input.elements.edges ?? [] } };
  }
  if (!Array.isArray(cyto.elements.nodes)) throw new Error('Cytoscape: "elements.nodes" must be an array');
  if (!Array.isArray(cyto.elements.edges)) throw new Error('Cytoscape: "elements.edges" must be an array');
  const getWireMetadata = (value: any, format: string) => options.metadata === 'native' ? undefined : getMetadata(value, format);
  const metadata = getWireMetadata(cyto.data?.__statelyai, 'cytoscape.graph');
  const graph: Graph = {
    ...getRestoredRecord(getCytoscapeRoot(cyto, options.metadata === 'native'), metadata),
    nodes: cyto.elements.nodes.map((node) => getRestoredRecord(getCytoscapeNode(node, options.metadata === 'native'), getWireMetadata(node.data.__statelyai, 'cytoscape.node'))),
    edges: cyto.elements.edges.map((edge, index) => getRestoredRecord(getCytoscapeEdge(edge, index, options.metadata === 'native'), getWireMetadata(edge.data.__statelyai, 'cytoscape.edge'))),
  };
  if (!metadata || !isJSONEqual(cyto, toRawCytoscapeJSON(graph))) graph.data = createNativeCarrier(graph.data, 'cytoscape', cyto, graph);
  return graph;
}

/**
 * Bidirectional converter for Cytoscape.js JSON format.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { cytoscapeConverter } from '@statelyai/graph/cytoscape';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const cyto = cytoscapeConverter.to(graph);
 * const roundTripped = cytoscapeConverter.from(cyto);
 * ```
 */
export const cytoscapeConverter: GraphFormatConverter<CytoscapeJSON> =
  createFormatConverter(toCytoscapeJSON, fromCytoscapeJSON);


/** Exact native source preservation, with strict verified field edits. */
export const cytoscapeDocumentConverter = createGraphDocumentConverter({
  format: 'cytoscape',
  codec: { from: (source: CytoscapeInput) => fromCytoscapeJSON(source, { metadata: 'native' }), to: (graph: Graph) => toCytoscapeJSON(graph, { nativeCarrier: false }) },
  project: (source: CytoscapeInput) => ({ graph: getStructuredDocumentProjectionGraph(fromCytoscapeJSON(source, { metadata: 'native' }), source, 'cytoscape') }),
  patch: (context) => getStructuredDocumentPatch(context, 'cytoscape'),
});
