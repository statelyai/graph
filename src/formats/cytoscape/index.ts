import type { Graph, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';

// --- Cytoscape.js JSON types ---

export interface CytoscapeNode {
  data: { id: string; parent?: string; [key: string]: any };
  position?: { x: number; y: number };
}

export interface CytoscapeEdge {
  data: { id: string; source: string; target: string; [key: string]: any };
}

export interface CytoscapeJSON {
  data?: Record<string, any>;
  elements: {
    nodes: CytoscapeNode[];
    edges: CytoscapeEdge[];
  };
}

// --- Conversion ---

/**
 * Converts a graph to Cytoscape.js JSON format.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { toCytoscapeJSON } from '@statelyai/graph/cytoscape';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const cyto = toCytoscapeJSON(graph);
 * // { elements: { nodes: [...], edges: [...] } }
 * ```
 */
export function toCytoscapeJSON(graph: Graph): CytoscapeJSON {
  const graphData: Record<string, any> = {};
  if (graph.id) graphData.id = graph.id;
  graphData.mode = graph.mode;
  if (graph.initialNodeId)
    graphData.initialNodeId = graph.initialNodeId;
  if (graph.data !== undefined) graphData.graphData = graph.data;
  if (graph.direction) graphData.direction = graph.direction;
  if (graph.style !== undefined) graphData.style = graph.style;

  return {
    ...(Object.keys(graphData).length > 0 && { data: graphData }),
    elements: {
      nodes: graph.nodes.map((n) => {
        const data: CytoscapeNode['data'] = { id: n.id };
        if (n.parentId) data.parent = n.parentId;
        if (n.label) data.label = n.label;
        if (n.initialNodeId) data.initialNodeId = n.initialNodeId;
        if (n.data !== undefined) data.nodeData = n.data;
        if (n.width !== undefined) data.width = n.width;
        if (n.height !== undefined) data.height = n.height;
        if (n.shape) data.shape = n.shape;
        if (n.color) data.color = n.color;
        if (n.style !== undefined) data.style = n.style;
        if (n.ports !== undefined) data.ports = n.ports;

        const node: CytoscapeNode = { data };
        if (n.x !== undefined && n.y !== undefined) {
          node.position = { x: n.x, y: n.y };
        }
        return node;
      }),
      edges: graph.edges.map((e) => {
        const data: CytoscapeEdge['data'] = {
          id: e.id,
          source: e.sourceId,
          target: e.targetId,
        };
        if (e.label) data.label = e.label;
        if (e.mode) data.mode = e.mode;
        if (e.data !== undefined) data.edgeData = e.data;
        if (e.weight !== undefined) data.weight = e.weight;
        if (e.points !== undefined) data.points = e.points;
        if (e.routing !== undefined) data.routing = e.routing;
        if (e.x !== undefined) data.x = e.x;
        if (e.y !== undefined) data.y = e.y;
        if (e.width !== undefined) data.width = e.width;
        if (e.height !== undefined) data.height = e.height;
        if (e.color) data.color = e.color;
        if (e.style !== undefined) data.style = e.style;
        if (e.sourcePort !== undefined) data.sourcePort = e.sourcePort;
        if (e.targetPort !== undefined) data.targetPort = e.targetPort;
        return { data } as CytoscapeEdge;
      }),
    },
  };
}

/**
 * Parses a Cytoscape.js JSON object into a graph.
 *
 * @example
 * ```ts
 * import { fromCytoscapeJSON } from '@statelyai/graph/cytoscape';
 *
 * const graph = fromCytoscapeJSON({
 *   elements: {
 *     nodes: [{ data: { id: 'a' } }, { data: { id: 'b' } }],
 *     edges: [{ data: { id: 'e0', source: 'a', target: 'b' } }],
 *   },
 * });
 * ```
 */
export function fromCytoscapeJSON(cyto: CytoscapeJSON): Graph {
  if (!cyto || typeof cyto !== 'object') {
    throw new Error('Cytoscape: expected an object');
  }
  if (!cyto.elements || typeof cyto.elements !== 'object') {
    throw new Error('Cytoscape: missing "elements" property');
  }
  if (!Array.isArray(cyto.elements.nodes)) {
    throw new Error('Cytoscape: "elements.nodes" must be an array');
  }
  if (!Array.isArray(cyto.elements.edges)) {
    throw new Error('Cytoscape: "elements.edges" must be an array');
  }
  return {
    id: cyto.data?.id ?? '',
    mode: cyto.data?.mode ?? 'directed',
    initialNodeId: cyto.data?.initialNodeId ?? null,
    data: cyto.data?.graphData,
    ...(cyto.data?.direction && { direction: cyto.data.direction }),
    ...(cyto.data?.style !== undefined && { style: cyto.data.style }),
    nodes: cyto.elements.nodes.map((n) => ({
      type: 'node' as const,
      id: n.data.id,
      parentId: n.data.parent ?? null,
      initialNodeId: n.data.initialNodeId ?? null,
      label: n.data.label ?? '',
      data: n.data.nodeData,
      ...(n.position && { x: n.position.x, y: n.position.y }),
      ...(n.data.width !== undefined && { width: n.data.width }),
      ...(n.data.height !== undefined && { height: n.data.height }),
      ...(n.data.shape && { shape: n.data.shape }),
      ...(n.data.color && { color: n.data.color }),
      ...(n.data.style !== undefined && { style: n.data.style }),
      ...(n.data.ports !== undefined && { ports: n.data.ports }),
    })),
    edges: cyto.elements.edges.map((e, i) => ({
      type: 'edge' as const,
      id: e.data.id ?? `e${i}`,
      sourceId: e.data.source,
      targetId: e.data.target,
      label: e.data.label ?? '',
      ...(e.data.mode && { mode: e.data.mode }),
      data: e.data.edgeData,
      ...(e.data.weight !== undefined && { weight: e.data.weight }),
      ...(e.data.points !== undefined && { points: e.data.points }),
      ...(e.data.routing !== undefined && { routing: e.data.routing }),
      ...(e.data.x !== undefined && { x: e.data.x }),
      ...(e.data.y !== undefined && { y: e.data.y }),
      ...(e.data.width !== undefined && { width: e.data.width }),
      ...(e.data.height !== undefined && { height: e.data.height }),
      ...(e.data.color && { color: e.data.color }),
      ...(e.data.style !== undefined && { style: e.data.style }),
      ...(e.data.sourcePort !== undefined && { sourcePort: e.data.sourcePort }),
      ...(e.data.targetPort !== undefined && { targetPort: e.data.targetPort }),
    })),
  };
}

/**
 * Bidirectional converter for Cytoscape.js JSON format.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { cytoscapeConverter } from '@statelyai/graph/cytoscape';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const cyto = cytoscapeConverter.to(graph);
 * const roundTripped = cytoscapeConverter.from(cyto);
 * ```
 */
export const cytoscapeConverter: GraphFormatConverter<CytoscapeJSON> =
  createFormatConverter(toCytoscapeJSON, fromCytoscapeJSON);
