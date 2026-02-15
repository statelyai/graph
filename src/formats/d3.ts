import type { Graph, GraphFormatConverter } from '../types';
import { createFormatConverter } from './converter';

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
  nodes: D3Node[];
  links: D3Link[];
}

// --- Conversion ---

export function toD3Graph(graph: Graph): D3Graph {
  return {
    nodes: graph.nodes.map((n) => {
      const node: D3Node = { id: n.id };
      if (n.label) node.label = n.label;
      if (n.data !== undefined) node.data = n.data;
      if (n.x !== undefined) node.x = n.x;
      if (n.y !== undefined) node.y = n.y;
      if (n.color) node.color = n.color;
      if (n.shape) node.shape = n.shape;
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
      if (e.color) link.color = e.color;
      return link;
    }),
  };
}

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
    id: '',
    type: 'directed',
    initialNodeId: null,
    data: undefined as any,
    nodes: d3.nodes.map((n) => ({
      type: 'node' as const,
      id: n.id,
      parentId: null,
      initialNodeId: null,
      label: n.label ?? '',
      data: n.data,
      ...(n.x !== undefined && { x: n.x }),
      ...(n.y !== undefined && { y: n.y }),
      ...(n.color && { color: n.color }),
      ...(n.shape && { shape: n.shape }),
    })),
    edges: d3.links.map((l, i) => ({
      type: 'edge' as const,
      id: l.id ?? `e${i}`,
      sourceId: typeof l.source === 'string' ? l.source : (l.source as any).id,
      targetId: typeof l.target === 'string' ? l.target : (l.target as any).id,
      label: l.label ?? '',
      data: l.data,
      ...(l.color && { color: l.color }),
    })),
  };
}

/** Bidirectional converter for D3.js force-directed JSON format. */
export const d3Converter: GraphFormatConverter<D3Graph> =
  createFormatConverter(toD3Graph, fromD3Graph);
