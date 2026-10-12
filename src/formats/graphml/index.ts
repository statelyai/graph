import { getStandardXML, getValidatedXMLValue, isXMLNMTOKEN } from '../xml-standard';
import { createGraphDocumentConverter } from '../document';
import { getXMLDocumentPatch, getXMLDocumentProjection } from '../xml-document';
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';
import type {
  Graph,
  GraphEdge,
  GraphFormatConverter,
  GraphNode,
} from '../../types';
import { createFormatConverter } from '../converter';
import { getEdgeMode } from '../../mode';
import { createFormatData, getFormatMetadata, getNormalizedXML, getNativeXML, getUserData } from '../xml-preservation';

const GRAPHML_NS = 'http://graphml.graphdrawing.org/xmlns';

export interface GraphMLExportOptions {
  /** Validate native identifiers/characters and omit the empty optional graph ID. */
  standard?: boolean;
}

export function toGraphML(graph: Graph, options: GraphMLExportOptions = {}): string {
  if (options.standard) {
    const ids = [...(graph.id === '' ? [] : [graph.id]), ...graph.nodes.flatMap((node) => [node.id, ...(node.ports ?? []).map((port) => port.name)]), ...graph.edges.flatMap((edge) => [edge.id, edge.sourceId, edge.targetId, ...(edge.sourcePort !== undefined ? [edge.sourcePort] : []), ...(edge.targetPort !== undefined ? [edge.targetPort] : [])])];
    for (const id of ids) if (typeof id !== 'string' || !isXMLNMTOKEN(id)) throw new Error(`GraphML standard profile: native ID/port name is not an XML NMTOKEN: ${JSON.stringify(id)}`);
    for (const group of [graph.nodes, graph.edges]) if (new Set(group.map((entity) => entity.id)).size !== group.length) throw new Error('GraphML standard profile: duplicate native entity IDs');
    const nodeIds = new Set(graph.nodes.map((node) => node.id));
    for (const edge of graph.edges) if (!nodeIds.has(edge.sourceId) || !nodeIds.has(edge.targetId)) throw new Error('GraphML standard profile: unresolved edge endpoint');
  }
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

  // Dedicated wire metadata records presence without overriding native edits.
  keys.push({ '@_id': '_stately', '@_for': 'all', '@_attr.name': '_stately', '@_attr.type': 'string' });
  const nativeKeys = getFormatMetadata(graph.data, 'graphml')?.keys ?? [];
  const nativeIdMap = new Map<string, string>();
  for (const key of nativeKeys) {
    const id = String(key['@_id']);
    let emittedId = id;
    while (keys.some((existing) => existing['@_id'] === emittedId)) emittedId = `native_${emittedId}`;
    nativeIdMap.set(id, emittedId);
    keys.push({ ...getNativeXML(key), '@_id': emittedId });
  }
  const getNativeData = (data: unknown): any[] => (getFormatMetadata(data, 'graphml')?.values ?? [])
    .map((value: any) => ({ ...getNativeXML(value), '@_key': nativeIdMap.get(String(value['@_key'])) ?? value['@_key'] }));
  const nodes = graph.nodes.map((node) => {
    const data: Array<{ '@_key': string; '#text': string | number }> = [];
    if (node.label != null) data.push({ '@_key': 'label', '#text': node.label });
    if (node.label === null || node.ports !== undefined) data.push({ '@_key': '_stately', '#text': JSON.stringify({ format: 'stately', version: 1, ...(node.label === null && {nullLabel:true}), ...(node.ports !== undefined && {nativePorts:true}) }) });
    if (node.parentId != null)
      data.push({ '@_key': 'parentId', '#text': node.parentId });
    if (node.initialNodeId != null) {
      data.push({ '@_key': 'initialNodeId', '#text': node.initialNodeId });
    }
    if (getUserData(node.data, 'graphml') !== undefined) {
      data.push({ '@_key': 'data', '#text': JSON.stringify(getUserData(node.data, 'graphml')) });
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
      ...((data.length > 0 || getNativeData(node.data).length > 0) && { data: [...data, ...getNativeData(node.data)] }),
      ...(node.ports && { port: getNativePorts(node.ports, getNativeData) }),
    };
  });

  const graphDirected = graph.mode !== 'undirected';
  const edges = graph.edges.map((edge) => {
    // Per-edge directedness override. GraphML edges carry an optional boolean
    // `directed` attribute; emit it only when the edge differs from the graph
    // default. Bidirectional uses directed native syntax plus private mode metadata.
    const edgeDirected = getEdgeMode(graph, edge) !== 'undirected';
    const data: Array<{ '@_key': string; '#text': string | number }> = [];
    if (edge.label != null) data.push({ '@_key': 'label', '#text': edge.label });
    if (edge.label === null || edge.mode !== undefined) data.push({ '@_key': '_stately', '#text': JSON.stringify({ format: 'stately', version: 1, ...(edge.label === null && { nullLabel: true }), ...(edge.mode !== undefined && { mode: edge.mode, nativeDirected: edgeDirected !== graphDirected ? String(edgeDirected) : null }) }) });
    if (getUserData(edge.data, 'graphml') !== undefined) {
      data.push({ '@_key': 'data', '#text': JSON.stringify(getUserData(edge.data, 'graphml')) });
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
      ...((data.length > 0 || getNativeData(edge.data).length > 0) && { data: [...data, ...getNativeData(edge.data)] }),
      ...(edge.sourcePort !== undefined && { '@_sourceport': edge.sourcePort }),
      ...(edge.targetPort !== undefined && { '@_targetport': edge.targetPort }),
    };
  });

  const graphData: Array<{ '@_key': string; '#text': string }> = [];
  if (getUserData(graph.data, 'graphml') !== undefined) {
    graphData.push({ '@_key': 'graphData', '#text': JSON.stringify(getUserData(graph.data, 'graphml')) });
  }
  if (graph.initialNodeId != null) {
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

  if (graph.mode === 'bidirectional') graphData.push({ '@_key': '_stately', '#text': JSON.stringify({ format: 'stately', version: 1, mode: graph.mode, nativeDefault: 'directed' }) });
  const obj = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    graphml: {
      '@_xmlns': GRAPHML_NS,
      key: keys,
      graph: {
        ...((!options.standard || graph.id !== '') && { '@_id': graph.id }),
        '@_edgedefault':
          graph.mode === 'undirected' ? 'undirected' : 'directed',
        ...((graphData.length > 0 || getNativeData(graph.data).length > 0) && { data: [...graphData, ...getNativeData(graph.data)] }),
        node: nodes,
        edge: edges,
      },
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    // Formatting inserts whitespace into unknown mixed-content XML.
    format: false,
    suppressEmptyNode: true,
    // Keep `directed="true"` intact instead of collapsing to a bare attribute.
    suppressBooleanAttributes: false,
  });

  if (options.standard) getValidatedXMLValue(obj);
  const output = builder.build(obj);
  return options.standard ? getStandardXML(output) : output;
}

export function fromGraphML(xml: string): Graph {
  if (typeof xml !== 'string') {
    throw new Error('GraphML: expected a string');
  }

  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`GraphML: invalid XML — ${validation.err.msg}`);
  const parser = new XMLParser({
    ignoreAttributes: false,
    // Required by this peer to decode standard XML numeric character references.
    htmlEntities: true,
    isArray: (name) =>
      ['node', 'edge', 'data', 'key', 'graph', 'port', 'hyperedge'].includes(name.split(':').pop()!),
    // Keep <data> text verbatim: "1.50" must not become 1.5 and
    // "  hi  " must not be trimmed. Numeric fields are parsed explicitly.
    parseTagValue: false,
    trimValues: false,
  });

  let parsed: any;
  try {
    parsed = getNormalizedXML(parser.parse(xml), GRAPHML_NS);
  } catch (e: any) {
    throw new Error(`GraphML: invalid XML — ${e.message}`);
  }

  const graphml = parsed?.graphml;
  if (!graphml) {
    throw new Error('GraphML: missing <graphml> root element');
  }

  // Multi-graph documents: import the first <graph> only.
  const graphEl = getArray(graphml.graph)[0];
  if (!graphEl) {
    throw new Error('GraphML: missing <graph> element');
  }

  const definitions = getArray<any>(graphml.key);
  const graphType: 'directed' | 'undirected' =
    graphEl['@_edgedefault'] === 'undirected' ? 'undirected' : 'directed';
  const graphDataMap = getDataElements(graphEl.data, definitions, 'graph');
  const graphData =
    graphDataMap.graphData !== undefined
      ? getParsedJSON(graphDataMap.graphData)
      : undefined;

  // Standard GraphML nests subgraphs as <node><graph>…</graph></node> and
  // allows edges inside nested <graph> elements. Collect nodes (with their
  // structural parent) and edges iteratively; node ids are document-global,
  // so edge endpoint resolution is unaffected by nesting depth.
  const nodeEntries: Array<{ el: any; structuralParentId: string | null }> = [];
  const edgeEntries: Array<{ el: any; mode: Graph['mode'] }> = [];
  const pending = [{ el: graphEl, parentId: null as string | null, mode: graphType as Graph['mode'] }];
  while (pending.length) {
    const current = pending.pop()!;
    if (getArray(current.el.hyperedge).length) throw new Error('GraphML: hyperedges cannot be projected faithfully to Graph');
    const mode = current.el['@_edgedefault'] === 'undirected' ? 'undirected'
      : current.el['@_edgedefault'] === 'directed' ? 'directed' : current.mode;
    for (const nodeEl of getArray<any>(current.el.node)) {
      nodeEntries.push({ el: nodeEl, structuralParentId: current.parentId });
      for (const child of getArray(nodeEl.graph)) pending.push({ el: child, parentId: String(nodeEl['@_id']), mode });
    }
    edgeEntries.push(...getArray(current.el.edge).map((el) => ({ el, mode })));
  }
  const edgeEls = edgeEntries.map((entry) => entry.el);

  const nodes: GraphNode[] = nodeEntries.map(({ el: nodeEl, structuralParentId }) => {
    const dataMap = getDataElements(nodeEl.data, definitions, 'node');
    const id = String(nodeEl['@_id']);
    const node: GraphNode = {
      type: 'node',
      id,
      // Own-dialect <data key="parentId"> takes precedence over structural
      // nesting in standard-GraphML subgraphs.
      parentId: dataMap.parentId ?? structuralParentId,
      initialNodeId: dataMap.initialNodeId ?? null,
      label: getLabel(dataMap),
      data:
        dataMap.data !== undefined ? getParsedJSON(dataMap.data) : undefined,
    };

    if (dataMap.x !== undefined) node.x = getNumber(dataMap.x, 'x', 'node', id);
    if (dataMap.y !== undefined) node.y = getNumber(dataMap.y, 'y', 'node', id);
    if (dataMap.width !== undefined) {
      node.width = getNumber(dataMap.width, 'width', 'node', id);
    }
    if (dataMap.height !== undefined) {
      node.height = getNumber(dataMap.height, 'height', 'node', id);
    }
    if (dataMap.shape !== undefined) node.shape = dataMap.shape;
    if (dataMap.color !== undefined) node.color = dataMap.color;
    if (dataMap.style !== undefined) node.style = getParsedJSON(dataMap.style);
    if (dataMap.ports !== undefined) {
      // Own-dialect <data key="ports"> JSON takes precedence over native
      // <port> elements.
      node.ports = getParsedJSON(dataMap.ports);
      if (getPrivateData(dataMap._stately)?.nativePorts && nodeEl.port !== undefined) {
        const original = new Map(node.ports?.map((port) => [port.name,port]) ?? []);
        node.ports = getPorts(nodeEl.port,definitions)?.map((native) => {
          const port = {...original.get(native.name),...native};
          port.direction = original.get(native.name)?.direction ?? native.direction;
          for (const key of ['label','x','y','width','height','style'] as const) if (native[key] === undefined) delete port[key];
          return port;
        });
      }
    } else if (nodeEl.port !== undefined) {
      node.ports = getPorts(nodeEl.port, definitions);
    }

    node.data = createFormatData(node.data, 'graphml', getNativeMetadata(nodeEl.data, definitions, 'node'));
    return node;
  });
  // All explicit edge ids, so synthesized ids can never collide with them.
  const usedEdgeIds = new Set<string>(
    edgeEls
      .filter((edgeEl: any) => edgeEl['@_id'] != null)
      .map((edgeEl: any) => String(edgeEl['@_id'])),
  );

  const edges: GraphEdge[] = edgeEntries.map(({ el: edgeEl, mode: containingMode }, i: number) => {
    const dataMap = getDataElements(edgeEl.data, definitions, 'edge');
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
      label: getLabel(dataMap),
      data:
        dataMap.data !== undefined ? getParsedJSON(dataMap.data) : undefined,
    };

    if (dataMap.weight !== undefined) {
      edge.weight = getNumber(dataMap.weight, 'weight', 'edge', id);
    }
    if (dataMap.points !== undefined) {
      edge.points = getParsedJSON(dataMap.points);
    }
    if (dataMap.routing !== undefined) {
      edge.routing = dataMap.routing as GraphEdge['routing'];
    }
    if (dataMap.x !== undefined) edge.x = getNumber(dataMap.x, 'x', 'edge', id);
    if (dataMap.y !== undefined) edge.y = getNumber(dataMap.y, 'y', 'edge', id);
    if (dataMap.width !== undefined) {
      edge.width = getNumber(dataMap.width, 'width', 'edge', id);
    }
    if (dataMap.height !== undefined) {
      edge.height = getNumber(dataMap.height, 'height', 'edge', id);
    }
    if (dataMap.color !== undefined) edge.color = dataMap.color;
    if (dataMap.style !== undefined) edge.style = getParsedJSON(dataMap.style);
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
      const value = String(directedAttr).trim();
      if (!['false', 'true', '0', '1'].includes(value)) throw new Error(`GraphML: invalid directed boolean ${value}`);
      edge.mode = value === 'false' || value === '0' ? 'undirected' : 'directed';
    }

    if (directedAttr === undefined && containingMode !== graphType) edge.mode = containingMode;
    const privateData = getPrivateData(dataMap._stately);
    if (privateData?.mode && (directedAttr === undefined ? null : String(directedAttr)) === privateData.nativeDirected) edge.mode = privateData.mode;
    edge.data = createFormatData(edge.data, 'graphml', getNativeMetadata(edgeEl.data, definitions, 'edge'));
    return edge;
  });

  const nativeKeyIds = new Set([...nodes.flatMap((node) => [...(getFormatMetadata(node.data,'graphml')?.values ?? []), ...(node.ports ?? []).flatMap((port) => getFormatMetadata(port.data,'graphml')?.values ?? [])]), ...edges.flatMap((edge) => getFormatMetadata(edge.data,'graphml')?.values ?? []), ...(getNativeMetadata(graphEl.data,definitions,'graph').values ?? [])].map((value:any) => String(value['@_key'])));
  const nativeDefinitions = definitions.filter((key) => nativeKeyIds.has(String(key['@_id'])) || !getKnownDataNames('all').has(key['@_attr.name'] ?? key['@_id']));
  const graph: Graph = {
    id: String(graphEl['@_id'] ?? ''),
    mode: getPrivateData(graphDataMap._stately)?.mode === 'bidirectional' && graphEl['@_edgedefault'] === getPrivateData(graphDataMap._stately)?.nativeDefault ? 'bidirectional' : graphType,
    initialNodeId: graphDataMap.graphInitialNodeId ?? null,
    nodes,
    edges,
    data: createFormatData(graphData, 'graphml', { ...(nativeDefinitions.length && {keys:nativeDefinitions}), ...getNativeMetadata(graphEl.data, definitions, 'graph') }),
  };

  if (graphDataMap.direction !== undefined) {
    graph.direction = getDirection(graphDataMap.direction);
  }
  if (graphDataMap.graphStyle !== undefined) {
    graph.style = getParsedJSON(graphDataMap.graphStyle);
  }

  return graph;
}

function getArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

function getKnownDataNames(kind: string): Set<string> {
  const names = new Set(kind === 'graph' ? ['_stately'] : ['label', 'data', 'style', 'x', 'y', 'width', 'height', 'color', '_stately']);
  if (kind === 'port') names.delete('color');
  if (kind === 'node' || kind === 'all') for (const name of ['parentId', 'initialNodeId', 'shape', 'ports']) names.add(name);
  if (kind === 'edge' || kind === 'all') for (const name of ['weight', 'points', 'routing', 'sourcePort', 'targetPort']) names.add(name);
  if (kind === 'graph' || kind === 'all') for (const name of ['graphData', 'graphInitialNodeId', 'graphStyle', 'direction']) names.add(name);
  return names;
}

function getDataName(id: string, definitions: any[], kind: string): string | undefined {
  const definition = definitions.find((key) => String(key['@_id']) === id);
  if (definition && !['all', kind].includes(definition['@_for'] ?? 'all')) return undefined;
  // Own-dialect graph keys have distinct IDs but intentionally repeated names.
  if (kind === 'graph' && ['graphData', 'graphInitialNodeId', 'graphStyle'].includes(id)) return id;
  const name = definition?.['@_attr.name'] ?? id;
  if (kind === 'graph' && name === 'data') return 'graphData';
  if (kind === 'graph' && name === 'style') return 'graphStyle';
  if (kind === 'graph' && name === 'initialNodeId') return 'graphInitialNodeId';
  return String(name);
}

function getDataElements(dataEls: any, definitions: any[], kind: string): Record<string, string> {
  const map: Record<string, string> = Object.create(null);
  for (const key of definitions) {
    const name = getDataName(String(key['@_id']), definitions, kind);
    if (name && key.default !== undefined) map[name] = String(typeof key.default === 'object' ? key.default['#text'] ?? '' : key.default);
  }
  for (const dataEl of getArray<any>(dataEls)) {
    if (dataEl?.['@_key'] != null) {
      const name = getDataName(String(dataEl['@_key']), definitions, kind);
      if (name) map[name] = String(dataEl['#text'] ?? '');
    }
  }
  return map;
}

function getNativeMetadata(dataEls: any, definitions: any[], kind: string): Record<string, any> {
  const known = getKnownDataNames(kind);
  const values = getArray<any>(dataEls).filter((el) => !known.has(getDataName(String(el['@_key']), definitions, kind) ?? ''));
  return values.length ? { values } : {};
}

function getPrivateData(value: string | undefined): any {
  if (value === undefined) return undefined;
  const parsed = getParsedJSON(value);
  return parsed?.format === 'stately' && parsed.version === 1 ? parsed : undefined;
}

function getLabel(map: Record<string, string>): string | null {
  return map.label === undefined && getPrivateData(map._stately)?.nullLabel ? null : map.label ?? '';
}

function getParsedJSON(str: string): any {
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
function getPorts(portEls: any, definitions: any[]): GraphNode['ports'] {
  const ports: NonNullable<GraphNode['ports']> = [];
  const pending = getArray<any>(portEls).reverse().map((el) => ({el,parent:undefined as string | undefined}));
  while (pending.length) {
    const {el,parent} = pending.pop()!;
    if (el?.['@_name'] == null) continue;
    const name = String(el['@_name']);
    const values = getDataElements(el.data,definitions,'port');
    const fields: Record<string,any> = {};
    for (const key of ['x','y','width','height']) if (values[key] !== undefined) fields[key] = getNumber(values[key],key,'node',name);
    if (values.style !== undefined) fields.style = getParsedJSON(values.style);
    ports.push({name,direction:'inout',...fields,
      ...(values.label !== undefined && el.desc === undefined && {label:values.label}),
      ...(el.desc !== undefined && {label:String(typeof el.desc === 'object' ? el.desc['#text'] ?? '' : el.desc)}),
      data:createFormatData(values.data !== undefined ? getParsedJSON(values.data) : null,'graphml',{...getNativeMetadata(el.data,definitions,'port'),...(parent !== undefined && {parentPort:parent})}),
    });
    for (const child of getArray(el.port).reverse()) pending.push({el:child,parent:name});
  }
  return ports;
}

function getNativePorts(ports: NonNullable<GraphNode['ports']>, getData: (data: unknown) => any[]): any[] {
  const entries = ports.map((port) => {
    const data = getData(port.data);
    const userData = getUserData(port.data,'graphml');
    if (userData !== undefined && userData !== null) data.push({'@_key':'data','#text':JSON.stringify(userData)});
    for (const key of ['x','y','width','height'] as const) if (port[key] !== undefined) data.push({'@_key':key,'#text':port[key]});
    if (port.style !== undefined) data.push({'@_key':'style','#text':JSON.stringify(port.style)});
    return {'@_name':port.name,...(port.label != null && {desc:port.label}),...(data.length && {data})};
  });
  const index = new Map(entries.map((entry) => [entry['@_name'],entry as any]));
  const complete = new Set<string>();
  const parents = new Map(ports.map((port) => [port.name,getFormatMetadata(port.data,'graphml')?.parentPort]));
  for (const port of ports) {
    const path = new Set<string>();
    let current: string | undefined = port.name;
    while (current !== undefined && index.has(current) && !complete.has(current)) {
      if (path.has(current)) throw new Error('GraphML: cyclic preserved port hierarchy');
      path.add(current); current = parents.get(current);
    }
    for (const name of path) complete.add(name);
  }
  const roots: any[] = [];
  for (let i=0;i<ports.length;i++) {
    const parent = getFormatMetadata(ports[i].data,'graphml')?.parentPort;
    if (parent !== undefined && parent !== ports[i].name && index.has(parent)) {
      const container = index.get(parent)!;
      (container.port ??= []).push(entries[i]);
    } else roots.push(entries[i]);
  }
  return roots;
}

function getNumber(
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

function getDirection(value: string): Graph['direction'] {
  return ['up', 'down', 'left', 'right'].includes(value)
    ? (value as Graph['direction'])
    : undefined;
}

/** Bidirectional converter for GraphML XML format. */
export const graphmlConverter: GraphFormatConverter<string> =
  createFormatConverter(toGraphML, fromGraphML);

/** Exact native source with a partial Graph projection and verified literal-label patches. */
export const graphMLDocumentConverter = createGraphDocumentConverter({
  format: 'graphml',
  codec: { from: fromGraphML, to: toGraphML },
  project: (source) => getXMLDocumentProjection(source, 'graphml', fromGraphML),
  patch: (context) => getXMLDocumentPatch(context, 'graphml'),
});
