import type { FormatExportOptions } from '../preservation';
import { createGraphDocumentConverter } from '../document';
import { getStructuredDocumentProjectionGraph, getStructuredDocumentPatch } from '../preservation';
import type { Graph, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import { createMetadata, createNativeCarrier, getCarrierData, getClonedJSON, getMetadata,
  getNativeCarrier, getRestoredRecord, getMergedNative, type FormatImportOptions } from '../preservation';
import { isJSONEqual } from '../preservation';

export interface D3Node {
  id: string;
  x?: number; y?: number; vx?: number; vy?: number;
  fx?: number | null; fy?: number | null;
  [key: string]: any;
}

export interface D3Link {
  source: string | number | D3Node;
  target: string | number | D3Node;
  [key: string]: any;
}

export interface D3Graph {
  id?: string;
  mode?: Graph['mode'];
  initialNodeId?: string | null;
  data?: any;
  direction?: Graph['direction'];
  style?: Graph['style'];
  nodes: D3Node[];
  links: D3Link[];
  [key: string]: any;
}

export interface D3ImportOptions extends FormatImportOptions {}

const NODE_FIELDS = ['x', 'y', 'width', 'height', 'color', 'shape', 'style', 'ports'];
const EDGE_FIELDS = ['mode', 'weight', 'points', 'routing', 'x', 'y', 'width', 'height', 'color', 'style', 'sourcePort', 'targetPort'];

function getFields(value: Record<string, any>, fields: string[]): Record<string, any> {
  return Object.fromEntries(fields.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]));
}

function getD3Root(d3: D3Graph): Omit<Graph, 'nodes' | 'edges'> {
  return { id: d3.id ?? '', mode: d3.mode ?? 'directed', initialNodeId: d3.initialNodeId ?? null,
    data: d3.data, ...getFields(d3, ['direction', 'style']) };
}

function getD3Node(node: D3Node): Graph['nodes'][number] {
  return { type: 'node', id: node.id, parentId: node.parentId ?? null,
    initialNodeId: node.initialNodeId ?? null, label: Object.hasOwn(node, 'label') ? node.label : '',
    data: node.data, ...getFields(node, NODE_FIELDS) };
}

function getD3Endpoint(value: D3Link['source'], nodes: D3Node[]): string {
  const id = typeof value === 'number'
    ? (Number.isInteger(value) && value >= 0 ? nodes[value]?.id : undefined)
    : typeof value === 'string' ? value : value?.id;
  // Numeric endpoints are array indices. String IDs and object IDs remain
  // transparent, including dangling IDs supported by the Graph model.
  if (typeof id !== 'string') {
    throw new Error(`D3: invalid endpoint or node index ${JSON.stringify(value)}`);
  }
  return id;
}

function getD3Edge(link: D3Link, index: number, nodes: D3Node[]): Graph['edges'][number] {
  return { type: 'edge', id: link.id ?? `e${index}`, sourceId: getD3Endpoint(link.source, nodes),
    targetId: getD3Endpoint(link.target, nodes), label: Object.hasOwn(link, 'label') ? link.label : '',
    data: link.data, ...getFields(link, EDGE_FIELDS) };
}

/**
 * Converts a graph to D3.js force-directed format.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { toD3Graph } from '@statelyai/graph/d3';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const d3 = toD3Graph(graph);
 * // { nodes: [{ id: 'a' }, { id: 'b' }], links: [{ source: 'a', target: 'b' }] }
 * ```
 */
export interface D3ExportOptions extends FormatExportOptions {}

export function toD3Graph(graph: Graph, options: D3ExportOptions = {}): D3Graph {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, 'd3');
  if (carrier) {
    const original = getClonedJSON(carrier.native) as D3Graph;
    const baseline = toRawD3Graph(carrier.baseline);
    const originalById = new Map(original.nodes.map((node) => [node.id, node]));
    const beforeById = new Map(baseline.nodes.map((node) => [node.id, node]));
    const lineage = new Map<string, string>();
    for (const node of graph.nodes) {
      const marker = (node as any).__statelyaiD3Node;
      if (marker?.kind === '@statelyai/graph/d3-node' && marker.version === 1 &&
          typeof marker.id === 'string' && originalById.has(marker.id)) {
        if (lineage.has(marker.id)) throw new Error('D3: duplicate native node lineage');
        lineage.set(marker.id, node.id);
      }
    }
    for (const [id, currentId] of lineage) {
      originalById.get(id)!.id = currentId;
      if (beforeById.has(id)) beforeById.get(id)!.id = currentId;
    }
    const native = getMergedNative(original, baseline,
      toRawD3Graph({ ...graph, data: getCarrierData(graph.data, 'd3') })) as D3Graph;
    const indices = new Map(graph.nodes.map((node, index) => [node.id, index]));
    const sourceNodes = new Map(carrier.native.nodes.map((node: D3Node) => [node.id, node]));
    const sourceLinks = new Map(carrier.baseline.edges.map((edge: Graph['edges'][number], index: number) => [edge.id, carrier.native.links[index]]));
    const references = (carrier as any).objectEndpoints ?? {};
    native.links.forEach((link, index) => {
      const edge = graph.edges[index];
      const original = sourceLinks.get(edge.id) as D3Link | undefined;
      for (const [key, id] of [['source', edge.sourceId], ['target', edge.targetId]] as const) {
        const originalEndpoint = original?.[key];
        if (typeof originalEndpoint === 'number') link[key] = indices.get(id) ?? id;
        else if (originalEndpoint && typeof originalEndpoint === 'object') {
          const position = indices.get(id);
          const currentNode = position !== undefined ? native.nodes[position] : { id };
          if (references[edge.id]?.[key] && position !== undefined) link[key] = currentNode;
          else link[key] = getMergedNative(originalEndpoint, sourceNodes.get(originalEndpoint.id) ?? {}, currentNode);
        }
      }
    });
    return native;
  }
  return toRawD3Graph(graph);
}

function toRawD3Graph(graph: Graph): D3Graph {
  const { nodes, edges, ...root } = graph;
  const d3: D3Graph = {
    ...getClonedJSON(root),
    nodes: nodes.map((node) => {
      const { type: _type, __statelyaiD3Node: _lineage, ...native } = getClonedJSON(node) as any;
      return { ...native, __statelyai: createMetadata('d3.node', Object.fromEntries(Object.entries(node).filter(([key]) => key !== '__statelyaiD3Node')), getD3Node(native)) };
    }),
    links: edges.map((edge, index) => {
      const { type: _type, sourceId, targetId, ...fields } = getClonedJSON(edge);
      const native: D3Link = { ...fields, source: sourceId, target: targetId };
      return { ...native, __statelyai: createMetadata('d3.edge', edge, getD3Edge(native, index, nodes)) };
    }),
  };
  d3.__statelyai = createMetadata('d3.graph', root, getD3Root(d3));
  return d3;
}

/** Import numeric indices, string IDs and live D3 node references. */
export function fromD3Graph(d3: D3Graph, options: D3ImportOptions = {}): Graph {
  if (!d3 || typeof d3 !== 'object') throw new Error('D3: expected an object');
  if (!Array.isArray(d3.nodes)) throw new Error('D3: "nodes" must be an array');
  if (!Array.isArray(d3.links)) throw new Error('D3: "links" must be an array');
  const getWireMetadata = (value: any, format: string) => options.metadata === 'native' ? undefined : getMetadata(value, format);
  const metadata = getWireMetadata(d3.__statelyai, 'd3.graph');
  const graph: Graph = {
    ...getRestoredRecord(getD3Root(d3), metadata),
    nodes: d3.nodes.map((node) => getRestoredRecord(getD3Node(node), getWireMetadata(node.__statelyai, 'd3.node'))),
    edges: d3.links.map((link, index) => getRestoredRecord(getD3Edge(link, index, d3.nodes), getWireMetadata(link.__statelyai, 'd3.edge'))),
  };
  if (!metadata || !isJSONEqual(d3, toRawD3Graph(graph))) {
    graph.nodes.forEach((node) => {
      (node as any).__statelyaiD3Node = { kind: '@statelyai/graph/d3-node', version: 1, id: node.id };
    });
    graph.data = createNativeCarrier(graph.data, 'd3', d3, graph);
    const nativeNodes = new Set(d3.nodes);
    graph.data.__statelyaiNative.objectEndpoints = Object.fromEntries(graph.edges.map((edge, index) => [edge.id, {
      source: typeof d3.links[index].source === 'object' && nativeNodes.has(d3.links[index].source as D3Node),
      target: typeof d3.links[index].target === 'object' && nativeNodes.has(d3.links[index].target as D3Node),
    }]));
  }
  return graph;
}

/**
 * Bidirectional converter for D3.js force-directed JSON format.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { d3Converter } from '@statelyai/graph/d3';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const d3 = d3Converter.to(graph);
 * const roundTripped = d3Converter.from(d3);
 * ```
 */
export const d3Converter: GraphFormatConverter<D3Graph> =
  createFormatConverter(toD3Graph, fromD3Graph);


/** Exact native source preservation, with strict verified field edits. */
export const d3DocumentConverter = createGraphDocumentConverter({
  format: 'd3',
  codec: { from: (source: D3Graph) => fromD3Graph(source, { metadata: 'native' }), to: (graph: Graph) => toD3Graph(graph, { nativeCarrier: false }) },
  project: (source: D3Graph) => ({ graph: getStructuredDocumentProjectionGraph(fromD3Graph(source, { metadata: 'native' }), source, 'd3') }),
  patch: (context) => getStructuredDocumentPatch(context, 'd3'),
});
