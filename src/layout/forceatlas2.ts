import GraphologyGraph from 'graphology';
import forceAtlas2, {
  type ForceAtlas2Settings,
} from 'graphology-layout-forceatlas2';
import type { Graph, VisualGraph } from '../types';
import { createVisualGraph } from '../graph';
import { toNodeConfig, toEdgeConfig } from '../config';
import { getNodeSize, type LayoutOptions } from './index';

export interface ForceAtlas2LayoutOptions extends LayoutOptions {
  /** Number of ForceAtlas2 iterations. Default: 100. */
  iterations?: number;
  /**
   * Pass-through engine settings (`scalingRatio`, `gravity`, `linLogMode`,
   * `barnesHutOptimize`, …). See graphology-layout-forceatlas2.
   */
  settings?: ForceAtlas2Settings;
}

/** mulberry32 — same seeded PRNG the rest of the library uses. */
function mulberry32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One-shot ForceAtlas2 layout via graphology (optional peer dependencies
 * `graphology` + `graphology-layout-forceatlas2`). Runs the synchronous
 * engine for `options.iterations` iterations and returns a positioned
 * {@link VisualGraph}.
 *
 * - Deterministic: FA2 itself has no randomness, but it requires initial
 *   positions. Positioned nodes start from their current centers
 *   (incremental relayout); unpositioned nodes start in a seeded scatter
 *   driven by `options.seed` — the same seed always produces the same
 *   layout.
 * - `options.isFixed` pins positioned nodes at their current `x`/`y` via
 *   FA2's `fixed` node attribute (honored natively by the engine).
 * - Per-edge `weight` feeds FA2's attraction (its default edge-weight
 *   getter reads the `weight` attribute; tune with
 *   `settings.edgeWeightInfluence`).
 * - Self-loops are skipped (zero-distance edges destabilize the forces);
 *   parallel edges are kept (multigraph). Hierarchy is ignored (force
 *   layouts are flat).
 *
 * @example
 * ```ts
 * import { getForceAtlas2Layout } from '@statelyai/graph/layout/forceatlas2';
 *
 * const laidOut = getForceAtlas2Layout(graph, {
 *   seed: 42,
 *   iterations: 200,
 *   settings: { gravity: 2 },
 * });
 * ```
 */
export function getForceAtlas2Layout(
  graph: Graph | VisualGraph,
  options?: ForceAtlas2LayoutOptions,
): VisualGraph {
  const rng = mulberry32(options?.seed ?? 1);
  const sizes = new Map<string, { width: number; height: number }>();
  const scatterRadius = Math.max(80, 30 * Math.sqrt(graph.nodes.length));
  const engineGraph = new GraphologyGraph({ multi: true });

  for (const node of graph.nodes) {
    const size = getNodeSize(node, options);
    sizes.set(node.id, size);
    if (node.x !== undefined && node.y !== undefined) {
      // Existing positions (centers) seed the engine — incremental relayout
      // starts from the current arrangement
      engineGraph.addNode(node.id, {
        x: node.x + size.width / 2,
        y: node.y + size.height / 2,
        ...(options?.isFixed?.(node) && { fixed: true }),
      });
    } else {
      // Unpositioned nodes start in a seeded scatter — FA2 throws on nodes
      // without coordinates, and the scatter is what makes `seed` produce
      // genuinely different (but reproducible) arrangements
      const angle = rng() * 2 * Math.PI;
      const radius = scatterRadius * Math.sqrt(rng());
      engineGraph.addNode(node.id, {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius,
      });
    }
  }
  for (const edge of graph.edges) {
    if (
      !sizes.has(edge.sourceId) ||
      !sizes.has(edge.targetId) ||
      edge.sourceId === edge.targetId
    ) {
      continue;
    }
    engineGraph.addEdgeWithKey(
      edge.id,
      edge.sourceId,
      edge.targetId,
      edge.weight !== undefined ? { weight: edge.weight } : {},
    );
  }

  const positions = forceAtlas2(engineGraph, {
    iterations: options?.iterations ?? 100,
    ...(options?.settings !== undefined && { settings: options.settings }),
  });

  return createVisualGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    direction: graph.direction,
    data: graph.data,
    ...(graph.style !== undefined && { style: graph.style }),
    nodes: graph.nodes.map((node) => {
      const size = sizes.get(node.id)!;
      const position = positions[node.id];
      return {
        ...toNodeConfig(node),
        ...size,
        // FA2 positions are centers; VisualNode.x/y are top-left
        x: position.x - size.width / 2,
        y: position.y - size.height / 2,
      };
    }),
    edges: graph.edges.map((edge) => toEdgeConfig(edge)),
  });
}
