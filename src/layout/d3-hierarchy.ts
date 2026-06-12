import { hierarchy, tree } from 'd3-hierarchy';
import type { Graph, VisualGraph } from '../types';
import { createVisualGraph, hasNode } from '../graph';
import { toNodeConfig, toEdgeConfig } from '../config';
import { getSources, getSuccessors } from '../queries';
import { getNodeSize, type LayoutOptions } from './index';

export interface TidyTreeLayoutOptions extends LayoutOptions {
  /**
   * Node to use as the tree root. Defaults to `graph.initialNodeId`, falling
   * back to the graph's zero-in-degree nodes (multiple → laid out as a
   * forest).
   */
  rootId?: string;
}

/** Spanning-tree datum fed to d3.hierarchy. `id: null` is the synthetic root. */
interface TreeDatum {
  id: string | null;
  children: TreeDatum[];
}

// Same defaults as the dagre adapter's nodesep/ranksep.
const DEFAULT_NODE_SPACING = 50;
const DEFAULT_LAYER_SPACING = 50;

/**
 * Lay out a graph as a tidy tree (Reingold–Tilford) with `d3-hierarchy`
 * (an optional peer dependency). Pure and synchronous: returns a new
 * {@link VisualGraph} with node positions/sizes.
 *
 * Root selection: `options.rootId` → `graph.initialNodeId` → the graph's
 * zero-in-degree nodes. Multiple zero-in-degree nodes are laid out as a
 * forest (side by side under an invisible synthetic root that is dropped
 * from the output). If no root can be found (every node has incoming edges,
 * i.e. the graph is cyclic), this throws — pass `rootId` to break the tie.
 *
 * Graphs that aren't strict trees are handled via a *spanning tree*: BFS
 * from the root over effective edge direction picks each node's tree parent
 * (first edge to reach it); only that spanning tree drives positions. All
 * edges — including the extra cross/forward/back edges — are preserved
 * untouched in the output. Tidy tree does not route edges (no `points`).
 *
 * @example
 * ```ts
 * import { getTidyTreeLayout } from '@statelyai/graph/layout/d3-hierarchy';
 *
 * const laidOut = getTidyTreeLayout(graph, { direction: 'right' });
 * ```
 */
export function getTidyTreeLayout(
  graph: Graph | VisualGraph,
  options?: TidyTreeLayoutOptions,
): VisualGraph {
  const direction = options?.direction ?? graph.direction ?? 'down';

  if (graph.nodes.length === 0) {
    return createVisualGraph({
      id: graph.id,
      mode: graph.mode,
      direction,
      data: graph.data,
      ...(graph.style !== undefined && { style: graph.style }),
      nodes: [],
      edges: graph.edges.map(toEdgeConfig),
    });
  }

  // --- Root selection ---
  let rootIds: string[];
  if (options?.rootId !== undefined) {
    if (!hasNode(graph, options.rootId)) {
      throw new Error(
        `getTidyTreeLayout: rootId "${options.rootId}" does not exist in graph "${graph.id}". ` +
          `Pass the id of an existing node.`,
      );
    }
    rootIds = [options.rootId];
  } else if (
    graph.initialNodeId != null &&
    hasNode(graph, graph.initialNodeId)
  ) {
    rootIds = [graph.initialNodeId];
  } else {
    rootIds = getSources(graph).map((node) => node.id);
    if (rootIds.length === 0) {
      throw new Error(
        `getTidyTreeLayout: no tree root found in graph "${graph.id}" — all ` +
          `${graph.nodes.length} nodes have incoming edges (the graph is cyclic). ` +
          `Pass options.rootId or set graph.initialNodeId to choose where the tree starts.`,
      );
    }
  }

  // --- Spanning forest: BFS from each root over effective edge direction.
  // The first edge to reach a node becomes its tree parent; remaining edges
  // do not affect positions but are preserved in the output.
  const visited = new Set<string>();
  const buildSpanningTree = (rootId: string): TreeDatum => {
    const root: TreeDatum = { id: rootId, children: [] };
    visited.add(rootId);
    const queue = [root];
    while (queue.length > 0) {
      const datum = queue.shift()!;
      for (const successor of getSuccessors(graph, datum.id!)) {
        if (visited.has(successor.id)) continue;
        visited.add(successor.id);
        const child: TreeDatum = { id: successor.id, children: [] };
        datum.children.push(child);
        queue.push(child);
      }
    }
    return root;
  };
  const trees = rootIds.map(buildSpanningTree);
  // Nodes unreachable from any root (e.g. a detached cyclic component) become
  // extra forest roots so every node gets a position.
  for (const node of graph.nodes) {
    if (!visited.has(node.id)) trees.push(buildSpanningTree(node.id));
  }

  // --- Tidy tree layout ---
  // d3.tree's x is the breadth coordinate, y is depth; for horizontal
  // directions the node's breadth dimension is its height.
  const isHorizontal = direction === 'left' || direction === 'right';
  const sizes = new Map(
    graph.nodes.map((node) => [node.id, getNodeSize(node, options)]),
  );
  let maxBreadth = 0;
  let maxDepth = 0;
  for (const size of sizes.values()) {
    maxBreadth = Math.max(maxBreadth, isHorizontal ? size.height : size.width);
    maxDepth = Math.max(maxDepth, isHorizontal ? size.width : size.height);
  }
  const breadthStep = maxBreadth + (options?.spacing?.node ?? DEFAULT_NODE_SPACING);
  const depthStep = maxDepth + (options?.spacing?.layer ?? DEFAULT_LAYER_SPACING);

  const isForest = trees.length > 1;
  const rootDatum: TreeDatum = isForest
    ? { id: null, children: trees } // invisible synthetic root, dropped below
    : trees[0];
  const laidOut = tree<TreeDatum>().nodeSize([breadthStep, depthStep])(
    hierarchy(rootDatum),
  );

  // d3 reports node centers; convert depth/breadth to our axes, then to
  // top-left. The synthetic root occupies depth 0 — shift it away.
  const centers = new Map<string, { x: number; y: number }>();
  for (const point of laidOut.descendants()) {
    if (point.data.id === null) continue;
    const breadth = point.x;
    const depth = point.y - (isForest ? depthStep : 0);
    centers.set(
      point.data.id,
      direction === 'down'
        ? { x: breadth, y: depth }
        : direction === 'up'
          ? { x: breadth, y: -depth }
          : direction === 'right'
            ? { x: depth, y: breadth }
            : { x: -depth, y: breadth },
    );
  }

  return createVisualGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    direction,
    data: graph.data,
    ...(graph.style !== undefined && { style: graph.style }),
    nodes: graph.nodes.map((node) => {
      const size = sizes.get(node.id)!;
      const center = centers.get(node.id)!;
      return {
        ...toNodeConfig(node),
        ...size,
        x: center.x - size.width / 2,
        y: center.y - size.height / 2,
      };
    }),
    edges: graph.edges.map(toEdgeConfig),
  });
}
