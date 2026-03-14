import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type {
  Graph,
  GraphEdge,
  GraphFormatConverter,
  GraphNode,
} from '../../types';
import { createFormatConverter } from '../converter';

const GRAPHML_NS = 'http://graphml.graphdrawing.org/xmlns';

export function toGraphML(graph: Graph): string {
  const keys = [
    {
      '@_id': 'label',
      '@_for': 'all',
      '@_attr.name': 'label',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'parentId',
      '@_for': 'node',
      '@_attr.name': 'parentId',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'initialNodeId',
      '@_for': 'node',
      '@_attr.name': 'initialNodeId',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'data',
      '@_for': 'all',
      '@_attr.name': 'data',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'graphData',
      '@_for': 'graph',
      '@_attr.name': 'data',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'graphInitialNodeId',
      '@_for': 'graph',
      '@_attr.name': 'initialNodeId',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'direction',
      '@_for': 'graph',
      '@_attr.name': 'direction',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'style',
      '@_for': 'all',
      '@_attr.name': 'style',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'graphStyle',
      '@_for': 'graph',
      '@_attr.name': 'style',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'x',
      '@_for': 'all',
      '@_attr.name': 'x',
      '@_attr.type': 'double',
    },
    {
      '@_id': 'y',
      '@_for': 'all',
      '@_attr.name': 'y',
      '@_attr.type': 'double',
    },
    {
      '@_id': 'width',
      '@_for': 'all',
      '@_attr.name': 'width',
      '@_attr.type': 'double',
    },
    {
      '@_id': 'height',
      '@_for': 'all',
      '@_attr.name': 'height',
      '@_attr.type': 'double',
    },
    {
      '@_id': 'shape',
      '@_for': 'node',
      '@_attr.name': 'shape',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'color',
      '@_for': 'all',
      '@_attr.name': 'color',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'weight',
      '@_for': 'edge',
      '@_attr.name': 'weight',
      '@_attr.type': 'double',
    },
  ];

  const nodes = graph.nodes.map((node) => {
    const data: Array<{ '@_key': string; '#text': string | number }> = [];
    if (node.label) data.push({ '@_key': 'label', '#text': node.label });
    if (node.parentId)
      data.push({ '@_key': 'parentId', '#text': node.parentId });
    if (node.initialNodeId) {
      data.push({ '@_key': 'initialNodeId', '#text': node.initialNodeId });
    }
    if (node.data !== undefined) {
      data.push({ '@_key': 'data', '#text': JSON.stringify(node.data) });
    }
    if (node.style !== undefined) {
      data.push({ '@_key': 'style', '#text': JSON.stringify(node.style) });
    }
    if (node.x !== undefined) data.push({ '@_key': 'x', '#text': node.x });
    if (node.y !== undefined) data.push({ '@_key': 'y', '#text': node.y });
    if (node.width !== undefined) {
      data.push({ '@_key': 'width', '#text': node.width });
    }
    if (node.height !== undefined) {
      data.push({ '@_key': 'height', '#text': node.height });
    }
    if (node.shape) data.push({ '@_key': 'shape', '#text': node.shape });
    if (node.color) data.push({ '@_key': 'color', '#text': node.color });

    return {
      '@_id': node.id,
      ...(data.length > 0 && { data }),
    };
  });

  const edges = graph.edges.map((edge) => {
    const data: Array<{ '@_key': string; '#text': string | number }> = [];
    if (edge.label) data.push({ '@_key': 'label', '#text': edge.label });
    if (edge.data !== undefined) {
      data.push({ '@_key': 'data', '#text': JSON.stringify(edge.data) });
    }
    if (edge.style !== undefined) {
      data.push({ '@_key': 'style', '#text': JSON.stringify(edge.style) });
    }
    if (edge.x !== undefined) data.push({ '@_key': 'x', '#text': edge.x });
    if (edge.y !== undefined) data.push({ '@_key': 'y', '#text': edge.y });
    if (edge.width !== undefined) {
      data.push({ '@_key': 'width', '#text': edge.width });
    }
    if (edge.height !== undefined) {
      data.push({ '@_key': 'height', '#text': edge.height });
    }
    if (edge.color) data.push({ '@_key': 'color', '#text': edge.color });
    if (edge.weight !== undefined) {
      data.push({ '@_key': 'weight', '#text': edge.weight });
    }

    return {
      '@_id': edge.id,
      '@_source': edge.sourceId,
      '@_target': edge.targetId,
      ...(data.length > 0 && { data }),
    };
  });

  const graphData: Array<{ '@_key': string; '#text': string }> = [];
  if (graph.data !== undefined) {
    graphData.push({ '@_key': 'graphData', '#text': JSON.stringify(graph.data) });
  }
  if (graph.initialNodeId) {
    graphData.push({
      '@_key': 'graphInitialNodeId',
      '#text': graph.initialNodeId,
    });
  }
  if (graph.direction !== undefined) {
    graphData.push({ '@_key': 'direction', '#text': graph.direction });
  }
  if (graph.style !== undefined) {
    graphData.push({
      '@_key': 'graphStyle',
      '#text': JSON.stringify(graph.style),
    });
  }

  const obj = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    graphml: {
      '@_xmlns': GRAPHML_NS,
      key: keys,
      graph: {
        '@_id': graph.id,
        '@_edgedefault':
          graph.type === 'directed' ? 'directed' : 'undirected',
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
  if (typeof xml !== 'string') {
    throw new Error('GraphML: expected a string');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) => ['node', 'edge', 'data', 'key'].includes(name),
  });

  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch (e: any) {
    throw new Error(`GraphML: invalid XML — ${e.message}`);
  }

  const graphml = parsed?.graphml;
  if (!graphml) {
    throw new Error('GraphML: missing <graphml> root element');
  }

  const graphEl = graphml.graph;
  if (!graphEl) {
    throw new Error('GraphML: missing <graph> element');
  }

  const graphType: 'directed' | 'undirected' =
    graphEl['@_edgedefault'] === 'undirected' ? 'undirected' : 'directed';
  const graphDataMap = parseDataElements(graphEl.data);
  const graphData =
    graphDataMap.graphData !== undefined
      ? tryParseJSON(graphDataMap.graphData)
      : undefined;

  const nodes: GraphNode[] = asArray(graphEl.node).map((nodeEl: any) => {
    const dataMap = parseDataElements(nodeEl.data);
    const node: GraphNode = {
      type: 'node',
      id: String(nodeEl['@_id']),
      parentId: dataMap.parentId ?? null,
      initialNodeId: dataMap.initialNodeId ?? null,
      label: dataMap.label ?? '',
      data:
        dataMap.data !== undefined ? tryParseJSON(dataMap.data) : undefined,
    };

    if (dataMap.x !== undefined) node.x = parseNumber(dataMap.x);
    if (dataMap.y !== undefined) node.y = parseNumber(dataMap.y);
    if (dataMap.width !== undefined) node.width = parseNumber(dataMap.width);
    if (dataMap.height !== undefined) node.height = parseNumber(dataMap.height);
    if (dataMap.shape !== undefined) node.shape = dataMap.shape;
    if (dataMap.color !== undefined) node.color = dataMap.color;
    if (dataMap.style !== undefined) node.style = tryParseJSON(dataMap.style);

    return node;
  });

  const edges: GraphEdge[] = asArray(graphEl.edge).map((edgeEl: any) => {
    const dataMap = parseDataElements(edgeEl.data);
    const edge: GraphEdge = {
      type: 'edge',
      id: String(edgeEl['@_id']),
      sourceId: String(edgeEl['@_source']),
      targetId: String(edgeEl['@_target']),
      label: dataMap.label ?? '',
      data:
        dataMap.data !== undefined ? tryParseJSON(dataMap.data) : undefined,
    };

    if (dataMap.weight !== undefined) edge.weight = parseNumber(dataMap.weight);
    if (dataMap.x !== undefined) edge.x = parseNumber(dataMap.x);
    if (dataMap.y !== undefined) edge.y = parseNumber(dataMap.y);
    if (dataMap.width !== undefined) edge.width = parseNumber(dataMap.width);
    if (dataMap.height !== undefined) edge.height = parseNumber(dataMap.height);
    if (dataMap.color !== undefined) edge.color = dataMap.color;
    if (dataMap.style !== undefined) edge.style = tryParseJSON(dataMap.style);

    return edge;
  });

  const graph: Graph = {
    id: String(graphEl['@_id'] ?? ''),
    type: graphType,
    initialNodeId: graphDataMap.graphInitialNodeId ?? null,
    nodes,
    edges,
    data: graphData,
  };

  if (graphDataMap.direction !== undefined) {
    graph.direction = parseDirection(graphDataMap.direction);
  }
  if (graphDataMap.graphStyle !== undefined) {
    graph.style = tryParseJSON(graphDataMap.graphStyle);
  }

  return graph;
}

function asArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

function parseDataElements(dataEls: any): Record<string, string> {
  const map: Record<string, string> = {};
  for (const dataEl of asArray(dataEls)) {
    if (dataEl && dataEl['@_key']) {
      map[dataEl['@_key']] = String(dataEl['#text'] ?? '');
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

function parseNumber(value: string): number {
  return Number(value);
}

function parseDirection(value: string): Graph['direction'] {
  return ['up', 'down', 'left', 'right'].includes(value)
    ? (value as Graph['direction'])
    : undefined;
}

/** Bidirectional converter for GraphML XML format. */
export const graphmlConverter: GraphFormatConverter<string> =
  createFormatConverter(toGraphML, fromGraphML);
