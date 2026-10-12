import { getStandardXML, getValidatedXMLValue } from '../xml-standard';
import { createGraphDocumentConverter } from '../document';
import { getXMLDocumentPatch, getXMLDocumentProjection } from '../xml-document';
import { XMLBuilder, XMLParser, XMLValidator } from 'fast-xml-parser';
import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import { getEdgeMode } from '../../mode';
import { createFormatData, getFormatMetadata, getNormalizedXML, getUserData } from '../xml-preservation';

// --- GEXF (Graph Exchange XML Format, https://gexf.net/) ---

export interface GEXFExportOptions {
  /** Published 1.3 XSD profile: core-namespace viz and an explicit root metadata carrier. */
  standard?: boolean;
}
export interface GEXFImportOptions {
  /** Interpret the standard export profile's discriminated root description carrier. */
  standard?: boolean;
}

export function toGEXF(graph: Graph, options: GEXFExportOptions = {}): string {
  // Attribute declarations
  const nodeAttrs = [
    { '@_id': 'a_parentId', '@_title': 'parentId', '@_type': 'string' },
    { '@_id': 'a_initialNodeId', '@_title': 'initialNodeId', '@_type': 'string' },
    { '@_id': 'a_data', '@_title': 'data', '@_type': 'string' },
    { '@_id': 'a_shape', '@_title': 'shape', '@_type': 'string' },
    { '@_id': 'a_width', '@_title': 'width', '@_type': 'double' },
    { '@_id': 'a_height', '@_title': 'height', '@_type': 'double' },
    { '@_id': 'a_style', '@_title': 'style', '@_type': 'string' },
    { '@_id': 'a_ports', '@_title': 'ports', '@_type': 'string' },
    { '@_id': 'a_private', '@_title': '_stately', '@_type': 'string' },
    { '@_id': 'a_color', '@_title': '_statelyColor', '@_type': 'string' },
  ];

  const edgeAttrs = [
    { '@_id': 'a_edgeData', '@_title': 'data', '@_type': 'string' },
    { '@_id': 'a_edgeWeight', '@_title': 'weight', '@_type': 'double' },
    { '@_id': 'a_edgeX', '@_title': 'x', '@_type': 'double' },
    { '@_id': 'a_edgeY', '@_title': 'y', '@_type': 'double' },
    { '@_id': 'a_edgeWidth', '@_title': 'width', '@_type': 'double' },
    { '@_id': 'a_edgeHeight', '@_title': 'height', '@_type': 'double' },
    { '@_id': 'a_edgeStyle', '@_title': 'style', '@_type': 'string' },
    { '@_id': 'a_edgePoints', '@_title': 'points', '@_type': 'string' },
    { '@_id': 'a_edgeRouting', '@_title': 'routing', '@_type': 'string' },
    { '@_id': 'a_sourcePort', '@_title': 'sourcePort', '@_type': 'string' },
    { '@_id': 'a_targetPort', '@_title': 'targetPort', '@_type': 'string' },
    { '@_id': 'a_edgePrivate', '@_title': '_stately', '@_type': 'string' },
    { '@_id': 'a_edgeColor', '@_title': '_statelyColor', '@_type': 'string' },
  ];

  const native = getFormatMetadata(graph.data, 'gexf');
  const nativeAttrIds = new Map<string, string>();
  for (const block of native?.attributes ?? []) {
    const declarations = block['@_class'] === 'edge' ? edgeAttrs : nodeAttrs;
    for (const declaration of getArray<any>(block.attribute)) {
      let id = String(declaration['@_id']);
      while (declarations.some((known) => known['@_id'] === id)) id = `native_${id}`;
      nativeAttrIds.set(`${block['@_class']}:${declaration['@_id']}`, id);
      declarations.push({ ...declaration, '@_id': id });
    }
  }
  const getNativeValues = (data: unknown, kind: string): any[] => (getFormatMetadata(data, 'gexf')?.values ?? [])
    .map((value: any) => ({ ...value, '@_for': nativeAttrIds.get(`${kind}:${value['@_for']}`) ?? value['@_for'] }));
  const nodes = graph.nodes.map((n) => {
    const attvalues: any[] = [];
    if (n.parentId != null)
      attvalues.push({ '@_for': 'a_parentId', '@_value': n.parentId });
    if (n.initialNodeId != null)
      attvalues.push({
        '@_for': 'a_initialNodeId',
        '@_value': n.initialNodeId,
      });
    if (getUserData(n.data, 'gexf') !== undefined)
      attvalues.push({
        '@_for': 'a_data',
        '@_value': JSON.stringify(getUserData(n.data, 'gexf')),
      });
    if (n.shape !== undefined)
      attvalues.push({ '@_for': 'a_shape', '@_value': n.shape });
    if (n.width !== undefined) {
      attvalues.push({ '@_for': 'a_width', '@_value': n.width });
    }
    if (n.height !== undefined) {
      attvalues.push({ '@_for': 'a_height', '@_value': n.height });
    }
    if (n.style !== undefined) {
      attvalues.push({
        '@_for': 'a_style',
        '@_value': JSON.stringify(n.style),
      });
    }
    if (n.ports !== undefined) {
      attvalues.push({
        '@_for': 'a_ports',
        '@_value': JSON.stringify(n.ports),
      });
    }

    const presence = { format: 'stately', version: 1, ...(n.label === null && { nullLabel: true }),
      absentGeometry: ['x', 'y', 'width', 'height'].filter((key) => (n as any)[key] === undefined) };
    attvalues.push({ '@_for': 'a_private', '@_value': JSON.stringify(presence) });
    if (n.color !== undefined) attvalues.push({ '@_for': 'a_color', '@_value': JSON.stringify(n.color) });
    attvalues.push(...getNativeValues(n.data, 'node'));
    const extra = getFormatMetadata(n.data,'gexf')?.native ?? {};
    const node: any = {
      ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'z' && key !== 'alpha')),
      '@_id': n.id,
      // Omit null so an explicit native empty label remains authoritative.
      ...(n.label !== null && { '@_label': n.label ?? '' }),
    };
    if (n.parentId != null) node['@_pid'] = n.parentId;
    if (attvalues.length > 0) node.attvalues = { attvalue: attvalues };

    // Viz module
    if (n.color) {
      const getHex = n.color.replace('#', '');
      if (/^[0-9a-fA-F]{6}$/.test(getHex)) {
        node['viz:color'] = {
          '@_r': parseInt(getHex.slice(0, 2), 16),
          '@_g': parseInt(getHex.slice(2, 4), 16),
          '@_b': parseInt(getHex.slice(4, 6), 16),
          ...(extra.alpha !== undefined && { '@_a': extra.alpha }),
        };
      }
    }
    if (n.x !== undefined || n.y !== undefined) {
      node['viz:position'] = {
        '@_x': n.x ?? 0,
        '@_y': n.y ?? 0,
        ...(extra.z !== undefined && { '@_z': extra.z }),
      };
    }
    if (n.width !== undefined || n.height !== undefined) {
      node['viz:size'] = { '@_value': n.width ?? n.height ?? 0 };
    }

    return node;
  });

  const edges = graph.edges.map((e) => {
    const extra = getFormatMetadata(e.data,'gexf')?.native ?? {};
    const edge: any = {
      ...Object.fromEntries(Object.entries(extra).filter(([key]) => key !== 'z' && key !== 'alpha')),
      '@_id': e.id,
      '@_source': e.sourceId,
      '@_target': e.targetId,
    };
    // Per-edge directedness override. GEXF edges carry an optional `type`
    // attribute; emit it only when the edge differs from the graph default.
    // GEXF mutual represents bidirectional edges natively.
    const mode = getEdgeMode(graph, e);
    if (e.mode !== undefined || mode !== graph.mode) edge['@_type'] = mode === 'bidirectional' ? 'mutual' : mode;
    if (e.label != null) edge['@_label'] = e.label;
    if (getUserData(e.data, 'gexf') !== undefined) {
      edge.attvalues = {
        attvalue: [{ '@_for': 'a_edgeData', '@_value': JSON.stringify(getUserData(e.data, 'gexf')) }],
      };
    }
    const edgeAttvalues = edge.attvalues?.attvalue ?? [];
    if (e.label === null) edgeAttvalues.push({ '@_for': 'a_edgePrivate', '@_value': JSON.stringify({ format: 'stately', version: 1, nullLabel: true }) });
    if (e.color !== undefined) edgeAttvalues.push({ '@_for': 'a_edgeColor', '@_value': JSON.stringify(e.color) });
    edgeAttvalues.push(...getNativeValues(e.data, 'edge'));
    if (e.weight !== undefined) {
      edge['@_weight'] = e.weight;
    }
    if (e.points !== undefined) {
      edgeAttvalues.push({
        '@_for': 'a_edgePoints',
        '@_value': JSON.stringify(e.points),
      });
    }
    if (e.routing !== undefined) {
      edgeAttvalues.push({ '@_for': 'a_edgeRouting', '@_value': e.routing });
    }
    if (e.x !== undefined) {
      edgeAttvalues.push({ '@_for': 'a_edgeX', '@_value': e.x });
    }
    if (e.y !== undefined) {
      edgeAttvalues.push({ '@_for': 'a_edgeY', '@_value': e.y });
    }
    if (e.width !== undefined) {
      edgeAttvalues.push({ '@_for': 'a_edgeWidth', '@_value': e.width });
    }
    if (e.height !== undefined) {
      edgeAttvalues.push({ '@_for': 'a_edgeHeight', '@_value': e.height });
    }
    if (e.style !== undefined) {
      edgeAttvalues.push({
        '@_for': 'a_edgeStyle',
        '@_value': JSON.stringify(e.style),
      });
    }
    if (e.sourcePort !== undefined) {
      edgeAttvalues.push({
        '@_for': 'a_sourcePort',
        '@_value': e.sourcePort,
      });
    }
    if (e.targetPort !== undefined) {
      edgeAttvalues.push({
        '@_for': 'a_targetPort',
        '@_value': e.targetPort,
      });
    }
    if (edgeAttvalues.length > 0) {
      edge.attvalues = { attvalue: edgeAttvalues };
    }
    if (e.color) {
      const getHex = e.color.replace('#', '');
      if (/^[0-9a-fA-F]{6}$/.test(getHex)) {
        edge['viz:color'] = {
          '@_r': parseInt(getHex.slice(0, 2), 16),
          '@_g': parseInt(getHex.slice(2, 4), 16),
          '@_b': parseInt(getHex.slice(4, 6), 16),
          ...(extra.alpha !== undefined && { '@_a': extra.alpha }),
        };
      }
    }
    return edge;
  });

  if (options.standard) for (const entity of [...nodes, ...edges]) {
    for (const key of Object.keys(entity)) if (key.startsWith('viz:')) { entity[key.slice(4)] = entity[key]; delete entity[key]; }
  }
  const nativeMeta = native?.meta;
  let meta = nativeMeta;
  if (options.standard) {
    const descriptions = getArray<any>(nativeMeta?.description);
    if (descriptions.some((description) => getStandardRoot(description))) throw new Error('GEXF standard profile: reserved root description carrier collision');
    const root = { id: graph.id, initialNodeId: graph.initialNodeId, data: getUserData(graph.data, 'gexf'),
      ...(graph.direction !== undefined && {direction:graph.direction}), ...(graph.style !== undefined && {style:graph.style}) };
    meta = { ...nativeMeta, description: [...descriptions, JSON.stringify({format:'@statelyai/graph/gexf-root',version:1,root})] };
  }
  const obj: any = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    gexf: {
      '@_xmlns': 'http://gexf.net/1.3',
      ...(!options.standard && {'@_xmlns:viz': 'http://gexf.net/1.3/viz'}),
      '@_version': '1.3',
      ...(meta && { meta }),
      graph: {
        ...native?.graphAttributes,
        '@_defaultedgetype': graph.mode === 'bidirectional' ? 'mutual' : graph.mode,
        ...(!options.standard && graph.id && { '@_id': graph.id }),
        ...(!options.standard && graph.initialNodeId != null && { '@_initialNodeId': graph.initialNodeId }),
        ...(!options.standard && graph.direction && { '@_direction': graph.direction }),
        ...(!options.standard && getUserData(graph.data, 'gexf') !== undefined && {
          '@_data': JSON.stringify(getUserData(graph.data, 'gexf')),
        }),
        ...(!options.standard && graph.style !== undefined && {
          '@_style': JSON.stringify(graph.style),
        }),
        attributes: [
          { '@_class': 'node', attribute: nodeAttrs },
          { '@_class': 'edge', attribute: edgeAttrs },
        ],
        nodes: { node: nodes },
        edges: { edge: edges },
      },
    },
  };

  const builder = new XMLBuilder({
    ignoreAttributes: false,
    // Formatting inserts whitespace into unknown mixed-content XML.
    format: false,
    suppressEmptyNode: true,
  });

  if (options.standard) getValidatedXMLValue(obj);
  const output = builder.build(obj);
  return options.standard ? getStandardXML(output) : output;
}

export function fromGEXF(xml: string, options: GEXFImportOptions = {}): Graph {
  if (typeof xml !== 'string') {
    throw new Error('GEXF: expected a string');
  }
  const validation = XMLValidator.validate(xml);
  if (validation !== true) throw new Error(`GEXF: invalid XML — ${validation.err.msg}`);
  const parser = new XMLParser({
    ignoreAttributes: false,
    // Required by this peer to decode standard XML numeric character references.
    htmlEntities: true,
    isArray: (name) =>
      ['node', 'edge', 'attribute', 'attvalue', 'attributes'].includes(name.split(':').pop()!),
    parseTagValue: false,
    // Keep attribute text verbatim: labels like "  hi  " must not be trimmed.
    // Numeric fields are parsed explicitly.
    trimValues: false,
  });

  let parsed: any;
  try {
    parsed = getNormalizedXML(parser.parse(xml), 'http://gexf.net/1.3');
  } catch (e: any) {
    throw new Error(`GEXF: invalid XML — ${e.message}`);
  }
  if (!parsed?.gexf) parsed = getNormalizedXML(parser.parse(xml), 'http://gexf.net/1.2draft');
  if (!parsed?.gexf) parsed = getNormalizedXML(parser.parse(xml), 'http://www.gexf.net/1.2draft');
  const gexf = parsed?.gexf;
  if (!gexf) {
    throw new Error('GEXF: missing <gexf> root element');
  }
  const graphEl = gexf.graph;
  if (!graphEl) {
    throw new Error('GEXF: missing <graph> element');
  }

  let nativeMeta = gexf.meta;
  let root: any;
  if (options.standard && nativeMeta) {
    const descriptions = getArray<any>(nativeMeta.description);
    const roots = descriptions.map(getStandardRoot).filter(Boolean);
    if (roots.length > 1) throw new Error('GEXF standard profile: ambiguous root description carriers');
    root = roots[0];
    if (root) {
      const rest = descriptions.filter((description) => !getStandardRoot(description));
      nativeMeta = { ...nativeMeta };
      if (rest.length) nativeMeta.description = rest.length === 1 ? rest[0] : rest;
      else delete nativeMeta.description;
      if (!Object.keys(nativeMeta).length) nativeMeta = undefined;
    }
  }
  const graphType: Graph['mode'] = graphEl['@_defaultedgetype'] === 'mutual' ? 'bidirectional'
    : graphEl['@_defaultedgetype'] === 'directed' ? 'directed' : 'undirected';

  // Build attribute ID → title map
  const nodeAttrMap = new Map<string, string>();
  const edgeAttrMap = new Map<string, string>();
  const nativeBlocks: any[] = [];
  for (const block of getArray(graphEl.attributes)) {
    for (const attr of getArray(block?.attribute)) {
      if (attr?.['@_id'] && attr?.['@_title']) {
        (block['@_class'] === 'edge' ? edgeAttrMap : nodeAttrMap).set(String(attr['@_id']), String(attr['@_title']));
      }
    }
  }

  for (const block of getArray<any>(graphEl.attributes)) {
    const attribute = getArray<any>(block.attribute).filter((attr) => !getKnownAttributes(block['@_class'] === 'edge' ? 'edge' : 'node').has(String(attr['@_title'])));
    if (attribute.length) nativeBlocks.push({ ...block, attribute });
  }
  // Parse nodes
  const nodes: GraphNode[] = [];
  function addNodes(nodeEls: any, parentId: string | null) {
    for (const n of getArray(nodeEls)) {
      const attvals = getAttValues(n, nodeAttrMap, getArray<any>(graphEl.attributes).filter((block) => block['@_class'] === 'node'));
      const id = String(n['@_id']);

      // pid attribute takes precedence, then attvalue, then structural parent
      const pid = n['@_pid'] != null ? String(n['@_pid']) : null;

      const node: GraphNode = {
        type: 'node',
        id,
        parentId: pid ?? attvals['parentId'] ?? parentId,
        initialNodeId: attvals['initialNodeId'] ?? null,
        label: getLabel(n['@_label'], attvals['_stately']),
        data:
          attvals['data'] !== undefined
            ? getParsedJSON(attvals['data'])
            : undefined,
      };
      if (attvals['shape'] !== undefined) (node as any).shape = attvals['shape'];
      if (attvals['style'] !== undefined) {
        node.style = getParsedJSON(attvals['style']);
      }
      if (attvals['ports'] !== undefined) {
        node.ports = getParsedJSON(attvals['ports']);
      }

      // Viz properties
      const pos = (n['viz:position'] ?? n.position);
      if (pos) {
        node.x = getNumber(pos['@_x'] ?? 0, '<viz:position> x', 'node', id);
        node.y = getNumber(pos['@_y'] ?? 0, '<viz:position> y', 'node', id);
      }
      const size = (n['viz:size'] ?? n.size);
      if (size) {
        node.width = getNumber(size['@_value'] ?? 0, '<viz:size>', 'node', id);
        node.height = node.width;
      }
      if (attvals['width'] !== undefined) {
        node.width = getNumber(attvals['width'], 'width attribute', 'node', id);
      }
      if (attvals['height'] !== undefined) {
        node.height = getNumber(
          attvals['height'],
          'height attribute',
          'node',
          id,
        );
      }
      const color = (n['viz:color'] ?? n.color);
      if (color) {
        const r = Number(color['@_r'] ?? 0);
        const g = Number(color['@_g'] ?? 0);
        const b = Number(color['@_b'] ?? 0);
        node.color = color['@_hex'] ?? `#${getHex(r)}${getHex(g)}${getHex(b)}`;
      }

      const privateData = getPrivateData(attvals['_stately']);
      for (const key of privateData?.absentGeometry ?? []) {
        // Only suppress the values fabricated by our own exporter, never edits.
        const fallback = key === 'height' ? node.width : key === 'width' ? node.height : 0;
        if ((node as any)[key] === fallback) delete (node as any)[key];
      }
      if (attvals['_statelyColor'] !== undefined) {
        const original = getParsedJSON(attvals['_statelyColor']);
        if (!color || getColor(original) === node.color?.toLowerCase()) node.color = original;
      }
      if ((n['viz:shape'] ?? n.shape)?.['@_value'] !== undefined && !attvals['shape']) node.shape = (n['viz:shape'] ?? n.shape)['@_value'];
      node.data = createFormatData(node.data, 'gexf', getNativeMetadata(n, nodeAttrMap,'node'));
      nodes.push(node);

      // Handle nested hierarchy (GEXF 1.2+ style)
      const nested = n.nodes?.node ?? n.node;
      if (nested) {
        addNodes(nested, id);
      }
    }
  }

  const nodeEls = graphEl.nodes?.node ?? graphEl.node;
  addNodes(nodeEls, null);

  // Parse edges
  const edgeEls = graphEl.edges?.edge ?? graphEl.edge;
  const edges: GraphEdge[] = getArray(edgeEls).map((e: any, i: number) => {
    const attvals = getAttValues(e, edgeAttrMap, getArray<any>(graphEl.attributes).filter((block) => block['@_class'] === 'edge'));
    const id = String(e['@_id'] ?? `e${i}`);
    const edge: GraphEdge = {
      type: 'edge',
      id,
      sourceId: String(e['@_source']),
      targetId: String(e['@_target']),
      label: getLabel(e['@_label'], attvals['_stately']),
      data:
        attvals['data'] !== undefined
          ? getParsedJSON(attvals['data'])
          : undefined,
      ...((e['@_weight'] !== undefined || attvals['weight'] !== undefined) && {
        weight: getNumber(e['@_weight'] ?? attvals['weight'], 'weight attribute', 'edge', id),
      }),
      ...(attvals['points'] !== undefined && {
        points: getParsedJSON(attvals['points']),
      }),
      ...(attvals['routing'] !== undefined && {
        routing: attvals['routing'] as GraphEdge['routing'],
      }),
      ...(attvals['x'] !== undefined && {
        x: getNumber(attvals['x'], 'x attribute', 'edge', id),
      }),
      ...(attvals['y'] !== undefined && {
        y: getNumber(attvals['y'], 'y attribute', 'edge', id),
      }),
      ...(attvals['width'] !== undefined && {
        width: getNumber(attvals['width'], 'width attribute', 'edge', id),
      }),
      ...(attvals['height'] !== undefined && {
        height: getNumber(attvals['height'], 'height attribute', 'edge', id),
      }),
      ...(attvals['style'] !== undefined && {
        style: getParsedJSON(attvals['style']),
      }),
      ...(attvals['sourcePort'] !== undefined && {
        sourcePort: attvals['sourcePort'],
      }),
      ...(attvals['targetPort'] !== undefined && {
        targetPort: attvals['targetPort'],
      }),
    };
    const color = (e['viz:color'] ?? e.color);
    if (color) {
      const r = Number(color['@_r'] ?? 0);
      const g = Number(color['@_g'] ?? 0);
      const b = Number(color['@_b'] ?? 0);
      edge.color = color['@_hex'] ?? `#${getHex(r)}${getHex(g)}${getHex(b)}`;
    }
    // Per-edge directedness override from the GEXF `type` attribute.
    const typeAttr = e['@_type'];
    if (typeAttr !== undefined) {
      edge.mode = typeAttr === 'mutual' ? 'bidirectional' : typeAttr === 'undirected' ? 'undirected' : 'directed';
    }
    if (attvals['_statelyColor'] !== undefined) {
      const original = getParsedJSON(attvals['_statelyColor']);
      if (!color || getColor(original) === edge.color?.toLowerCase()) edge.color = original;
    }
    edge.data = createFormatData(edge.data, 'gexf', getNativeMetadata(e, edgeAttrMap,'edge'));
    return edge;
  });

  return {
    id: String(graphEl['@_id'] ?? root?.id ?? ''),
    mode: graphType,
    initialNodeId: graphEl['@_initialNodeId'] ?? root?.initialNodeId ?? null,
    nodes,
    edges,
    data: createFormatData(graphEl['@_data'] !== undefined ? getParsedJSON(String(graphEl['@_data'])) : root?.data, 'gexf', { ...(nativeMeta && { meta: nativeMeta }), ...(nativeBlocks.length && { attributes: nativeBlocks }), ...(Object.keys(graphEl).some((key) => ['@_mode','@_timeformat','@_start','@_end','@_timestamp','@_timezone','@_timerepresentation','@_idtype'].includes(key)) && {graphAttributes:Object.fromEntries(Object.entries(graphEl).filter(([key]) => ['@_mode','@_timeformat','@_start','@_end','@_timestamp','@_timezone','@_timerepresentation','@_idtype'].includes(key)))}) }),
    ...((graphEl['@_direction'] ?? root?.direction) !== undefined && { direction: graphEl['@_direction'] ?? root?.direction }),
    ...((graphEl['@_style'] !== undefined || root?.style !== undefined) && {
      style: graphEl['@_style'] !== undefined ? getParsedJSON(String(graphEl['@_style'])) : root.style,
    }),
  };
}

// --- Helpers ---

function getArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

function getAttValues(
  el: any,
  attrMap: Map<string, string>,
  blocks: any[] = [],
): Record<string, string> {
  const result: Record<string, string> = Object.create(null);
  for (const block of blocks) for (const attr of getArray<any>(block.attribute)) {
    if (attr.default !== undefined) result[String(attr['@_title'])] = String(typeof attr.default === 'object' ? attr.default['#text'] ?? '' : attr.default);
  }
  const attvalues = el?.attvalues?.attvalue;
  for (const av of getArray(attvalues)) {
    if (av?.['@_for'] != null) {
      const title = attrMap.get(String(av['@_for'])) ?? av['@_for'];
      result[title] = String(av['@_value'] ?? '');
    }
  }
  return result;
}

function getParsedJSON(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function getNumber(
  value: any,
  field: string,
  kind: 'node' | 'edge',
  ownerId: string,
): number {
  const parsed = Number(value);
  if (Number.isNaN(parsed)) {
    throw new Error(
      `GEXF: ${field} value "${value}" on ${kind} "${ownerId}" is not a number. Fix the value or remove the attribute.`,
    );
  }
  return parsed;
}

function getHex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

/** Bidirectional converter for GEXF (Graph Exchange XML Format). */
export const gexfConverter: GraphFormatConverter<string> =
  createFormatConverter(toGEXF, fromGEXF);

function getKnownAttributes(kind: 'node' | 'edge'): Set<string> {
  return new Set(kind === 'node' ? ['parentId','initialNodeId','data','shape','width','height','style','ports','_stately','_statelyColor'] : ['data','weight','x','y','width','height','style','points','routing','sourcePort','targetPort','_stately','_statelyColor']);
}

function getNativeMetadata(el: any, declarations: Map<string, string>, kind: 'node' | 'edge'): Record<string, any> {
  const values = getArray<any>(el.attvalues?.attvalue).filter((value) => !getKnownAttributes(kind).has(declarations.get(String(value['@_for'])) ?? String(value['@_for'])));
  const extra: Record<string, any> = {};
  for (const [key, value] of Object.entries(el)) {
    if (['@_start', '@_end', '@_timestamp', '@_timestamps', '@_intervals', '@_kind', 'spells', 'parents', 'viz:thickness', 'viz:shape'].includes(key)) extra[key] = value;
  }
  const position = el['viz:position'] ?? el.position, color = el['viz:color'] ?? el.color;
  if (position?.['@_z'] !== undefined) extra.z = position['@_z'];
  if (color?.['@_a'] !== undefined) extra.alpha = color['@_a'];
  if (el.shape !== undefined) extra['viz:shape'] = el.shape;
  if (el.thickness !== undefined) extra['viz:thickness'] = el.thickness;
  return { ...(values.length && { values }), ...(Object.keys(extra).length && { native: extra }) };
}

function getPrivateData(value: string | undefined): any {
  const parsed = value === undefined ? undefined : getParsedJSON(value);
  return parsed?.format === 'stately' && parsed.version === 1 ? parsed : undefined;
}

function getLabel(value: string | undefined, metadata: string | undefined): string | null {
  return (value === undefined && getPrivateData(metadata)?.nullLabel) ? null : value ?? '';
}

function getColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#?[0-9a-fA-F]{6}$/.test(value) ? `#${value.replace('#','').toLowerCase()}` : undefined;
}

/** Exact native source with a partial Graph projection and verified literal-label patches. */
export const gexfDocumentConverter = createGraphDocumentConverter({
  format: 'gexf',
  codec: { from: fromGEXF, to: toGEXF },
  project: (source) => getXMLDocumentProjection(source, 'gexf', fromGEXF),
  patch: (context) => getXMLDocumentPatch(context, 'gexf'),
});

function getStandardRoot(value: unknown): any {
  const text = typeof value === 'string' ? value : value && typeof value === 'object' ? (value as any)['#text'] : undefined;
  if (typeof text !== 'string') return undefined;
  const parsed = getParsedJSON(text);
  return parsed?.format === '@statelyai/graph/gexf-root' && parsed.version === 1 && parsed.root && typeof parsed.root === 'object' && !Array.isArray(parsed.root) && typeof parsed.root.id === 'string' ? parsed.root : undefined;
}
