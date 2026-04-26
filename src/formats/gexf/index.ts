import { XMLBuilder, XMLParser } from 'fast-xml-parser';
import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';

// --- GEXF (Graph Exchange XML Format, https://gexf.net/) ---

export function toGEXF(graph: Graph): string {
  // Attribute declarations
  const nodeAttrs = [
    { '@_id': 'a_parentId', '@_title': 'parentId', '@_type': 'string' },
    { '@_id': 'a_initialNodeId', '@_title': 'initialNodeId', '@_type': 'string' },
    { '@_id': 'a_data', '@_title': 'data', '@_type': 'string' },
    { '@_id': 'a_shape', '@_title': 'shape', '@_type': 'string' },
    { '@_id': 'a_ports', '@_title': 'ports', '@_type': 'string' },
  ];

  const edgeAttrs = [
    { '@_id': 'a_edgeData', '@_title': 'data', '@_type': 'string' },
    { '@_id': 'a_sourcePort', '@_title': 'sourcePort', '@_type': 'string' },
    { '@_id': 'a_targetPort', '@_title': 'targetPort', '@_type': 'string' },
  ];

  const nodes = graph.nodes.map((n) => {
    const attvalues: any[] = [];
    if (n.parentId)
      attvalues.push({ '@_for': 'a_parentId', '@_value': n.parentId });
    if (n.initialNodeId)
      attvalues.push({
        '@_for': 'a_initialNodeId',
        '@_value': n.initialNodeId,
      });
    if (n.data !== undefined)
      attvalues.push({
        '@_for': 'a_data',
        '@_value': JSON.stringify(n.data),
      });
    if (n.shape)
      attvalues.push({ '@_for': 'a_shape', '@_value': n.shape });
    if (n.ports !== undefined) {
      attvalues.push({
        '@_for': 'a_ports',
        '@_value': JSON.stringify(n.ports),
      });
    }

    const node: any = {
      '@_id': n.id,
      '@_label': n.label || n.id,
    };
    if (n.parentId) node['@_pid'] = n.parentId;
    if (attvalues.length > 0) node.attvalues = { attvalue: attvalues };

    // Viz module
    if (n.color) {
      const hex = n.color.replace('#', '');
      if (hex.length === 6) {
        node['viz:color'] = {
          '@_r': parseInt(hex.slice(0, 2), 16),
          '@_g': parseInt(hex.slice(2, 4), 16),
          '@_b': parseInt(hex.slice(4, 6), 16),
        };
      }
    }
    if (n.x !== undefined || n.y !== undefined) {
      node['viz:position'] = {
        '@_x': n.x ?? 0,
        '@_y': n.y ?? 0,
      };
    }
    if (n.width !== undefined || n.height !== undefined) {
      node['viz:size'] = { '@_value': n.width ?? n.height ?? 0 };
    }

    return node;
  });

  const edges = graph.edges.map((e) => {
    const edge: any = {
      '@_id': e.id,
      '@_source': e.sourceId,
      '@_target': e.targetId,
    };
    if (e.label) edge['@_label'] = e.label;
    if (e.data !== undefined) {
      edge.attvalues = {
        attvalue: [{ '@_for': 'a_edgeData', '@_value': JSON.stringify(e.data) }],
      };
    }
    const edgeAttvalues = edge.attvalues?.attvalue ?? [];
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
      const hex = e.color.replace('#', '');
      if (hex.length === 6) {
        edge['viz:color'] = {
          '@_r': parseInt(hex.slice(0, 2), 16),
          '@_g': parseInt(hex.slice(2, 4), 16),
          '@_b': parseInt(hex.slice(4, 6), 16),
        };
      }
    }
    return edge;
  });

  const obj: any = {
    '?xml': { '@_version': '1.0', '@_encoding': 'UTF-8' },
    gexf: {
      '@_xmlns': 'http://gexf.net/1.3',
      '@_xmlns:viz': 'http://gexf.net/1.3/viz',
      '@_version': '1.3',
      graph: {
        '@_defaultedgetype': graph.type === 'directed' ? 'directed' : 'undirected',
        ...(graph.id && { '@_id': graph.id }),
        ...(graph.initialNodeId && { '@_initialNodeId': graph.initialNodeId }),
        ...(graph.direction && { '@_direction': graph.direction }),
        ...(graph.data !== undefined && {
          '@_data': JSON.stringify(graph.data),
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
    format: true,
    suppressEmptyNode: true,
  });

  return builder.build(obj);
}

export function fromGEXF(xml: string): Graph {
  if (typeof xml !== 'string') {
    throw new Error('GEXF: expected a string');
  }
  const parser = new XMLParser({
    ignoreAttributes: false,
    isArray: (name) =>
      ['node', 'edge', 'attribute', 'attvalue', 'attributes'].includes(name),
  });

  let parsed: any;
  try {
    parsed = parser.parse(xml);
  } catch (e: any) {
    throw new Error(`GEXF: invalid XML — ${e.message}`);
  }
  const gexf = parsed?.gexf;
  if (!gexf) {
    throw new Error('GEXF: missing <gexf> root element');
  }
  const graphEl = gexf.graph;
  if (!graphEl) {
    throw new Error('GEXF: missing <graph> element');
  }

  const graphType: 'directed' | 'undirected' =
    graphEl['@_defaultedgetype'] === 'undirected' ? 'undirected' : 'directed';

  // Build attribute ID → title map
  const attrMap = new Map<string, string>();
  for (const block of asArray(graphEl.attributes)) {
    for (const attr of asArray(block?.attribute)) {
      if (attr?.['@_id'] && attr?.['@_title']) {
        attrMap.set(attr['@_id'], attr['@_title']);
      }
    }
  }

  // Parse nodes
  const nodes: GraphNode[] = [];
  function parseNodes(nodeEls: any, parentId: string | null) {
    for (const n of asArray(nodeEls)) {
      const attvals = getAttValues(n, attrMap);
      const id = String(n['@_id']);

      // pid attribute takes precedence, then attvalue, then structural parent
      const pid = n['@_pid'] != null ? String(n['@_pid']) : null;

      const node: GraphNode = {
        type: 'node',
        id,
        parentId: pid ?? attvals['parentId'] ?? parentId,
        initialNodeId: attvals['initialNodeId'] ?? null,
        label: n['@_label'] ?? '',
        data:
          attvals['data'] !== undefined
            ? tryParseJSON(attvals['data'])
            : undefined,
      };
      if (attvals['shape']) (node as any).shape = attvals['shape'];
      if (attvals['ports'] !== undefined) {
        node.ports = tryParseJSON(attvals['ports']);
      }

      // Viz properties
      const pos = n['viz:position'];
      if (pos) {
        node.x = Number(pos['@_x'] ?? 0);
        node.y = Number(pos['@_y'] ?? 0);
      }
      const size = n['viz:size'];
      if (size) {
        node.width = Number(size['@_value'] ?? 0);
        node.height = Number(size['@_value'] ?? 0);
      }
      const color = n['viz:color'];
      if (color) {
        const r = Number(color['@_r'] ?? 0);
        const g = Number(color['@_g'] ?? 0);
        const b = Number(color['@_b'] ?? 0);
        node.color = `#${hex(r)}${hex(g)}${hex(b)}`;
      }

      nodes.push(node);

      // Handle nested hierarchy (GEXF 1.2+ style)
      const nested = n.nodes?.node ?? n.node;
      if (nested) {
        parseNodes(nested, id);
      }
    }
  }

  const nodeEls = graphEl.nodes?.node ?? graphEl.node;
  parseNodes(nodeEls, null);

  // Parse edges
  const edgeEls = graphEl.edges?.edge ?? graphEl.edge;
  const edges: GraphEdge[] = asArray(edgeEls).map((e: any, i: number) => {
    const attvals = getAttValues(e, attrMap);
    const edge: GraphEdge = {
      type: 'edge',
      id: String(e['@_id'] ?? `e${i}`),
      sourceId: String(e['@_source']),
      targetId: String(e['@_target']),
      label: e['@_label'] ?? '',
      data:
        attvals['data'] !== undefined
          ? tryParseJSON(attvals['data'])
          : undefined,
      ...(attvals['sourcePort'] !== undefined && {
        sourcePort: attvals['sourcePort'],
      }),
      ...(attvals['targetPort'] !== undefined && {
        targetPort: attvals['targetPort'],
      }),
    };
    const color = e['viz:color'];
    if (color) {
      const r = Number(color['@_r'] ?? 0);
      const g = Number(color['@_g'] ?? 0);
      const b = Number(color['@_b'] ?? 0);
      edge.color = `#${hex(r)}${hex(g)}${hex(b)}`;
    }
    return edge;
  });

  return {
    id: String(graphEl['@_id'] ?? ''),
    type: graphType,
    initialNodeId: graphEl['@_initialNodeId'] ?? null,
    nodes,
    edges,
    data:
      graphEl['@_data'] !== undefined
        ? tryParseJSON(String(graphEl['@_data']))
        : (undefined as any),
    ...(graphEl['@_direction'] && { direction: graphEl['@_direction'] }),
  };
}

// --- Helpers ---

function asArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

function getAttValues(
  el: any,
  attrMap: Map<string, string>,
): Record<string, string> {
  const result: Record<string, string> = {};
  const attvalues = el?.attvalues?.attvalue;
  for (const av of asArray(attvalues)) {
    if (av?.['@_for'] != null) {
      const title = attrMap.get(av['@_for']) ?? av['@_for'];
      result[title] = String(av['@_value'] ?? '');
    }
  }
  return result;
}

function tryParseJSON(str: string): any {
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

function hex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

/** Bidirectional converter for GEXF (Graph Exchange XML Format). */
export const gexfConverter: GraphFormatConverter<string> =
  createFormatConverter(toGEXF, fromGEXF);
