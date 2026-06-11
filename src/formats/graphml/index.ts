import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type {
  Graph,
  GraphEdge,
  GraphFormatConverter,
  GraphNode,
} from '../../types';
import { createFormatConverter } from '../converter';
import { getEdgeMode } from '../../mode';

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
    {
      '@_id': 'points',
      '@_for': 'edge',
      '@_attr.name': 'points',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'routing',
      '@_for': 'edge',
      '@_attr.name': 'routing',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'ports',
      '@_for': 'node',
      '@_attr.name': 'ports',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'sourcePort',
      '@_for': 'edge',
      '@_attr.name': 'sourcePort',
      '@_attr.type': 'string',
    },
    {
      '@_id': 'targetPort',
      '@_for': 'edge',
      '@_attr.name': 'targetPort',
      '@_attr.type': 'string',
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
    if (node.ports !== undefined) {
      data.push({ '@_key': 'ports', '#text': JSON.stringify(node.ports) });
    }

    return {
      '@_id': node.id,
      ...(data.length > 0 && { data }),
    };
  });

  const graphDirected = graph.mode !== 'undirected';
  const edges = graph.edges.map((edge) => {
    // Per-edge directedness override. GraphML edges carry an optional boolean
    // `directed` attribute; emit it only when the edge differs from the graph
    // default. Bidirectional has no GraphML representation and maps to directed.
    const edgeDirected = getEdgeMode(graph, edge) !== 'undirected';
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
    if (edge.points !== undefined) {
      data.push({ '@_key': 'points', '#text': JSON.stringify(edge.points) });
    }
    if (edge.routing !== undefined) {
      data.push({ '@_key': 'routing', '#text': edge.routing });
    }
    if (edge.sourcePort !== undefined) {
      data.push({ '@_key': 'sourcePort', '#text': edge.sourcePort });
    }
    if (edge.targetPort !== undefined) {
      data.push({ '@_key': 'targetPort', '#text': edge.targetPort });
    }

    return {
      '@_id': edge.id,
      '@_source': edge.sourceId,
      '@_target': edge.targetId,
      ...(edgeDirected !== graphDirected && {
        '@_directed': edgeDirected ? 'true' : 'false',
      }),
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
          graph.mode === 'undirected' ? 'undirected' : 'directed',
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
    // Keep `directed="true"` intact instead of collapsing to a bare attribute.
    suppressBooleanAttributes: false,
  });

  return builder.build(obj);
}

export function fromGraphML(xml: string): Graph {
  if (typeof xml !== 'string') {
    throw new Error('GraphML: expected a string');
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) =>
      ['node', 'edge', 'data', 'key', 'graph', 'port'].includes(name),
    // Keep <data> text verbatim: "1.50" must not become 1.5 and
    // "  hi  " must not be trimmed. Numeric fields are parsed explicitly.
    parseTagValue: false,
    trimValues: false,
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

  // Multi-graph documents: import the first <graph> only.
  const graphEl = asArray(graphml.graph)[0];
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

  // Standard GraphML nests subgraphs as <node><graph>…</graph></node> and
  // allows edges inside nested <graph> elements. Collect nodes (with their
  // structural parent) and edges recursively; node ids are document-global,
  // so edge endpoint resolution is unaffected by nesting depth.
  const nodeEntries: Array<{ el: any; structuralParentId: string | null }> = [];
  const edgeEls: any[] = [];
  function collectGraphContents(gEl: any, parentId: string | null) {
    for (const nodeEl of asArray(gEl.node)) {
      nodeEntries.push({ el: nodeEl, structuralParentId: parentId });
      for (const subgraphEl of asArray(nodeEl.graph)) {
        collectGraphContents(subgraphEl, String(nodeEl['@_id']));
      }
    }
    edgeEls.push(...asArray(gEl.edge));
  }
  collectGraphContents(graphEl, null);

  const nodes: GraphNode[] = nodeEntries.map(({ el: nodeEl, structuralParentId }) => {
    const dataMap = parseDataElements(nodeEl.data);
    const id = String(nodeEl['@_id']);
    const node: GraphNode = {
      type: 'node',
      id,
      // Own-dialect <data key="parentId"> takes precedence over structural
      // nesting in standard-GraphML subgraphs.
      parentId: dataMap.parentId ?? structuralParentId,
      initialNodeId: dataMap.initialNodeId ?? null,
      label: dataMap.label ?? '',
      data:
        dataMap.data !== undefined ? tryParseJSON(dataMap.data) : undefined,
    };

    if (dataMap.x !== undefined) node.x = parseNumber(dataMap.x, 'x', 'node', id);
    if (dataMap.y !== undefined) node.y = parseNumber(dataMap.y, 'y', 'node', id);
    if (dataMap.width !== undefined) {
      node.width = parseNumber(dataMap.width, 'width', 'node', id);
    }
    if (dataMap.height !== undefined) {
      node.height = parseNumber(dataMap.height, 'height', 'node', id);
    }
    if (dataMap.shape !== undefined) node.shape = dataMap.shape;
    if (dataMap.color !== undefined) node.color = dataMap.color;
    if (dataMap.style !== undefined) node.style = tryParseJSON(dataMap.style);
    if (dataMap.ports !== undefined) {
      // Own-dialect <data key="ports"> JSON takes precedence over native
      // <port> elements.
      node.ports = tryParseJSON(dataMap.ports);
    } else if (nodeEl.port !== undefined) {
      node.ports = collectPorts(nodeEl.port);
    }

    return node;
  });
  // All explicit edge ids, so synthesized ids can never collide with them.
  const usedEdgeIds = new Set<string>(
    edgeEls
      .filter((edgeEl: any) => edgeEl['@_id'] != null)
      .map((edgeEl: any) => String(edgeEl['@_id'])),
  );

  const edges: GraphEdge[] = edgeEls.map((edgeEl: any, i: number) => {
    const dataMap = parseDataElements(edgeEl.data);
    const source = String(edgeEl['@_source']);
    const target = String(edgeEl['@_target']);
    // GraphML edge `id` is optional; synthesize a stable, unique one when
    // absent so downstream indexing/rendering can tell edges apart.
    let id: string;
    if (edgeEl['@_id'] != null) {
      id = String(edgeEl['@_id']);
    } else {
      id = `${source}-${target}-${i}`;
      for (let suffix = 0; usedEdgeIds.has(id); suffix++) {
        id = `${source}-${target}-${i}#e${suffix}`;
      }
      usedEdgeIds.add(id);
    }
    const edge: GraphEdge = {
      type: 'edge',
      id,
      sourceId: source,
      targetId: target,
      label: dataMap.label ?? '',
      data:
        dataMap.data !== undefined ? tryParseJSON(dataMap.data) : undefined,
    };

    if (dataMap.weight !== undefined) {
      edge.weight = parseNumber(dataMap.weight, 'weight', 'edge', id);
    }
    if (dataMap.points !== undefined) {
      edge.points = tryParseJSON(dataMap.points);
    }
    if (dataMap.routing !== undefined) {
      edge.routing = dataMap.routing as GraphEdge['routing'];
    }
    if (dataMap.x !== undefined) edge.x = parseNumber(dataMap.x, 'x', 'edge', id);
    if (dataMap.y !== undefined) edge.y = parseNumber(dataMap.y, 'y', 'edge', id);
    if (dataMap.width !== undefined) {
      edge.width = parseNumber(dataMap.width, 'width', 'edge', id);
    }
    if (dataMap.height !== undefined) {
      edge.height = parseNumber(dataMap.height, 'height', 'edge', id);
    }
    if (dataMap.color !== undefined) edge.color = dataMap.color;
    if (dataMap.style !== undefined) edge.style = tryParseJSON(dataMap.style);
    // Own-dialect <data key="sourcePort"/"targetPort"> takes precedence over
    // the standard GraphML sourceport/targetport attributes.
    if (dataMap.sourcePort !== undefined) {
      edge.sourcePort = dataMap.sourcePort;
    } else if (edgeEl['@_sourceport'] != null) {
      edge.sourcePort = String(edgeEl['@_sourceport']);
    }
    if (dataMap.targetPort !== undefined) {
      edge.targetPort = dataMap.targetPort;
    } else if (edgeEl['@_targetport'] != null) {
      edge.targetPort = String(edgeEl['@_targetport']);
    }

    // Per-edge directedness override from the GraphML `directed` attribute.
    const directedAttr = edgeEl['@_directed'];
    if (directedAttr !== undefined) {
      edge.mode = String(directedAttr) === 'false' ? 'undirected' : 'directed';
    }

    return edge;
  });

  const graph: Graph = {
    id: String(graphEl['@_id'] ?? ''),
    mode: graphType,
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

/**
 * Flattens native GraphML <port> elements (which may nest) into our port
 * shape. Standard GraphML ports carry only a name; direction is unknowable,
 * so they import as advisory 'inout' with null data.
 */
function collectPorts(portEls: any): GraphNode['ports'] {
  const ports: NonNullable<GraphNode['ports']> = [];
  for (const portEl of asArray(portEls)) {
    if (portEl?.['@_name'] == null) continue;
    ports.push({
      name: String(portEl['@_name']),
      direction: 'inout',
      data: null,
    });
    if (portEl.port !== undefined) {
      ports.push(...(collectPorts(portEl.port) ?? []));
    }
  }
  return ports;
}

function parseNumber(
  value: string,
  key: string,
  kind: 'node' | 'edge',
  ownerId: string,
): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `GraphML: <data key="${key}"> value "${value}" on ${kind} "${ownerId}" is not a number. Fix the value or remove the attribute.`,
    );
  }
  return parsed;
}

function parseDirection(value: string): Graph['direction'] {
  return ['up', 'down', 'left', 'right'].includes(value)
    ? (value as Graph['direction'])
    : undefined;
}

/** Bidirectional converter for GraphML XML format. */
export const graphmlConverter: GraphFormatConverter<string> =
  createFormatConverter(toGraphML, fromGraphML);
