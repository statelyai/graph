import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from 'd3-force';
import type { Graph, VisualGraph } from '../types';
import { createVisualGraph } from '../graph';
import { toNodeConfig, toEdgeConfig } from '../config';
import {
  getNodeSize,
  type LayoutFrame,
  type LayoutOptions,
} from './index';

export interface ForceLayoutOptions extends LayoutOptions {
  /** Target distance between linked nodes. Default: 80. */
  linkDistance?: number;
  /** Many-body charge strength (negative repels). Default: -300. */
  chargeStrength?: number;
  /** Number of simulation ticks. Default: 300 (d3's natural cooling span). */
  iterations?: number;
}

interface SimNode extends SimulationNodeDatum {
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
 * Iterative force-directed layout via d3-force (optional peer dependency).
 * Each `next()` advances one simulation tick and yields a {@link LayoutFrame}
 * (top-left node positions by id + remaining `alpha`); the caller owns pacing
 * (e.g. one tick per animation frame via {@link applyLayoutFrame}) and
 * cancellation (stop iterating). The generator's return value is the settled
 * {@link VisualGraph}.
 *
 * - Deterministic: `options.seed` drives d3's `randomSource`; the same seed
 *   always produces the same layout.
 * - `options.isFixed` pins nodes at their current position (d3 `fx`/`fy`).
 * - Hierarchy is ignored (force layouts are flat); per-edge `mode` is
 *   irrelevant (forces are symmetric).
 *
 * @example
 * ```ts
 * import { genForceLayout } from '@statelyai/graph/layout/d3-force';
 * import { applyLayoutFrame } from '@statelyai/graph/layout';
 *
 * for (const frame of genForceLayout(graph, { seed: 42 })) {
 *   applyLayoutFrame(graph, frame);
 *   render(graph);
 * }
 * ```
 */
export function* genForceLayout(
  graph: Graph | VisualGraph,
  options?: ForceLayoutOptions,
): Generator<LayoutFrame, VisualGraph> {
  const rng = mulberry32(options?.seed ?? 1);
  const sizes = new Map<string, { width: number; height: number }>();
  const scatterRadius = Math.max(80, 30 * Math.sqrt(graph.nodes.length));
  const simNodes: SimNode[] = graph.nodes.map((node) => {
    const size = getNodeSize(node, options);
    sizes.set(node.id, size);
    const simNode: SimNode = { id: node.id, ...size };
    if (node.x !== undefined && node.y !== undefined) {
      // Existing positions (centers) seed the simulation — incremental
      // relayout starts from the current arrangement
      simNode.x = node.x + size.width / 2;
      simNode.y = node.y + size.height / 2;
      if (options?.isFixed?.(node)) {
        simNode.fx = simNode.x;
        simNode.fy = simNode.y;
      }
    } else {
      // Unpositioned nodes start in a seeded scatter — this is what makes
      // `seed` produce genuinely different (but reproducible) arrangements;
      // d3's own initial placement is deterministic regardless of its
      // randomSource
      const angle = rng() * 2 * Math.PI;
      const radius = scatterRadius * Math.sqrt(rng());
      simNode.x = Math.cos(angle) * radius;
      simNode.y = Math.sin(angle) * radius;
    }
    return simNode;
  });
  const simLinks: Array<SimulationLinkDatum<SimNode>> = graph.edges
    .filter(
      (edge) =>
        sizes.has(edge.sourceId) &&
        sizes.has(edge.targetId) &&
        edge.sourceId !== edge.targetId,
    )
    .map((edge) => ({ source: edge.sourceId, target: edge.targetId }));

  const simulation = forceSimulation<SimNode>(simNodes)
    .randomSource(mulberry32(options?.seed ?? 1))
    .force(
      'link',
      forceLink<SimNode, SimulationLinkDatum<SimNode>>(simLinks)
        .id((d) => d.id)
        .distance(options?.linkDistance ?? 80),
    )
    .force('charge', forceManyBody().strength(options?.chargeStrength ?? -300))
    .force('center', forceCenter(0, 0))
    .stop();

  const iterations = options?.iterations ?? 300;
  for (let i = 0; i < iterations; i++) {
    simulation.tick();
    const positions: LayoutFrame['positions'] = {};
    for (const simNode of simNodes) {
      // d3 positions are centers; frames carry top-left like VisualNode.x/y
      positions[simNode.id] = {
        x: (simNode.x ?? 0) - simNode.width / 2,
        y: (simNode.y ?? 0) - simNode.height / 2,
      };
    }
    yield { positions, alpha: simulation.alpha() };
    if (simulation.alpha() < simulation.alphaMin()) break;
  }

  const byId = new Map(simNodes.map((simNode) => [simNode.id, simNode]));
  return createVisualGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    direction: graph.direction,
    data: graph.data,
    ...(graph.style !== undefined && { style: graph.style }),
    nodes: graph.nodes.map((node) => {
      const size = sizes.get(node.id)!;
      const simNode = byId.get(node.id)!;
      return {
        ...toNodeConfig(node),
        ...size,
        x: (simNode.x ?? 0) - size.width / 2,
        y: (simNode.y ?? 0) - size.height / 2,
      };
    }),
    edges: graph.edges.map((edge) => toEdgeConfig(edge)),
  });
}

/**
 * Run {@link genForceLayout} to completion and return the settled
 * {@link VisualGraph}. Convenience for non-animated use.
 *
 * @example
 * ```ts
 * import { getForceLayout } from '@statelyai/graph/layout/d3-force';
 *
 * const laidOut = getForceLayout(graph, { seed: 42 });
 * ```
 */
export function getForceLayout(
  graph: Graph | VisualGraph,
  options?: ForceLayoutOptions,
): VisualGraph {
  const generator = genForceLayout(graph, options);
  for (;;) {
    const step = generator.next();
    if (step.done) return step.value;
  }
}
