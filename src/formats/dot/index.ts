import parse from 'dotparser';
import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';

/**
 * Round-trip preservation of DOT constructs that this library does not model
 * as first-class fields.
 *
 * Following the convention used by the other format converters (graphml, gexf,
 * gml store unmapped state inside `entity.data`), everything DOT-specific that
 * has no native home is parked under a single namespaced `dot` key inside the
 * corresponding entity's `data`. The value is plain JSON — no functions,
 * classes, or symbols — so the graph stays serializable.
 *
 * - Graph `data.dot` — {@link DotGraphPreserve}: leftover `graph [...]`
 *   attributes (bgcolor, fontname, …), the `node [...]` / `edge [...]` default
 *   attribute bags, and `rank=same` (and other `rank`) groups.
 * - Node/Edge `data.dot` — {@link DotEntityPreserve}: any attribute not mapped
 *   to a native field (`label`, `shape`, `color`), plus HTML-label and compass
 *   markers.
 *
 * `toDOT` reads these bags back out and re-emits them, so
 * `fromDOT(toDOT(fromDOT(x)))` is stable for the covered constructs.
 */
interface DotEntityPreserve {
  /** DOT attributes with no native field, verbatim. */
  attrs?: Record<string, string>;
  /** True when `label` came from an HTML-like `<...>` value; re-emit with `<>`. */
  labelHtml?: boolean;
  /** Compass point on the source endpoint of an edge (e.g. `n`, `se`). */
  sourceCompass?: string;
  /** Compass point on the target endpoint of an edge. */
  targetCompass?: string;
}

interface DotRankGroup {
  /** `rank` value, e.g. `same`, `min`, `max`, `source`, `sink`. */
  rank: string;
  /** Node ids constrained to that rank. */
  nodes: string[];
}

interface DotGraphPreserve {
  /** Leftover `graph [...]` attributes (excludes `rankdir`, mapped to direction). */
  attrs?: Record<string, string>;
  /** `node [...]` default attributes in effect at graph scope. */
  nodeDefaults?: Record<string, string>;
  /** `edge [...]` default attributes in effect at graph scope. */
  edgeDefaults?: Record<string, string>;
  /** `rank=same` (and other rank) groups. */
  ranks?: DotRankGroup[];
}

/** Node attribute names mapped to native fields — excluded from the `dot` bag. */
const MODELED_NODE_ATTRS = new Set(['label', 'shape', 'fillcolor', 'color', 'style']);
/** Edge attribute names mapped to native fields — excluded from the `dot` bag. */
const MODELED_EDGE_ATTRS = new Set(['label', 'color']);

/** DOT compass points, in the port syntax `node:port:compass`. */
const COMPASS_POINTS = new Set([
  'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'c', '_',
]);

function getDotPreserve(
  data: unknown,
): DotEntityPreserve | undefined {
  if (data && typeof data === 'object' && 'dot' in data) {
    return (data as { dot?: DotEntityPreserve }).dot;
  }
  return undefined;
}

/** Partition an attr map into modeled vs. leftover (preserved) attributes. */
function leftoverAttrs(
  attrs: Record<string, string>,
  modeled: Set<string>,
): Record<string, string> | undefined {
  const rest: Record<string, string> = {};
  for (const [k, v] of Object.entries(attrs)) {
    if (!modeled.has(k)) rest[k] = v;
  }
  return Object.keys(rest).length > 0 ? rest : undefined;
}

// --- toDOT ---

/** DOT reserved keywords — must be quoted when used as identifiers. */
const DOT_KEYWORDS = new Set([
  'node',
  'edge',
  'graph',
  'digraph',
  'subgraph',
  'strict',
]);

/** Escape a DOT identifier */
function escapeId(id: string): string {
  if (
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id) &&
    !DOT_KEYWORDS.has(id.toLowerCase())
  ) {
    return id;
  }
  return `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Escape a DOT label string */
function escapeLabel(label: string): string {
  return label
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    // A raw newline inside a quoted string is invalid DOT; \n is the DOT
    // line-break escape.
    .replace(/\n/g, '\\n');
}

/**
 * Invert {@link escapeLabel}. dotparser unescapes `\"` itself but passes
 * `\\` and `\n` through verbatim.
 */
function unescapeLabel(label: string): string {
  return label.replace(/\\(\\|n)/g, (_, ch) => (ch === 'n' ? '\n' : '\\'));
}

function formatEndpoint(id: string, port?: string, compass?: string): string {
  let out = escapeId(id);
  if (port) out += `:${escapeId(port)}`;
  if (compass) out += `:${escapeId(compass)}`;
  return out;
}

/**
 * Format a `key=value` attribute. HTML-like labels are emitted with `<...>`
 * delimiters (verbatim, no escaping); everything else is a quoted string.
 */
function formatAttr(key: string, value: string, html = false): string {
  if (html) return `${key}=<${value}>`;
  return `${key}="${escapeLabel(value)}"`;
}

const DIRECTION_TO_RANKDIR: Record<string, string> = {
  down: 'TB',
  up: 'BT',
  right: 'LR',
  left: 'RL',
};

const SHAPE_TO_DOT: Record<string, string> = {
  rectangle: 'box',
  ellipse: 'ellipse',
  circle: 'circle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  parallelogram: 'parallelogram',
};

/**
 * Converts a graph to a DOT (Graphviz) format string.
 *
 * @example
 * ```ts
 * import { createGraph, toDOT } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: { a: {}, b: {} },
 *   edges: [{ source: 'a', target: 'b' }],
 * });
 *
 * const dot = toDOT(graph);
 * // digraph "" {
 * //   a;
 * //   b;
 * //   a -> b;
 * // }
 * ```
 */
export function toDOT(graph: Graph): string {
  const isDirected = graph.mode !== 'undirected';
  const keyword = isDirected ? 'digraph' : 'graph';
  const edgeOp = isDirected ? '->' : '--';

  const lines: string[] = [];
  lines.push(`${keyword} ${escapeId(graph.id)} {`);

  if (graph.direction) {
    const rankdir = DIRECTION_TO_RANKDIR[graph.direction] ?? 'TB';
    lines.push(`  rankdir=${rankdir};`);
  }

  // Preserved graph-level state: bgcolor/fontname/… graph attrs and node/edge
  // default attribute bags (see DotGraphPreserve).
  const gp = (graph.data as { dot?: DotGraphPreserve } | undefined)?.dot;
  if (gp?.attrs) {
    for (const [k, v] of Object.entries(gp.attrs)) {
      lines.push(`  ${formatAttr(k, v)};`);
    }
  }
  if (gp?.nodeDefaults && Object.keys(gp.nodeDefaults).length > 0) {
    const parts = Object.entries(gp.nodeDefaults).map(([k, v]) => formatAttr(k, v));
    lines.push(`  node [${parts.join(', ')}];`);
  }
  if (gp?.edgeDefaults && Object.keys(gp.edgeDefaults).length > 0) {
    const parts = Object.entries(gp.edgeDefaults).map(([k, v]) => formatAttr(k, v));
    lines.push(`  edge [${parts.join(', ')}];`);
  }

  for (const node of graph.nodes) {
    const p = getDotPreserve(node.data);
    const attrs: string[] = [];
    if (node.label) attrs.push(formatAttr('label', node.label, p?.labelHtml));
    if (node.shape) {
      const dotShape = SHAPE_TO_DOT[node.shape] ?? node.shape;
      attrs.push(`shape=${dotShape}`);
    }
    if (node.color) attrs.push(`fillcolor="${escapeLabel(node.color)}" style=filled`);
    if (p?.attrs) {
      for (const [k, v] of Object.entries(p.attrs)) attrs.push(formatAttr(k, v));
    }
    if (attrs.length > 0) {
      lines.push(`  ${escapeId(node.id)} [${attrs.join(', ')}];`);
    } else {
      lines.push(`  ${escapeId(node.id)};`);
    }
  }

  for (const edge of graph.edges) {
    const p = getDotPreserve(edge.data);
    const attrs: string[] = [];
    if (edge.label) attrs.push(formatAttr('label', edge.label, p?.labelHtml));
    if (edge.color) attrs.push(`color="${escapeLabel(edge.color)}"`);
    if (p?.attrs) {
      for (const [k, v] of Object.entries(p.attrs)) attrs.push(formatAttr(k, v));
    }
    const attrStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
    lines.push(
      `  ${formatEndpoint(edge.sourceId, edge.sourcePort, p?.sourceCompass)} ${edgeOp} ${formatEndpoint(edge.targetId, edge.targetPort, p?.targetCompass)}${attrStr};`,
    );
  }

  // Preserved `rank=same` (and other rank) groups, emitted as anonymous
  // subgraphs so Graphviz re-applies the constraint.
  if (gp?.ranks) {
    for (const group of gp.ranks) {
      const members = group.nodes.map((id) => `${escapeId(id)};`).join(' ');
      lines.push(`  { rank=${escapeId(group.rank)}; ${members} }`);
    }
  }

  lines.push('}');
  return lines.join('\n');
}

// --- fromDOT ---

const RANKDIR_TO_DIRECTION: Record<string, Graph['direction']> = {
  TB: 'down',
  BT: 'up',
  LR: 'right',
  RL: 'left',
};

const DOT_TO_SHAPE: Record<string, string> = {
  box: 'rectangle',
  rect: 'rectangle',
  rectangle: 'rectangle',
  ellipse: 'ellipse',
  oval: 'ellipse',
  circle: 'circle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  parallelogram: 'parallelogram',
};

interface AttrMap {
  [key: string]: string;
}

interface EndpointRef {
  id: string;
  port?: string;
  compass?: string;
}

function getPortId(nodeId: unknown): string | undefined {
  const port = (nodeId as { port?: { id?: unknown } }).port;
  return typeof port?.id === 'string' ? port.id : undefined;
}

function getCompass(nodeId: unknown): string | undefined {
  const port = (nodeId as { port?: { compass_pt?: unknown } }).port;
  const cp = port?.compass_pt;
  return typeof cp === 'string' && COMPASS_POINTS.has(cp) ? cp : undefined;
}

/**
 * A DOT attribute value: dotparser yields a string/number for quoted or bareword
 * values, and `{ type: 'id', value, html: true }` for HTML-like `<...>` values.
 */
type DotAttrEq =
  | string
  | number
  | { type: 'id'; value: string; html?: boolean };

function attrValueString(eq: DotAttrEq): string {
  if (eq !== null && typeof eq === 'object') return eq.value;
  return String(eq);
}

function isHtmlAttr(eq: DotAttrEq): boolean {
  return eq !== null && typeof eq === 'object' && eq.html === true;
}

function attrsToMap(attrList: { id: string; eq: DotAttrEq }[]): AttrMap {
  const map: AttrMap = {};
  for (const a of attrList) {
    map[a.id] = attrValueString(a.eq);
  }
  return map;
}

/** Names of attributes in the list whose value is an HTML-like `<...>` value. */
function htmlAttrNames(attrList: { id: string; eq: DotAttrEq }[]): Set<string> {
  const names = new Set<string>();
  for (const a of attrList) {
    if (isHtmlAttr(a.eq)) names.add(a.id);
  }
  return names;
}

function nodeFromAttrs(
  id: string,
  attrs: AttrMap,
  defaults: AttrMap,
  parentId: string | null,
  htmlNames?: Set<string>,
): GraphNode {
  const merged = { ...defaults, ...attrs };
  const labelIsHtml = htmlNames?.has('label') ?? false;
  const rawLabel = merged['label'] ?? '';
  // HTML-like labels are preserved verbatim (no unescaping); plain labels use
  // the DOT string escapes.
  const label = labelIsHtml ? rawLabel : unescapeLabel(rawLabel);
  const rawShape = merged['shape'];
  const shape = rawShape ? (DOT_TO_SHAPE[rawShape] ?? rawShape) : undefined;
  const color = merged['fillcolor'] ?? merged['color'] ?? undefined;

  // Preserve leftover node-explicit attributes (defaults are preserved once at
  // graph scope, so they are not folded into the per-node bag).
  const rest = leftoverAttrs(attrs, MODELED_NODE_ATTRS);
  const preserve: DotEntityPreserve = {
    ...(rest && { attrs: rest }),
    ...(labelIsHtml && { labelHtml: true }),
  };
  const data =
    Object.keys(preserve).length > 0 ? ({ dot: preserve } as any) : undefined;

  return {
    type: 'node',
    id,
    parentId,
    initialNodeId: null,
    label,
    data,
    ...(shape && { shape }),
    ...(color && { color }),
  };
}

/**
 * Parses a DOT (Graphviz) format string into a graph.
 *
 * @example
 * ```ts
 * import { fromDOT } from '@statelyai/graph';
 *
 * const graph = fromDOT(`
 *   digraph {
 *     a -> b;
 *     b -> c;
 *   }
 * `);
 *
 * graph.nodes; // [{id: 'a', ...}, {id: 'b', ...}, {id: 'c', ...}]
 * graph.edges; // [{sourceId: 'a', targetId: 'b', ...}, ...]
 * ```
 */
export function fromDOT(dot: string): Graph {
  if (typeof dot !== 'string') {
    throw new Error('DOT: expected a string');
  }
  if (!dot.trim()) {
    throw new Error('DOT: input is empty');
  }

  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(dot);
  } catch (e: any) {
    throw new Error(`DOT: parse error — ${e.message}`);
  }

  if (!ast || ast.length === 0) {
    throw new Error('DOT: no graph found');
  }

  const root = ast[0];
  const isDirected = root.type === 'digraph';

  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  let edgeIdx = 0;
  let direction: Graph['direction'] | undefined;

  // Accumulated graph-level DOT state with no native field, for round-tripping.
  const graphPreserveAttrs: Record<string, string> = {};
  let rootNodeDefaults: Record<string, string> | undefined;
  let rootEdgeDefaults: Record<string, string> | undefined;
  const rankGroups: DotRankGroup[] = [];

  function ensureNode(
    id: string,
    parentId: string | null,
    defaults: AttrMap,
  ): void {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, nodeFromAttrs(id, {}, defaults, parentId));
    }
  }

  function getNodeIdsFromSubgraph(children: any[]): string[] {
    const ids = new Set<string>();

    function collect(statements: any[]): void {
      for (const stmt of statements) {
        switch (stmt.type) {
          case 'node_stmt': {
            ids.add(stmt.node_id.id);
            break;
          }
          case 'edge_stmt': {
            for (const item of stmt.edge_list) {
              if (item.type === 'node_id') {
                ids.add(item.id);
              } else if (item.type === 'subgraph') {
                collect(item.children);
              }
            }
            break;
          }
          case 'subgraph': {
            collect(stmt.children);
            break;
          }
        }
      }
    }

    collect(children);
    return [...ids];
  }

  function walkChildren(
    children: typeof root.children,
    parentId: string | null,
    nodeDefaults: AttrMap,
    edgeDefaults: AttrMap,
  ): void {
    let nd = { ...nodeDefaults };
    let ed = { ...edgeDefaults };

    for (const stmt of children) {
      switch (stmt.type) {
        case 'attr_stmt': {
          if (stmt.target === 'node') {
            const map = attrsToMap(stmt.attr_list);
            nd = { ...nd, ...map };
            // Preserve `node [...]` defaults declared at graph scope.
            if (parentId === null) {
              rootNodeDefaults = { ...(rootNodeDefaults ?? {}), ...map };
            }
          } else if (stmt.target === 'edge') {
            const map = attrsToMap(stmt.attr_list);
            ed = { ...ed, ...map };
            // Preserve `edge [...]` defaults declared at graph scope.
            if (parentId === null) {
              rootEdgeDefaults = { ...(rootEdgeDefaults ?? {}), ...map };
            }
          } else if (stmt.target === 'graph') {
            const graphAttrs = attrsToMap(stmt.attr_list);
            for (const [k, v] of Object.entries(graphAttrs)) {
              if (k === 'rankdir') {
                direction = RANKDIR_TO_DIRECTION[v.toUpperCase()] ?? undefined;
              } else if (parentId === null) {
                // Preserve other graph attributes (bgcolor, fontname, …).
                graphPreserveAttrs[k] = v;
              }
            }
          }
          break;
        }

        case 'node_stmt': {
          const id = stmt.node_id.id;
          const attrs = attrsToMap(stmt.attr_list);
          const html = htmlAttrNames(stmt.attr_list);
          const node = nodeFromAttrs(id, attrs, nd, parentId, html);
          nodeMap.set(id, node);
          break;
        }

        case 'edge_stmt': {
          const edgeAttrs = attrsToMap(stmt.attr_list);
          const edgeHtml = htmlAttrNames(stmt.attr_list);
          const mergedEdgeAttrs = { ...ed, ...edgeAttrs };
          // Leftover edge-explicit attrs (defaults preserved once at graph scope).
          const edgeRest = leftoverAttrs(edgeAttrs, MODELED_EDGE_ATTRS);
          const labelIsHtml = edgeHtml.has('label');

          // Walk edge_list: each consecutive pair forms edges between endpoint sets.
          // DOT allows node IDs or subgraphs as endpoints; subgraphs expand to all
          // contained nodes (e.g., A -> {B C} == A->B and A->C).
          const endpointGroups: EndpointRef[][] = [];
          for (const item of stmt.edge_list) {
            if (item.type === 'node_id') {
              ensureNode(item.id, parentId, nd);
              endpointGroups.push([
                {
                  id: item.id,
                  ...(getPortId(item) && { port: getPortId(item) }),
                  ...(getCompass(item) && { compass: getCompass(item) }),
                },
              ]);
            } else if (item.type === 'subgraph') {
              walkChildren(item.children, parentId, nd, ed);
              const subNodeIds = getNodeIdsFromSubgraph(item.children);
              for (const subNodeId of subNodeIds) {
                ensureNode(subNodeId, parentId, nd);
              }
              if (subNodeIds.length > 0) {
                endpointGroups.push(subNodeIds.map((id) => ({ id })));
              }
            }
          }

          for (let i = 0; i < endpointGroups.length - 1; i++) {
            const left = endpointGroups[i];
            const right = endpointGroups[i + 1];
            for (const source of left) {
              for (const target of right) {
                const rawLabel = mergedEdgeAttrs['label'] ?? '';
                const preserve: DotEntityPreserve = {
                  ...(edgeRest && { attrs: edgeRest }),
                  ...(labelIsHtml && { labelHtml: true }),
                  ...(source.compass && { sourceCompass: source.compass }),
                  ...(target.compass && { targetCompass: target.compass }),
                };
                const edge: GraphEdge = {
                  type: 'edge',
                  id: `e${edgeIdx++}`,
                  sourceId: source.id,
                  targetId: target.id,
                  label: labelIsHtml ? rawLabel : unescapeLabel(rawLabel),
                  data:
                    Object.keys(preserve).length > 0
                      ? ({ dot: preserve } as any)
                      : (undefined as any),
                  ...(source.port && { sourcePort: source.port }),
                  ...(target.port && { targetPort: target.port }),
                  ...(mergedEdgeAttrs['color'] && {
                    color: mergedEdgeAttrs['color'],
                  }),
                };
                edges.push(edge);
              }
            }
          }
          break;
        }

        case 'subgraph': {
          // Extract subgraph-level graph attributes (label, rank, …).
          let subLabel = '';
          let rank: string | undefined;
          for (const child of stmt.children) {
            if (child.type === 'attr_stmt' && child.target === 'graph') {
              const ga = attrsToMap(child.attr_list);
              if (ga['label']) subLabel = unescapeLabel(ga['label']);
              if (ga['rank']) rank = ga['rank'];
            }
          }

          // A `rank=...` subgraph is a layout constraint, not a container.
          // Record the grouping and ensure its members exist, but do NOT
          // re-walk its statements: the bare node references inside would
          // otherwise clobber already-defined nodes (wiping their labels) and
          // its `rank=` graph attr would leak into the graph-level attr bag.
          if (rank) {
            const members = getNodeIdsFromSubgraph(stmt.children);
            rankGroups.push({ rank, nodes: members });
            for (const m of members) ensureNode(m, parentId, nd);
            break;
          }

          const subId = stmt.id ?? `subgraph_${nodeMap.size}`;
          const subNode: GraphNode = {
            type: 'node',
            id: subId,
            parentId,
            initialNodeId: null,
            label: subLabel,
            data: undefined as any,
          };
          nodeMap.set(subId, subNode);

          walkChildren(stmt.children, subId, nd, ed);
          break;
        }
      }
    }
  }

  walkChildren(root.children, null, {}, {});

  // Assemble preserved graph-level DOT state (see DotGraphPreserve). Only
  // populated when there is something to preserve, so plain graphs keep
  // `data: undefined`.
  const graphPreserve: DotGraphPreserve = {
    ...(Object.keys(graphPreserveAttrs).length > 0 && {
      attrs: graphPreserveAttrs,
    }),
    ...(rootNodeDefaults && { nodeDefaults: rootNodeDefaults }),
    ...(rootEdgeDefaults && { edgeDefaults: rootEdgeDefaults }),
    ...(rankGroups.length > 0 && { ranks: rankGroups }),
  };
  const graphData =
    Object.keys(graphPreserve).length > 0
      ? ({ dot: graphPreserve } as any)
      : (undefined as any);

  return {
    id: root.id ?? '',
    mode: isDirected ? 'directed' : 'undirected',
    initialNodeId: null,
    nodes: [...nodeMap.values()],
    edges,
    data: graphData,
    ...(direction && { direction }),
  };
}

/**
 * Bidirectional converter for DOT (Graphviz) format.
 *
 * @example
 * ```ts
 * import { dotConverter, createGraph } from '@statelyai/graph';
 *
 * const graph = createGraph({
 *   nodes: { a: {}, b: {} },
 *   edges: [{ source: 'a', target: 'b' }],
 * });
 *
 * const dot = dotConverter.to(graph);
 * const roundTripped = dotConverter.from(dot);
 * ```
 */
export const dotConverter: GraphFormatConverter<string> =
  createFormatConverter(toDOT, fromDOT);
