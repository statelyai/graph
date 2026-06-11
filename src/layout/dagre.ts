import dagre from '@dagrejs/dagre';
import type { Graph, VisualGraph } from '../types';
import { createVisualGraph } from '../graph';
import { toNodeConfig, toEdgeConfig } from '../config';
import { getNodeSize, type LayoutOptions } from './index';

export interface DagreLayoutOptions extends LayoutOptions {
  /**
   * Raw dagre graph options, spread onto `setGraph` last (override
   * everything). See https://github.com/dagrejs/dagre/wiki#configuring-the-layout
   */
  graphOptions?: Record<string, unknown>;
}

const DIRECTION_TO_RANKDIR: Record<string, string> = {
  down: 'TB',
  up: 'BT',
  right: 'LR',
  left: 'RL',
};

/**
 * Lay out a graph with dagre (`@dagrejs/dagre`, an optional peer dependency).
 * Pure and synchronous: returns a new {@link VisualGraph} with node
 * positions/sizes, polyline edge `points`, and computed edge label rects
 * (dagre's own `edge.x/y` label convention maps directly onto ours).
 * Compound graphs are supported via dagre's `setParent`. All coordinates are
 * absolute (dagre does not produce parent-relative positions).
 *
 * Per-edge `mode` is ignored by dagre (it layers everything by authored
 * direction) — for mixed graphs prefer {@link getElkLayout}.
 *
 * @example
 * ```ts
 * import { getDagreLayout } from '@statelyai/graph/layout/dagre';
 *
 * const laidOut = getDagreLayout(graph, { direction: 'right' });
 * ```
 */
export function getDagreLayout(
  graph: Graph | VisualGraph,
  options?: DagreLayoutOptions,
): VisualGraph {
  const g = new dagre.graphlib.Graph({ multigraph: true, compound: true });
  g.setGraph({
    rankdir:
      DIRECTION_TO_RANKDIR[options?.direction ?? graph.direction ?? 'down'],
    ...(options?.spacing?.node !== undefined && {
      nodesep: options.spacing.node,
    }),
    ...(options?.spacing?.layer !== undefined && {
      ranksep: options.spacing.layer,
    }),
    ...options?.graphOptions,
  });
  g.setDefaultEdgeLabel(() => ({}));

  const sizes = new Map<string, { width: number; height: number }>();
  for (const node of graph.nodes) {
    const size = getNodeSize(node, options);
    sizes.set(node.id, size);
    g.setNode(node.id, { ...size });
  }
  for (const node of graph.nodes) {
    if (node.parentId != null) g.setParent(node.id, node.parentId);
  }
  for (const edge of graph.edges) {
    // Edge width/height are canonically the label rect — dagre uses them to
    // reserve space for the label and returns its position as edge.x/y
    const hasLabelBox =
      edge.label != null &&
      edge.width !== undefined &&
      edge.height !== undefined &&
      edge.width > 0 &&
      edge.height > 0;
    g.setEdge(
      edge.sourceId,
      edge.targetId,
      hasLabelBox
        ? { width: edge.width, height: edge.height, labelpos: 'c' }
        : {},
      edge.id, // multigraph edge name — parallel edges stay distinct
    );
  }

  dagre.layout(g);

  // dagre reports node centers; our convention is top-left
  const result = createVisualGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    direction: options?.direction ?? graph.direction,
    data: graph.data,
    ...(graph.style !== undefined && { style: graph.style }),
    nodes: graph.nodes.map((node) => {
      const size = sizes.get(node.id)!;
      const positioned = g.node(node.id) as { x: number; y: number };
      return {
        ...toNodeConfig(node),
        ...size,
        x: positioned.x - size.width / 2,
        y: positioned.y - size.height / 2,
      };
    }),
    edges: graph.edges.map((edge) => {
      const laidOut = g.edge(edge.sourceId, edge.targetId, edge.id) as {
        points?: Array<{ x: number; y: number }>;
        x?: number;
        y?: number;
        width?: number;
        height?: number;
      };
      const config = toEdgeConfig(edge);
      if (laidOut?.points !== undefined) {
        config.points = laidOut.points.map((p) => ({ x: p.x, y: p.y }));
        config.routing = 'polyline';
      }
      if (laidOut?.x !== undefined && laidOut?.y !== undefined) {
        // dagre's edge.x/y is the label center; store top-left
        const labelWidth = laidOut.width ?? edge.width ?? 0;
        const labelHeight = laidOut.height ?? edge.height ?? 0;
        config.x = laidOut.x - labelWidth / 2;
        config.y = laidOut.y - labelHeight / 2;
        config.width = labelWidth;
        config.height = labelHeight;
      }
      return config;
    }),
  });

  return result;
}
