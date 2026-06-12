import { Layout, type InputNode, type Link } from 'webcola';
import type { Graph, VisualGraph } from '../types';
import { createVisualGraph } from '../graph';
import { toNodeConfig, toEdgeConfig } from '../config';
import { getNodeSize, type LayoutOptions } from './index';

export interface ColaLayoutOptions extends LayoutOptions {
  /** Target distance between linked nodes. Default: 80. */
  linkDistance?: number;
}

interface ColaNode extends InputNode {
  id: string;
  width: number;
  height: number;
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
 * Constraint-based layout via WebCola (optional peer dependency). Runs the
 * solver to convergence synchronously (`keepRunning: false`) and returns a
 * positioned {@link VisualGraph}.
 *
 * - Overlap avoidance is always on: node rects (from `options.measure` →
 *   node `width`/`height` → defaults) are kept disjoint.
 * - Deterministic: WebCola itself has no `Math.random` in its 2D solver
 *   (its descent uses an internally seeded PRNG), so the seeded initial
 *   scatter (`options.seed`) fully pins the result — same seed, same layout.
 * - `options.isFixed` pins positioned nodes at their current `x`/`y` (cola's
 *   `fixed` flag). During overlap projection cola holds fixed nodes with a
 *   large-but-finite weight, so pinning is within a small tolerance, not
 *   exact.
 * - `options.direction ?? graph.direction` set → DAG-flow constraints via
 *   cola's `flowLayout`: edges are separated along the axis ('down'/'up' →
 *   `y`, 'left'/'right' → `x`) by at least `spacing.layer` (default 50).
 *   Note: cola only separates source-before-target along the axis — 'up' and
 *   'left' flow the same way as 'down'/'right', not reversed.
 * - Hierarchy is ignored (flat layout); self-loops are skipped by the solver
 *   but kept in the output graph.
 *
 * @example
 * ```ts
 * import { getColaLayout } from '@statelyai/graph/layout/webcola';
 *
 * const laidOut = getColaLayout(graph, { seed: 42, direction: 'down' });
 * ```
 */
export function getColaLayout(
  graph: Graph | VisualGraph,
  options?: ColaLayoutOptions,
): VisualGraph {
  const rng = mulberry32(options?.seed ?? 1);
  const sizes = new Map<string, { width: number; height: number }>();
  const scatterRadius = Math.max(80, 30 * Math.sqrt(graph.nodes.length));
  const colaNodes: ColaNode[] = graph.nodes.map((node) => {
    const size = getNodeSize(node, options);
    sizes.set(node.id, size);
    const colaNode: ColaNode = { id: node.id, ...size };
    if (node.x !== undefined && node.y !== undefined) {
      // Existing positions (centers) seed the solver — incremental relayout
      // starts from the current arrangement
      colaNode.x = node.x + size.width / 2;
      colaNode.y = node.y + size.height / 2;
      if (options?.isFixed?.(node)) {
        colaNode.fixed = 1;
      }
    } else {
      // Unpositioned nodes start in a seeded scatter — this is what makes
      // `seed` produce genuinely different (but reproducible) arrangements;
      // cola itself is deterministic given the same inputs
      const angle = rng() * 2 * Math.PI;
      const radius = scatterRadius * Math.sqrt(rng());
      colaNode.x = Math.cos(angle) * radius;
      colaNode.y = Math.sin(angle) * radius;
    }
    return colaNode;
  });
  const indexById = new Map(graph.nodes.map((node, i) => [node.id, i]));
  const colaLinks: Array<Link<number>> = graph.edges
    .filter(
      (edge) =>
        indexById.has(edge.sourceId) &&
        indexById.has(edge.targetId) &&
        edge.sourceId !== edge.targetId,
    )
    .map((edge) => ({
      source: indexById.get(edge.sourceId)!,
      target: indexById.get(edge.targetId)!,
    }));

  const layout = new Layout()
    .nodes(colaNodes)
    .links(colaLinks)
    .linkDistance(options?.linkDistance ?? 80)
    .avoidOverlaps(true);

  const direction = options?.direction ?? graph.direction;
  if (direction !== undefined) {
    const axis = direction === 'left' || direction === 'right' ? 'x' : 'y';
    layout.flowLayout(axis, options?.spacing?.layer ?? 50);
  }

  // centerGraph would translate the settled graph (moving fixed nodes off
  // their pins), so it is disabled whenever anything is pinned
  const centerGraph = !colaNodes.some((colaNode) => colaNode.fixed);
  layout.start(30, 30, 60, 0, false, centerGraph);

  const byId = new Map(colaNodes.map((colaNode) => [colaNode.id, colaNode]));
  return createVisualGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    direction: graph.direction,
    data: graph.data,
    ...(graph.style !== undefined && { style: graph.style }),
    nodes: graph.nodes.map((node) => {
      const size = sizes.get(node.id)!;
      const colaNode = byId.get(node.id)!;
      return {
        ...toNodeConfig(node),
        ...size,
        // cola positions are centers; VisualNode.x/y are top-left
        x: (colaNode.x ?? 0) - size.width / 2,
        y: (colaNode.y ?? 0) - size.height / 2,
      };
    }),
    edges: graph.edges.map((edge) => toEdgeConfig(edge)),
  });
}
