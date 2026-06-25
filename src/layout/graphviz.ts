import { Graphviz } from '@hpcc-js/wasm-graphviz';
import type { Graph, Point, VisualGraph } from '../types';
import { createVisualGraph } from '../graph';
import { toNodeConfig, toEdgeConfig } from '../config';
import { getNodeSize, type LayoutOptions } from './index';

/** Graphviz layout engines supported by the adapter. */
export type GraphvizEngine =
  | 'dot'
  | 'neato'
  | 'fdp'
  | 'sfdp'
  | 'circo'
  | 'twopi'
  | 'osage'
  | 'patchwork';

export interface GraphvizLayoutOptions extends LayoutOptions {
  /** Graphviz layout engine. Defaults to `'dot'`. */
  engine?: GraphvizEngine;
  /**
   * Raw Graphviz graph attributes, emitted last (override everything).
   * See https://graphviz.org/doc/info/attrs.html
   */
  graphAttributes?: Record<string, string>;
}

// Graphviz measures node sizes in inches; positions in points.
const POINTS_PER_INCH = 72;

// --- DOT emission (internal) ---
//
// We build the DOT input ourselves rather than reusing toDOT: layout needs
// size attributes (width/height/fixedsize) that the format emitter doesn't
// produce, and coupling the adapter to the format would force layout concerns
// into it. The escaping below mirrors src/formats/dot/index.ts.

const DOT_KEYWORDS = new Set([
  'node',
  'edge',
  'graph',
  'digraph',
  'subgraph',
  'strict',
]);

function escapeId(id: string): string {
  if (
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id) &&
    !DOT_KEYWORDS.has(id.toLowerCase())
  ) {
    return id;
  }
  return `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

function escapeLabel(label: string): string {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n');
}

const DIRECTION_TO_RANKDIR: Record<string, string> = {
  down: 'TB',
  up: 'BT',
  right: 'LR',
  left: 'RL',
};

// --- Graphviz JSON (json0) output shapes — only the fields we read ---

interface GraphvizJsonObject {
  _gvid: number;
  name: string;
  /** "x,y" — node center, points, y-up. */
  pos?: string;
  /** Inches. */
  width?: string;
  height?: string;
}

interface GraphvizJsonEdge {
  _gvid: number;
  tail: number;
  head: number;
  /**
   * Spline string: optional `e,x,y` / `s,x,y` arrow-endpoint prefixes
   * followed by b-spline control points `x1,y1 x2,y2 ...` (tail → head).
   */
  pos?: string;
  /** "x,y" — label center, points, y-up. */
  lp?: string;
}

interface GraphvizJsonOutput {
  /** Bounding box "x0,y0,x1,y1" (lower-left origin, y-up). */
  bb?: string;
  objects?: GraphvizJsonObject[];
  edges?: GraphvizJsonEdge[];
}

function parsePoint(pos: string): Point {
  const [x, y] = pos.split(',').map(Number);
  return { x, y };
}

/**
 * Parse a Graphviz spline `pos` string into route points (tail → head),
 * including the arrow endpoints: `s,x,y` (tail arrow tip) is prepended and
 * `e,x,y` (head arrow tip) is appended to the b-spline control points.
 */
function parseSplinePos(pos: string): Point[] {
  let start: Point | undefined;
  let end: Point | undefined;
  const controls: Point[] = [];
  for (const token of pos.trim().split(/\s+/)) {
    if (token.startsWith('e,')) {
      end = parsePoint(token.slice(2));
    } else if (token.startsWith('s,')) {
      start = parsePoint(token.slice(2));
    } else {
      controls.push(parsePoint(token));
    }
  }
  const points = [...controls];
  if (start) points.unshift(start);
  if (end) points.push(end);
  return points;
}

let graphvizPromise: Promise<Graphviz> | undefined;

/**
 * Lay out a graph with Graphviz (via `@hpcc-js/wasm-graphviz`, an optional
 * peer dependency). Pure: returns a new {@link VisualGraph} with node
 * positions/sizes, routed edge `points` (`routing: 'splines'` — Graphviz
 * b-spline control points, tail → head, endpoints included), and computed
 * edge label rects (edge `x`/`y`).
 *
 * Node sizes are resolved via {@link getNodeSize} and passed to Graphviz as
 * fixed sizes, so layout never depends on Graphviz's own text measurement.
 *
 * Notes:
 * - Compound graphs (`parentId`) are not supported — use `getElkLayout`, or
 *   `getFlattenedGraph()` the graph first. (Graphviz clusters: planned.)
 * - In a directed graph, edges with `mode: 'undirected'` are laid out as
 *   directed but drawn without arrowheads (`dir=none`); in an undirected
 *   graph, per-edge `mode: 'directed'` overrides are ignored (DOT `graph`
 *   has no directed edge operator).
 * - `options.seed` maps to the Graphviz `start` attribute (used by the
 *   randomized engines neato/fdp/sfdp; ignored by deterministic engines).
 * - `options.constraints.layer` maps to `{ rank=same; … }` groups (`dot`
 *   engine only — the other engines have no rank concept).
 *
 * @example
 * ```ts
 * import { getGraphvizLayout } from '@statelyai/graph/layout/graphviz';
 *
 * const laidOut = await getGraphvizLayout(graph, {
 *   engine: 'dot',
 *   measure: (node) => measureText(node.label),
 * });
 * ```
 */
export async function getGraphvizLayout(
  graph: Graph | VisualGraph,
  options?: GraphvizLayoutOptions,
): Promise<VisualGraph> {
  const compoundNode = graph.nodes.find((node) => node.parentId != null);
  if (compoundNode) {
    throw new Error(
      `getGraphvizLayout: compound graphs are not supported by the Graphviz adapter yet ` +
        `(node "${compoundNode.id}" has parentId "${compoundNode.parentId}"). ` +
        `Use getElkLayout for hierarchical layout, or getFlattenedGraph() the graph first.`,
    );
  }

  const engine = options?.engine ?? 'dot';
  const isDirected = graph.mode !== 'undirected';
  const direction = options?.direction ?? graph.direction;

  // Resolved size per node, reused for the output (Graphviz echoes sizes in
  // inches; ours are the source of truth).
  const sizes = new Map(
    graph.nodes.map((node) => [node.id, getNodeSize(node, options)]),
  );

  // --- Emit DOT ---
  const lines: string[] = [];
  lines.push(`${isDirected ? 'digraph' : 'graph'} ${escapeId(graph.id)} {`);
  if (direction) {
    lines.push(`  rankdir=${DIRECTION_TO_RANKDIR[direction] ?? 'TB'};`);
  }
  if (options?.spacing?.node !== undefined) {
    lines.push(`  nodesep=${options.spacing.node / POINTS_PER_INCH};`);
  }
  if (options?.spacing?.layer !== undefined) {
    lines.push(`  ranksep=${options.spacing.layer / POINTS_PER_INCH};`);
  }
  if (options?.seed !== undefined) {
    lines.push(`  start=${options.seed};`);
  }
  for (const [key, value] of Object.entries(options?.graphAttributes ?? {})) {
    lines.push(`  ${escapeId(key)}="${escapeLabel(value)}";`);
  }
  for (const node of graph.nodes) {
    const { width, height } = sizes.get(node.id)!;
    lines.push(
      `  ${escapeId(node.id)} [width=${width / POINTS_PER_INCH}, height=${height / POINTS_PER_INCH}, fixedsize=true, shape=box];`,
    );
  }
  // constraints.layer → dot rank=same groups (same-layer grouping; ordering
  // between layers still follows the edges). Other engines have no ranks.
  const layerOf = options?.constraints?.layer;
  if (engine === 'dot' && layerOf) {
    const layers = new Map<number, string[]>();
    for (const node of graph.nodes) {
      const layer = layerOf(node);
      if (layer === undefined) continue;
      let ids = layers.get(layer);
      if (ids === undefined) layers.set(layer, (ids = []));
      ids.push(node.id);
    }
    for (const [, ids] of [...layers].sort((a, b) => a[0] - b[0])) {
      lines.push(`  { rank=same; ${ids.map(escapeId).join('; ')}; }`);
    }
  }
  for (const edge of graph.edges) {
    const attrs: string[] = [];
    if (edge.label) attrs.push(`label="${escapeLabel(edge.label)}"`);
    if (isDirected && edge.mode === 'undirected') attrs.push('dir=none');
    const attrStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
    lines.push(
      `  ${escapeId(edge.sourceId)} ${isDirected ? '->' : '--'} ${escapeId(edge.targetId)}${attrStr};`,
    );
  }
  lines.push('}');
  const dot = lines.join('\n');

  // --- Run layout ---
  const graphviz = await (graphvizPromise ??= Graphviz.load());
  let outputJson: string;
  try {
    outputJson = graphviz.layout(dot, 'json', engine);
  } catch (e) {
    // The WASM wrapper throws non-Error values for Graphviz errors.
    throw new Error(
      `getGraphvizLayout: Graphviz (engine "${engine}") failed — ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  const output: GraphvizJsonOutput = JSON.parse(outputJson);

  // Graphviz output is y-up with a lower-left origin at bb's x0,y0 (always
  // 0,0 in output); flip to y-down screen coordinates: y' = yMax − y.
  const yMax = output.bb ? Number(output.bb.split(',')[3]) : 0;
  const flip = (p: Point): Point => ({ x: p.x, y: yMax - p.y });

  // json0 `name` is the original (unescaped) node id.
  const objectsByName = new Map(
    (output.objects ?? []).map((obj) => [obj.name, obj]),
  );
  // Edge _gvids are assigned in DOT definition order, which is our emission
  // order, so output.edges[i] corresponds to graph.edges[i].
  const outputEdges = output.edges ?? [];

  return createVisualGraph({
    id: graph.id,
    mode: graph.mode,
    initialNodeId: graph.initialNodeId ?? undefined,
    direction,
    data: graph.data,
    ...(graph.style !== undefined && { style: graph.style }),
    nodes: graph.nodes.map((node) => {
      const config = toNodeConfig(node);
      const obj = objectsByName.get(node.id);
      const size = sizes.get(node.id)!;
      const width =
        obj?.width !== undefined
          ? Number(obj.width) * POINTS_PER_INCH
          : size.width;
      const height =
        obj?.height !== undefined
          ? Number(obj.height) * POINTS_PER_INCH
          : size.height;
      if (obj?.pos !== undefined) {
        // pos is the node center; convert to top-left.
        const center = flip(parsePoint(obj.pos));
        config.x = center.x - width / 2;
        config.y = center.y - height / 2;
      }
      config.width = width;
      config.height = height;
      return config;
    }),
    edges: graph.edges.map((edge, i) => {
      const config = toEdgeConfig(edge);
      const out = outputEdges[i];
      if (out?.pos !== undefined) {
        config.points = parseSplinePos(out.pos).map(flip);
        config.routing = 'splines';
      }
      if (out?.lp !== undefined) {
        // lp is the label center; convert to the label rect's top-left using
        // the edge's known label size (0 when unknown).
        const center = flip(parsePoint(out.lp));
        config.x = center.x - (edge.width ?? 0) / 2;
        config.y = center.y - (edge.height ?? 0) / 2;
      }
      return config;
    }),
  });
}
