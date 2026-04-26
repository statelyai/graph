import type { Graph, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';

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

/**
 * Converts a graph to JSON Graph Format (JGF).
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { toJGF } from '@statelyai/graph/formats/jgf';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const jgf = toJGF(graph);
 * // { graph: { directed: true, nodes: [...], edges: [...] } }
 * ```
 */
export function toJGF(graph: Graph): JGFGraph {
  const metadata: Record<string, any> = {};
  if (graph.initialNodeId) metadata.initialNodeId = graph.initialNodeId;
  if (graph.data !== undefined) metadata.data = graph.data;
  if (graph.direction) metadata.direction = graph.direction;
  if (graph.style !== undefined) metadata.style = graph.style;

  return {
    graph: {
      id: graph.id || undefined,
      directed: graph.type === 'directed',
      ...(Object.keys(metadata).length > 0 && { metadata }),
      nodes: graph.nodes.map((n) => {
        const meta: Record<string, any> = {};
        if (n.parentId) meta.parentId = n.parentId;
        if (n.initialNodeId) meta.initialNodeId = n.initialNodeId;
        if (n.data !== undefined) meta.data = n.data;
        if (n.x !== undefined) meta.x = n.x;
        if (n.y !== undefined) meta.y = n.y;
        if (n.width !== undefined) meta.width = n.width;
        if (n.height !== undefined) meta.height = n.height;
        if (n.shape) meta.shape = n.shape;
        if (n.color) meta.color = n.color;
        if (n.style !== undefined) meta.style = n.style;
        if (n.ports !== undefined) meta.ports = n.ports;
        return {
          id: n.id,
          ...(n.label && { label: n.label }),
          ...(Object.keys(meta).length > 0 && { metadata: meta }),
        };
      }),
      edges: graph.edges.map((e) => {
        const meta: Record<string, any> = {};
        if (e.data !== undefined) meta.data = e.data;
        if (e.weight !== undefined) meta.weight = e.weight;
        if (e.x !== undefined) meta.x = e.x;
        if (e.y !== undefined) meta.y = e.y;
        if (e.width !== undefined) meta.width = e.width;
        if (e.height !== undefined) meta.height = e.height;
        if (e.color) meta.color = e.color;
        if (e.style !== undefined) meta.style = e.style;
        if (e.sourcePort !== undefined) meta.sourcePort = e.sourcePort;
        if (e.targetPort !== undefined) meta.targetPort = e.targetPort;
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

/**
 * Parses a JSON Graph Format (JGF) object into a graph.
 *
 * @example
 * ```ts
 * import { fromJGF } from '@statelyai/graph/formats/jgf';
 *
 * const graph = fromJGF({
 *   graph: {
 *     directed: true,
 *     nodes: [{ id: 'a' }, { id: 'b' }],
 *     edges: [{ source: 'a', target: 'b' }],
 *   },
 * });
 * ```
 */
export function fromJGF(jgf: JGFGraph): Graph {
  if (!jgf || typeof jgf !== 'object') {
    throw new Error('JGF: expected an object');
  }
  if (!jgf.graph || typeof jgf.graph !== 'object') {
    throw new Error('JGF: missing "graph" property');
  }
  const g = jgf.graph;
  if (!Array.isArray(g.nodes)) {
    throw new Error('JGF: "graph.nodes" must be an array');
  }
  if (!Array.isArray(g.edges)) {
    throw new Error('JGF: "graph.edges" must be an array');
  }
  return {
    id: g.id ?? '',
    type: g.directed === false ? 'undirected' : 'directed',
    initialNodeId: g.metadata?.initialNodeId ?? null,
    data: g.metadata?.data,
    ...(g.metadata?.direction && { direction: g.metadata.direction }),
    ...(g.metadata?.style !== undefined && { style: g.metadata.style }),
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
      ...(n.metadata?.style !== undefined && { style: n.metadata.style }),
      ...(n.metadata?.ports !== undefined && { ports: n.metadata.ports }),
    })),
    edges: g.edges.map((e, i) => ({
      type: 'edge' as const,
      id: e.id ?? `e${i}`,
      sourceId: e.source,
      targetId: e.target,
      label: e.label ?? '',
      data: e.metadata?.data,
      ...(e.metadata?.weight !== undefined && { weight: e.metadata.weight }),
      ...(e.metadata?.x !== undefined && { x: e.metadata.x }),
      ...(e.metadata?.y !== undefined && { y: e.metadata.y }),
      ...(e.metadata?.width !== undefined && { width: e.metadata.width }),
      ...(e.metadata?.height !== undefined && { height: e.metadata.height }),
      ...(e.metadata?.color && { color: e.metadata.color }),
      ...(e.metadata?.style !== undefined && { style: e.metadata.style }),
      ...(e.metadata?.sourcePort !== undefined && {
        sourcePort: e.metadata.sourcePort,
      }),
      ...(e.metadata?.targetPort !== undefined && {
        targetPort: e.metadata.targetPort,
      }),
    })),
  };
}

/**
 * Bidirectional converter for JSON Graph Format.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { jgfConverter } from '@statelyai/graph/formats/jgf';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const jgf = jgfConverter.to(graph);
 * const roundTripped = jgfConverter.from(jgf);
 * ```
 */
export const jgfConverter: GraphFormatConverter<JGFGraph> =
  createFormatConverter(toJGF, fromJGF);
