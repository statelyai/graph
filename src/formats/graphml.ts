import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../types';
import { createFormatConverter } from './converter';

const GRAPHML_NS = 'http://graphml.graphdrawing.org/xmlns';

export function toGraphML(graph: Graph): string {
  const keys = [
    { '@_id': 'label', '@_for': 'all', '@_attr.name': 'label', '@_attr.type': 'string' },
    { '@_id': 'parentId', '@_for': 'node', '@_attr.name': 'parentId', '@_attr.type': 'string' },
    { '@_id': 'data', '@_for': 'all', '@_attr.name': 'data', '@_attr.type': 'string' },
    { '@_id': 'graphData', '@_for': 'graph', '@_attr.name': 'data', '@_attr.type': 'string' },
    { '@_id': 'x', '@_for': 'all', '@_attr.name': 'x', '@_attr.type': 'double' },
    { '@_id': 'y', '@_for': 'all', '@_attr.name': 'y', '@_attr.type': 'double' },
    { '@_id': 'width', '@_for': 'all', '@_attr.name': 'width', '@_attr.type': 'double' },
    { '@_id': 'height', '@_for': 'all', '@_attr.name': 'height', '@_attr.type': 'double' },
    { '@_id': 'shape', '@_for': 'node', '@_attr.name': 'shape', '@_attr.type': 'string' },
    { '@_id': 'color', '@_for': 'all', '@_attr.name': 'color', '@_attr.type': 'string' },
  ];

  const nodes = graph.nodes.map((n) => {
    const data: any[] = [];
    if (n.label) data.push({ '@_key': 'label', '#text': n.label });
    if (n.parentId !== null) data.push({ '@_key': 'parentId', '#text': n.parentId });
    if (n.data !== undefined) data.push({ '@_key': 'data', '#text': JSON.stringify(n.data) });
    if (n.x !== undefined) data.push({ '@_key': 'x', '#text': n.x });
    if (n.y !== undefined) data.push({ '@_key': 'y', '#text': n.y });
    if (n.width !== undefined) data.push({ '@_key': 'width', '#text': n.width });
    if (n.height !== undefined) data.push({ '@_key': 'height', '#text': n.height });
    if (n.shape) data.push({ '@_key': 'shape', '#text': n.shape });
    if (n.color) data.push({ '@_key': 'color', '#text': n.color });
    return {
      '@_id': n.id,
      ...(data.length > 0 && { data }),
    };
  });

  const edges = graph.edges.map((e) => {
    const data: any[] = [];
    if (e.label) data.push({ '@_key': 'label', '#text': e.label });
    if (e.data !== undefined) data.push({ '@_key': 'data', '#text': JSON.stringify(e.data) });
    if (e.x !== undefined) data.push({ '@_key': 'x', '#text': e.x });
    if (e.y !== undefined) data.push({ '@_key': 'y', '#text': e.y });
    if (e.width !== undefined) data.push({ '@_key': 'width', '#text': e.width });
    if (e.height !== undefined) data.push({ '@_key': 'height', '#text': e.height });
    if (e.color) data.push({ '@_key': 'color', '#text': e.color });
    return {
      '@_id': e.id,
      '@_source': e.sourceId,
      '@_target': e.targetId,
      ...(data.length > 0 && { data }),
    };
  });

  const graphData: any[] = [];
  if (graph.data !== undefined) {
    graphData.push({ '@_key': 'graphData', '#text': JSON.stringify(graph.data) });
  }

  const obj = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    graphml: {
      '@_xmlns': GRAPHML_NS,
      key: keys,
      graph: {
        '@_id': graph.id,
        '@_edgedefault': graph.type === 'directed' ? 'directed' : 'undirected',
        ...(graphData.length > 0 && { data: graphData }),
        node: nodes,
        edge: edges,
      },
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    format: true,
    suppressEmptyNode: true,
  });

  return builder.build(obj);
}

export function fromGraphML(xml: string): Graph {
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => ['node', 'edge', 'data', 'key'].includes(name),
  });

  const parsed = parser.parse(xml);
  const graphml = parsed.graphml;
  const graphEl = graphml.graph;

  const graphType: 'directed' | 'undirected' =
    graphEl['@_edgedefault'] === 'undirected' ? 'undirected' : 'directed';

  // Parse graph-level data
  let graphData: any = undefined;
  if (graphEl.data) {
    for (const d of asArray(graphEl.data)) {
      if (d['@_key'] === 'graphData') {
        graphData = tryParseJSON(String(d['#text']));
      }
    }
  }

  // Parse nodes
  const nodes: GraphNode[] = asArray(graphEl.node).map((n: any) => {
    const dataMap = parseDataElements(n.data);
    return {
      type: 'node' as const,
      id: String(n['@_id']),
      parentId: dataMap.parentId ?? null,
      initialNodeId: dataMap.initialNodeId ?? null,
      label: dataMap.label ?? '',
      data: dataMap.data !== undefined ? tryParseJSON(dataMap.data) : undefined,
    };
  });

  // Parse edges
  const edges: GraphEdge[] = asArray(graphEl.edge).map((e: any) => {
    const dataMap = parseDataElements(e.data);
    return {
      type: 'edge' as const,
      id: String(e['@_id']),
      sourceId: String(e['@_source']),
      targetId: String(e['@_target']),
      label: dataMap.label ?? '',
      data: dataMap.data !== undefined ? tryParseJSON(dataMap.data) : undefined,
    };
  });

  return {
    id: String(graphEl['@_id'] ?? ''),
    type: graphType,
    initialNodeId: null,
    nodes,
    edges,
    data: graphData,
  };
}

function asArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

function parseDataElements(dataEls: any): Record<string, string> {
  const map: Record<string, string> = {};
  for (const d of asArray(dataEls)) {
    if (d && d['@_key']) {
      map[d['@_key']] = String(d['#text'] ?? '');
    }
  }
  return map;
}

function tryParseJSON(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/** Bidirectional converter for GraphML XML format. */
export const graphmlConverter: GraphFormatConverter<string> =
  createFormatConverter(toGraphML, fromGraphML);
