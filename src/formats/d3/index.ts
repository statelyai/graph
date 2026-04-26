import type { Graph, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';

// --- D3.js force-directed JSON types ---

export interface D3Node {
  id: string;
  [key: string]: any;
}

export interface D3Link {
  source: string;
  target: string;
  [key: string]: any;
}

export interface D3Graph {
  id?: string;
  type?: Graph['type'];
  initialNodeId?: string | null;
  data?: any;
  direction?: Graph['direction'];
  style?: Graph['style'];
  nodes: D3Node[];
  links: D3Link[];
  [key: string]: any;
}

// --- Conversion ---

/**
 * Converts a graph to D3.js force-directed format.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { toD3Graph } from '@statelyai/graph/formats/d3';
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
export function toD3Graph(graph: Graph): D3Graph {
  return {
    ...(graph.id && { id: graph.id }),
    type: graph.type,
    initialNodeId: graph.initialNodeId,
    ...(graph.data !== undefined && { data: graph.data }),
    ...(graph.direction && { direction: graph.direction }),
    ...(graph.style !== undefined && { style: graph.style }),
    nodes: graph.nodes.map((n) => {
      const node: D3Node = { id: n.id };
      if (n.parentId) node.parentId = n.parentId;
      if (n.initialNodeId) node.initialNodeId = n.initialNodeId;
      if (n.label) node.label = n.label;
      if (n.data !== undefined) node.data = n.data;
      if (n.x !== undefined) node.x = n.x;
      if (n.y !== undefined) node.y = n.y;
      if (n.width !== undefined) node.width = n.width;
      if (n.height !== undefined) node.height = n.height;
      if (n.color) node.color = n.color;
      if (n.shape) node.shape = n.shape;
      if (n.style !== undefined) node.style = n.style;
      if (n.ports !== undefined) node.ports = n.ports;
      return node;
    }),
    links: graph.edges.map((e) => {
      const link: D3Link = {
        source: e.sourceId,
        target: e.targetId,
      };
      if (e.id) link.id = e.id;
      if (e.label) link.label = e.label;
      if (e.data !== undefined) link.data = e.data;
      if (e.weight !== undefined) link.weight = e.weight;
      if (e.x !== undefined) link.x = e.x;
      if (e.y !== undefined) link.y = e.y;
      if (e.width !== undefined) link.width = e.width;
      if (e.height !== undefined) link.height = e.height;
      if (e.color) link.color = e.color;
      if (e.style !== undefined) link.style = e.style;
      if (e.sourcePort !== undefined) link.sourcePort = e.sourcePort;
      if (e.targetPort !== undefined) link.targetPort = e.targetPort;
      return link;
    }),
  };
}

/**
 * Parses a D3.js force-directed JSON object into a graph.
 *
 * @example
 * ```ts
 * import { fromD3Graph } from '@statelyai/graph/formats/d3';
 *
 * const graph = fromD3Graph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   links: [{ source: 'a', target: 'b' }],
 * });
 * ```
 */
export function fromD3Graph(d3: D3Graph): Graph {
  if (!d3 || typeof d3 !== 'object') {
    throw new Error('D3: expected an object');
  }
  if (!Array.isArray(d3.nodes)) {
    throw new Error('D3: "nodes" must be an array');
  }
  if (!Array.isArray(d3.links)) {
    throw new Error('D3: "links" must be an array');
  }
  return {
    id: d3.id ?? '',
    type: d3.type === 'undirected' ? 'undirected' : 'directed',
    initialNodeId: d3.initialNodeId ?? null,
    data: d3.data,
    ...(d3.direction && { direction: d3.direction }),
    ...(d3.style !== undefined && { style: d3.style }),
    nodes: d3.nodes.map((n) => ({
      type: 'node' as const,
      id: n.id,
      parentId: n.parentId ?? null,
      initialNodeId: n.initialNodeId ?? null,
      label: n.label ?? '',
      data: n.data,
      ...(n.x !== undefined && { x: n.x }),
      ...(n.y !== undefined && { y: n.y }),
      ...(n.width !== undefined && { width: n.width }),
      ...(n.height !== undefined && { height: n.height }),
      ...(n.color && { color: n.color }),
      ...(n.shape && { shape: n.shape }),
      ...(n.style !== undefined && { style: n.style }),
      ...(n.ports !== undefined && { ports: n.ports }),
    })),
    edges: d3.links.map((l, i) => ({
      type: 'edge' as const,
      id: l.id ?? `e${i}`,
      sourceId: typeof l.source === 'string' ? l.source : (l.source as any).id,
      targetId: typeof l.target === 'string' ? l.target : (l.target as any).id,
      label: l.label ?? '',
      data: l.data,
      ...(l.weight !== undefined && { weight: l.weight }),
      ...(l.x !== undefined && { x: l.x }),
      ...(l.y !== undefined && { y: l.y }),
      ...(l.width !== undefined && { width: l.width }),
      ...(l.height !== undefined && { height: l.height }),
      ...(l.color && { color: l.color }),
      ...(l.style !== undefined && { style: l.style }),
      ...(l.sourcePort !== undefined && { sourcePort: l.sourcePort }),
      ...(l.targetPort !== undefined && { targetPort: l.targetPort }),
    })),
  };
}

/**
 * Bidirectional converter for D3.js force-directed JSON format.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { d3Converter } from '@statelyai/graph/formats/d3';
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
