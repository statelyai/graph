import type { Graph, GraphFormatConverter } from '../types';
import { createFormatConverter } from './converter';

// --- JGF types (JSON Graph Format, https://jsongraphformat.info/) ---

export interface JGFNode {
  id: string;
  label?: string;
  metadata?: Record<string, any>;
}

export interface JGFEdge {
  id?: string;
  source: string;
  target: string;
  label?: string;
  metadata?: Record<string, any>;
}

export interface JGFGraph {
  graph: {
    id?: string;
    directed?: boolean;
    metadata?: Record<string, any>;
    nodes: JGFNode[];
    edges: JGFEdge[];
  };
}

// --- Conversion ---

export function toJGF(graph: Graph): JGFGraph {
  const metadata: Record<string, any> = {};
  if (graph.initialNodeId !== null) metadata.initialNodeId = graph.initialNodeId;
  if (graph.data !== undefined) metadata.data = graph.data;
  if (graph.direction) metadata.direction = graph.direction;

  return {
    graph: {
      id: graph.id || undefined,
      directed: graph.type === 'directed',
      ...(Object.keys(metadata).length > 0 && { metadata }),
      nodes: graph.nodes.map((n) => {
        const meta: Record<string, any> = {};
        if (n.parentId !== null) meta.parentId = n.parentId;
        if (n.initialNodeId !== null) meta.initialNodeId = n.initialNodeId;
        if (n.data !== undefined) meta.data = n.data;
        if (n.x !== undefined) meta.x = n.x;
        if (n.y !== undefined) meta.y = n.y;
        if (n.width !== undefined) meta.width = n.width;
        if (n.height !== undefined) meta.height = n.height;
        if (n.shape) meta.shape = n.shape;
        if (n.color) meta.color = n.color;
        return {
          id: n.id,
          ...(n.label && { label: n.label }),
          ...(Object.keys(meta).length > 0 && { metadata: meta }),
        };
      }),
      edges: graph.edges.map((e) => {
        const meta: Record<string, any> = {};
        if (e.data !== undefined) meta.data = e.data;
        if (e.color) meta.color = e.color;
        return {
          id: e.id,
          source: e.sourceId,
          target: e.targetId,
          ...(e.label && { label: e.label }),
          ...(Object.keys(meta).length > 0 && { metadata: meta }),
        };
      }),
    },
  };
}

export function fromJGF(jgf: JGFGraph): Graph {
  const g = jgf.graph;
  return {
    id: g.id ?? '',
    type: g.directed === false ? 'undirected' : 'directed',
    initialNodeId: g.metadata?.initialNodeId ?? null,
    data: g.metadata?.data,
    ...(g.metadata?.direction && { direction: g.metadata.direction }),
    nodes: g.nodes.map((n) => ({
      type: 'node' as const,
      id: n.id,
      parentId: n.metadata?.parentId ?? null,
      initialNodeId: n.metadata?.initialNodeId ?? null,
      label: n.label ?? '',
      data: n.metadata?.data,
      ...(n.metadata?.x !== undefined && { x: n.metadata.x }),
      ...(n.metadata?.y !== undefined && { y: n.metadata.y }),
      ...(n.metadata?.width !== undefined && { width: n.metadata.width }),
      ...(n.metadata?.height !== undefined && { height: n.metadata.height }),
      ...(n.metadata?.shape && { shape: n.metadata.shape }),
      ...(n.metadata?.color && { color: n.metadata.color }),
    })),
    edges: g.edges.map((e, i) => ({
      type: 'edge' as const,
      id: e.id ?? `e${i}`,
      sourceId: e.source,
      targetId: e.target,
      label: e.label ?? '',
      data: e.metadata?.data,
      ...(e.metadata?.color && { color: e.metadata.color }),
    })),
  };
}

/** Bidirectional converter for JSON Graph Format. */
export const jgfConverter: GraphFormatConverter<JGFGraph> =
  createFormatConverter(toJGF, fromJGF);
