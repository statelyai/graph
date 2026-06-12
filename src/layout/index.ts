import type {
  EntityRect,
  Graph,
  GraphNode,
  Point,
  VisualGraph,
} from '../types';

/**
 * Common options understood by every layout adapter. Engine-specific options
 * extend this per adapter.
 */
export interface LayoutOptions {
  /**
   * Layout direction. Defaults to `graph.direction ?? 'down'`.
   */
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Spacing hints (engines map these to their native options). */
  spacing?: {
    /** Space between sibling nodes. */
    node?: number;
    /** Space between layers/ranks (hierarchical engines). */
    layer?: number;
  };
  /**
   * Node size resolver. Text measurement belongs to the renderer, so layout
   * adapters never guess: sizes come from this callback, falling back to the
   * node's own `width`/`height`, falling back to {@link DEFAULT_NODE_SIZE}.
   */
  measure?: (node: GraphNode) => { width: number; height: number };
  /**
   * Pinned nodes keep their current `x`/`y` (for engines that support
   * fixing, e.g. d3-force `fx`/`fy`).
   */
  isFixed?: (node: GraphNode) => boolean;
  /** Seed for engines with randomness — same seed, same layout. */
  seed?: number;
}

/**
 * A one-shot layout: pure function from graph to a positioned
 * {@link VisualGraph}. Async when the engine is async (ELK, Graphviz WASM) —
 * engine async-ness is not ours to hide.
 */
export type LayoutFn<O extends LayoutOptions = LayoutOptions> = (
  graph: Graph | VisualGraph,
  options?: O,
) => VisualGraph | Promise<VisualGraph>;

/**
 * One frame of an iterative (physics) layout: node positions by id, plus the
 * simulation's remaining energy. Positions are node *top-left* corners,
 * consistent with `VisualNode.x/y`.
 */
export interface LayoutFrame {
  positions: Record<string, Point>;
  /** Remaining simulation energy, 1 → 0. */
  alpha: number;
}

/**
 * An iterative layout (force simulations): each `next()` advances one tick
 * and yields a {@link LayoutFrame}; the caller owns pacing (e.g. one tick per
 * animation frame) and cancellation (drop the generator). The generator's
 * return value is the settled {@link VisualGraph}.
 */
export type IterativeLayoutFn<O extends LayoutOptions = LayoutOptions> = (
  graph: Graph | VisualGraph,
  options?: O,
) => Generator<LayoutFrame, VisualGraph>;

/** Fallback node size when neither `measure` nor node dimensions are set. */
export const DEFAULT_NODE_SIZE = { width: 100, height: 50 } as const;

/**
 * Resolve a node's layout size: `options.measure` → node `width`/`height` →
 * {@link DEFAULT_NODE_SIZE}. Zero sizes count as unset (layout engines
 * overlap zero-sized nodes).
 */
export function getNodeSize(
  node: GraphNode,
  options?: Pick<LayoutOptions, 'measure'>,
): { width: number; height: number } {
  const measured = options?.measure?.(node);
  if (measured) return measured;
  const width = node.width !== undefined && node.width > 0 ? node.width : 0;
  const height =
    node.height !== undefined && node.height > 0 ? node.height : 0;
  return {
    width: width || DEFAULT_NODE_SIZE.width,
    height: height || DEFAULT_NODE_SIZE.height,
  };
}

/**
 * **Mutable.** Write a {@link LayoutFrame}'s positions onto the graph's nodes
 * in place. Positions are non-structural, so this is safe under the index
 * contract (no `invalidateIndex` needed) and cheap enough for per-animation-
 * frame use. Nodes absent from the frame are left untouched.
 *
 * @example
 * ```ts
 * for (const frame of genForceLayout(graph)) {
 *   applyLayoutFrame(graph, frame);
 *   render(graph);
 * }
 * ```
 */
export function applyLayoutFrame(graph: Graph, frame: LayoutFrame): void {
  for (const node of graph.nodes) {
    const position = frame.positions[node.id];
    if (position !== undefined) {
      node.x = position.x;
      node.y = position.y;
    }
  }
}

/**
 * Bounding rect of all positioned nodes (and edge route points, when
 * present). Returns a zero rect for graphs with no geometry.
 *
 * @example
 * ```ts
 * const bounds = getLayoutBounds(laidOut);
 * svg.setAttribute('viewBox', `${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}`);
 * ```
 */
export function getLayoutBounds(graph: Graph | VisualGraph): EntityRect {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of graph.nodes) {
    if (node.x === undefined || node.y === undefined) continue;
    minX = Math.min(minX, node.x);
    minY = Math.min(minY, node.y);
    maxX = Math.max(maxX, node.x + (node.width ?? 0));
    maxY = Math.max(maxY, node.y + (node.height ?? 0));
  }
  for (const edge of graph.edges) {
    for (const point of edge.points ?? []) {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    }
  }

  if (minX === Infinity) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}
