import type {
  EntityRect,
  Graph,
  GraphNode,
  Point,
  VisualGraph,
} from '../types';
import { getLCA } from '../queries';

/**
 * Common options understood by every layout adapter. Engine-specific options
 * extend this per adapter.
 */
export interface LayoutOptions {
  /**
   * Layout direction. Defaults to `graph.direction ?? 'down'`.
   */
  direction?: 'up' | 'down' | 'left' | 'right';
  /**
   * Spacing hints (engines map these to their native options where the
   * mapping is well-defined; engines without one ignore them — see each
   * adapter's JSDoc).
   */
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
  /**
   * Portable layout constraints. **Advisory**, like port `direction`: engines
   * that can express a constraint honor it, others ignore it. Per-adapter
   * support is documented on each adapter.
   */
  constraints?: LayoutConstraints;
}

/**
 * Portable constraints understood by (some) layout adapters.
 *
 * | Constraint | ELK | Graphviz (dot) | dagre | force engines |
 * |------------|-----|----------------|-------|----------------|
 * | `layer`    | partitions | `rank=same` groups | ignored | ignored |
 */
export interface LayoutConstraints {
  /**
   * Assign nodes to ordered layers along the flow axis (`0`, `1`, `2`, …;
   * `undefined` leaves the node unconstrained). Nodes with the same value
   * land in the same layer; smaller values come earlier in the layout
   * direction. ELK maps this to partitions
   * (`elk.partitioning.partition`); the Graphviz `dot` engine maps it to
   * `{ rank=same; … }` groups (same-layer grouping — ordering *between*
   * constrained layers still follows the edges).
   */
  layer?: (node: GraphNode) => number | undefined;
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

/** Return a graph copy with a {@link LayoutFrame}'s positions applied. */
export function getGraphWithLayoutFrame<TGraph extends Graph>(
  graph: TGraph,
  frame: LayoutFrame,
): TGraph {
  return {
    ...graph,
    nodes: graph.nodes.map((node) => {
      const position = frame.positions[node.id];
      return position === undefined
        ? node
        : { ...node, x: position.x, y: position.y };
    }),
    edges: [...graph.edges],
  } as TGraph;
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

export interface LayoutTransitionOptions {
  /** Number of frames to yield. Default: 30. */
  steps?: number;
  /**
   * Easing function mapping linear progress `t` (0 → 1] to eased progress.
   * Default: smoothstep (`t² · (3 − 2t)`).
   */
  ease?: (t: number) => number;
}

/**
 * Animate between two layouts of the same graph: yields interpolated
 * {@link LayoutFrame}s from the node positions in `from` to those in `to`
 * (drive them with {@link applyLayoutFrame}, e.g. one per animation frame),
 * and returns `to`. This is what makes layouts swappable live — lay out with
 * one engine, re-lay out with another, and tween between them.
 *
 * Nodes are matched by id; nodes without a position in `from` (or absent from
 * it) start at their `to` position. Edge routes are not interpolated — frames
 * carry node positions only; hide or re-route edges during the transition.
 * `alpha` cools linearly 1 → 0 like the physics layouts.
 *
 * @example
 * ```ts
 * const next = await getElkLayout(graph);
 * for (const frame of genLayoutTransition(graph, next)) {
 *   applyLayoutFrame(graph, frame);
 *   render(graph);
 * }
 * ```
 */
export function* genLayoutTransition(
  from: Graph | VisualGraph,
  to: VisualGraph,
  options?: LayoutTransitionOptions,
): Generator<LayoutFrame, VisualGraph> {
  const steps = Math.max(1, Math.floor(options?.steps ?? 30));
  const ease = options?.ease ?? ((t: number) => t * t * (3 - 2 * t));
  const fromById = new Map(from.nodes.map((node) => [node.id, node]));
  const tweens = to.nodes.map((node) => {
    const fromNode = fromById.get(node.id);
    const hasStart = fromNode?.x !== undefined && fromNode.y !== undefined;
    return {
      id: node.id,
      startX: hasStart ? fromNode.x! : node.x,
      startY: hasStart ? fromNode.y! : node.y,
      endX: node.x,
      endY: node.y,
    };
  });

  for (let step = 1; step <= steps; step++) {
    const t = ease(step / steps);
    const positions: LayoutFrame['positions'] = {};
    for (const tween of tweens) {
      positions[tween.id] = {
        x: tween.startX + (tween.endX - tween.startX) * t,
        y: tween.startY + (tween.endY - tween.startY) * t,
      };
    }
    yield { positions, alpha: 1 - step / steps };
  }
  return to;
}

/**
 * **Mutable.** Shift the graph's geometry by `(dx, dy)` in place: node
 * positions, edge route `points`, and edge label rects. Non-structural, so no
 * index invalidation is needed.
 *
 * Hierarchy-aware: child nodes (`parentId` set) use parent-relative
 * coordinates (the ELK/xyflow convention), so only top-level nodes are
 * shifted — children move with their parents. Likewise, an edge's geometry is
 * shifted only when its containing coordinate system is the root (the LCA of
 * its endpoints is no node).
 */
export function translateGraph(graph: Graph, dx: number, dy: number): void {
  for (const node of graph.nodes) {
    if (node.parentId != null) continue;
    if (node.x !== undefined) node.x += dx;
    if (node.y !== undefined) node.y += dy;
  }
  for (const edge of graph.edges) {
    if (getLCA(graph, edge.sourceId, edge.targetId) !== undefined) continue;
    if (edge.x !== undefined) edge.x += dx;
    if (edge.y !== undefined) edge.y += dy;
    for (const point of edge.points ?? []) {
      point.x += dx;
      point.y += dy;
    }
  }
}

/** Return a graph copy with its root geometry shifted by `(dx, dy)`. */
export function getTranslatedGraph<TGraph extends Graph>(
  graph: TGraph,
  dx: number,
  dy: number,
): TGraph {
  const next = {
    ...graph,
    nodes: graph.nodes.map((node) =>
      node.parentId == null ? { ...node } : node,
    ),
    edges: graph.edges.map((edge) =>
      getLCA(graph, edge.sourceId, edge.targetId) === undefined
        ? {
            ...edge,
            ...(edge.points !== undefined && {
              points: edge.points.map((point) => ({ ...point })),
            }),
          }
        : edge,
    ),
  } as TGraph;
  translateGraph(next, dx, dy);
  return next;
}

/**
 * **Mutable.** Translate the graph in place so its {@link getLayoutBounds}
 * center coincides with `rect`'s center — e.g. center a fresh layout in the
 * viewport. Graphs without geometry are left untouched.
 *
 * @example
 * ```ts
 * centerGraph(laidOut, { x: 0, y: 0, width: canvas.width, height: canvas.height });
 * ```
 */
export function centerGraph(graph: Graph, rect: EntityRect): void {
  const bounds = getLayoutBounds(graph);
  const dx = rect.x + rect.width / 2 - (bounds.x + bounds.width / 2);
  const dy = rect.y + rect.height / 2 - (bounds.y + bounds.height / 2);
  translateGraph(graph, dx, dy);
}

/** Return a graph copy centered within `rect`. */
export function getCenteredGraph<TGraph extends Graph>(
  graph: TGraph,
  rect: EntityRect,
): TGraph {
  const bounds = getLayoutBounds(graph);
  const dx = rect.x + rect.width / 2 - (bounds.x + bounds.width / 2);
  const dy = rect.y + rect.height / 2 - (bounds.y + bounds.height / 2);
  return getTranslatedGraph(graph, dx, dy);
}
