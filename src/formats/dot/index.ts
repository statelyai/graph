import { createGraphDocumentConverter } from '../document';
import { getDOTDocumentPatch, getDOTDocumentProjection, getValidatedDOTString } from './document';
import parse from 'dotparser';
import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import { createFormatData, getFormatMetadata, getUserData } from '../xml-preservation';

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
  inheritedAttrs?: Record<string, string>;
  borderColor?: string;
  style?: string;
  subgraph?: boolean;
  memberships?: string[];
  /** DOT attributes with no native field, verbatim. */
  attrs?: Record<string, string>;
  /** True when `label` came from an HTML-like `<...>` value; re-emit with `<>`. */
  labelHtml?: boolean;
  /** Missing native node label inherits Graphviz's default \N; distinct from Graph ''. */
  implicitLabel?: boolean;
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
  strict?: boolean;
  subgraphs?: Array<{ id: string; parentId: string | null; attrs: Record<string, string>; nodes: string[] }>;
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
const MODELED_NODE_ATTRS = new Set(['label', 'shape', 'fillcolor', 'color', 'style', '_stately']);
/** Edge attribute names mapped to native fields — excluded from the `dot` bag. */
const MODELED_EDGE_ATTRS = new Set(['label', 'color', '_stately']);

/** DOT compass points, in the port syntax `node:port:compass`. */
const COMPASS_POINTS = new Set([
  'n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw', 'c', '_',
]);

function getDotPreserve(
  data: unknown,
): DotEntityPreserve | undefined {
  const metadata = getFormatMetadata(data, 'dot');
  if (metadata) return metadata.native;
  if (data && typeof data === 'object' && 'dot' in data) {
    return (data as { dot?: DotEntityPreserve }).dot;
  }
  return undefined;
}

/** Partition an attr map into modeled vs. leftover (preserved) attributes. */
function getLeftoverAttrs(
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
function getEscapedId(id: string): string {
  getValidatedDOTString(id);
  if (
    /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id) &&
    !DOT_KEYWORDS.has(id.toLowerCase())
  ) {
    return id;
  }
  return `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Escape a DOT label string */
function getEscapedLabel(label: string): string {
  return getValidatedDOTString(label)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    // A raw newline inside a quoted string is invalid DOT; \n is the DOT
    // line-break escape.
    .replace(/\n/g, '\\n');
}

/**
 * Invert {@link getEscapedLabel}. dotparser unescapes `\"` itself but passes
 * `\\` and `\n` through verbatim.
 */
function getUnescapedLabel(label: string): string {
  return label.replace(/\\(\\|n)/g, (_, ch) => (ch === 'n' ? '\n' : '\\'));
}

function getFormattedEndpoint(id: string, port?: string, compass?: string): string {
  let out = getEscapedId(id);
  if (port) out += `:${getEscapedId(port)}`;
  if (compass) out += `:${getEscapedId(compass)}`;
  return out;
}

/**
 * Format a `key=value` attribute. HTML-like labels are emitted with `<...>`
 * delimiters (verbatim, no escaping); everything else is a quoted string.
 */
function getFormattedAttr(key: string, value: string, html = false): string {
  getValidatedDOTString(key);
  if (html) return `${key}=<${getValidatedDOTString(value)}>`;
  return `${key}="${getEscapedLabel(value)}"`;
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
 * @remarks
 * Exported from the `@statelyai/graph/dot` subpath, which requires the optional
 * peer dependency `dotparser` (`npm install dotparser`). It is not re-exported
 * from the package root.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { toDOT } from '@statelyai/graph/dot';
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
  const gp = getDotPreserve(graph.data) as DotGraphPreserve | undefined;
  const isDirected = graph.mode !== 'undirected';
  const keyword = isDirected ? 'digraph' : 'graph';
  const edgeOp = isDirected ? '->' : '--';
  const lines = [`${gp?.strict ? 'strict ' : ''}${keyword} ${getEscapedId(graph.id)} {`];
  const graphExtension = {
    format: 'stately', version: 1, mode: graph.mode,
    ...(graph.initialNodeId != null && { initialNodeId: graph.initialNodeId }),
    ...(getDotUserData(graph.data) !== undefined && { data: getDotUserData(graph.data) }),
    ...(graph.style !== undefined && { style: graph.style }),
  };
  if (Object.keys(graphExtension).length > 3 || graph.mode === 'bidirectional') {
    lines.push(`  ${getFormattedAttr('_stately', JSON.stringify(graphExtension))};`);
  }
  if (graph.direction) lines.push(`  rankdir=${DIRECTION_TO_RANKDIR[graph.direction]};`);
  for (const [key, value] of Object.entries(gp?.attrs ?? {})) lines.push(`  ${getFormattedAttr(getEscapedId(key), value)};`);
  if (gp?.nodeDefaults) lines.push(`  node [${Object.entries(gp.nodeDefaults).map(([key,value]) => getFormattedAttr(getEscapedId(key),value)).join(', ')}];`);
  if (gp?.edgeDefaults) lines.push(`  edge [${Object.entries(gp.edgeDefaults).map(([key,value]) => getFormattedAttr(getEscapedId(key),value)).join(', ')}];`);
  const nodeIndex = new Map(graph.nodes.map((node) => [node.id,node]));
  const subgraphIndex = new Map(gp?.subgraphs?.map((subgraph) => [subgraph.id,subgraph]) ?? []);
  const parentIds = new Set(graph.nodes.flatMap((node) => node.parentId == null ? [] : [node.parentId]));
  const containers = new Set(graph.nodes.filter((node) => getDotPreserve(node.data)?.subgraph || parentIds.has(node.id)).map((node) => node.id));
  const children = new Map<string | null, GraphNode[]>();
  for (const node of graph.nodes) {
    const parent = node.parentId != null && containers.has(node.parentId) ? node.parentId : null;
    const group = children.get(parent) ?? [];
    group.push(node); children.set(parent, group);
  }
  const tasks: Array<{ node?: GraphNode; close?: boolean; indent: string }> = [...(children.get(null) ?? [])].reverse().map((node) => ({ node, indent: '  ' }));
  const visited = new Set<string>();
  while (tasks.length) {
    const task = tasks.pop()!;
    if (task.close) { lines.push(`${task.indent}}`); continue; }
    const node = task.node!;
    if (visited.has(node.id)) continue;
    visited.add(node.id);
    const p = getDotPreserve(node.data);
    if (containers.has(node.id)) {
      lines.push(`${task.indent}subgraph ${getEscapedId(node.id)} {`);
      if (node.label != null) lines.push(`${task.indent}  ${getFormattedAttr('label', node.label)};`);
      const extension = getEntityExtension(node);
      if (!p?.subgraph) extension.compound = true;
      if (node.shape !== undefined) extension.shape = node.shape;
      if (node.color !== undefined) extension.color = node.color;
      if (Object.keys(extension).length > 2) lines.push(`${task.indent}  ${getFormattedAttr('_stately',JSON.stringify(extension))};`);
      const native = subgraphIndex.get(node.id);
      for (const [key,value] of Object.entries(native?.attrs ?? {})) if (key !== 'label' && key !== '_stately') lines.push(`${task.indent}  ${getFormattedAttr(getEscapedId(key),value)};`);
      tasks.push({ close: true, indent: task.indent });
      for (const child of [...(children.get(node.id) ?? [])].reverse()) tasks.push({ node: child, indent: task.indent + '  ' });
      continue;
    }
    const attrs: string[] = [];
    if (node.label != null && !(node.label === '' && getFormatMetadata(node.data, 'dot')?.native?.implicitLabel)) attrs.push(getFormattedAttr('label',node.label,p?.labelHtml));
    if (node.shape) attrs.push(`shape=${getEscapedId(SHAPE_TO_DOT[node.shape] ?? node.shape)}`);
    if (node.color !== undefined) attrs.push(getFormattedAttr('fillcolor',node.color));
    if (p?.borderColor !== undefined) attrs.push(getFormattedAttr('color', p.borderColor));
    if (p?.style !== undefined) attrs.push(getFormattedAttr('style',p.style));
    else if (node.color !== undefined) attrs.push('style=filled');
    for (const [key,value] of Object.entries({ ...p?.inheritedAttrs, ...p?.attrs })) attrs.push(getFormattedAttr(getEscapedId(key),value));
    const extension = getEntityExtension(node);
    if (Object.keys(extension).length > 2) attrs.push(getFormattedAttr('_stately',JSON.stringify(extension)));
    lines.push(`${task.indent}${getEscapedId(node.id)}${attrs.length ? ` [${attrs.join(', ')}]` : ''};`);
  }
  for (const edge of graph.edges) {
    const p = getDotPreserve(edge.data);
    const attrs: string[] = [];
    if (edge.label != null) attrs.push(getFormattedAttr('label',edge.label,p?.labelHtml));
    if (edge.color !== undefined) attrs.push(getFormattedAttr('color',edge.color));
    for (const [key,value] of Object.entries({ ...p?.inheritedAttrs, ...p?.attrs })) attrs.push(getFormattedAttr(getEscapedId(key),value));
    const extension = getEntityExtension(edge);
    if (Object.keys(extension).length > 2) attrs.push(getFormattedAttr('_stately',JSON.stringify(extension)));
    if (edge.mode === 'bidirectional' || (edge.mode === undefined && graph.mode === 'bidirectional')) attrs.push('dir=both');
    else if (edge.mode === 'undirected' && isDirected) attrs.push('dir=none');
    lines.push(`  ${getFormattedEndpoint(edge.sourceId,edge.sourcePort,p?.sourceCompass)} ${edgeOp} ${getFormattedEndpoint(edge.targetId,edge.targetPort,p?.targetCompass)}${attrs.length ? ` [${attrs.join(', ')}]` : ''};`);
  }
  // Additional memberships are DOT subgraph references, not extra Graph nodes.
  for (const subgraph of gp?.subgraphs ?? []) {
    const extra = subgraph.nodes.filter((id) => nodeIndex.get(id)?.parentId !== subgraph.id);
    if (extra.length) lines.push(`  subgraph ${getEscapedId(subgraph.id)} { ${extra.map((id) => `${getEscapedId(id)};`).join(' ')} }`);
  }
  for (const rank of gp?.ranks ?? []) lines.push(`  { rank=${getEscapedId(rank.rank)}; ${rank.nodes.map((id) => `${getEscapedId(id)};`).join(' ')} }`);
  lines.push('}');
  return lines.join('\n');
}

function getDotUserData(data: unknown): any {
  if (getFormatMetadata(data,'dot')) return getUserData(data,'dot');
  if (data && typeof data === 'object' && Object.keys(data).length === 1 && 'dot' in data && (data as any).dot && typeof (data as any).dot === 'object' && ['attrs','inheritedAttrs','labelHtml','sourceCompass','targetCompass','borderColor','style','subgraph','nodeDefaults','edgeDefaults','ranks','subgraphs','strict'].some((key) => key in (data as any).dot)) return undefined;
  return data;
}

function getEntityExtension(entity: GraphNode | GraphEdge): Record<string, any> {
  const extension: Record<string, any> = { format: 'stately', version: 1 };
  if (entity.type === 'edge') extension.id = entity.id;
  if (entity.label === null) extension.nullLabel = true;
  for (const key of ['initialNodeId','ports','x','y','width','height','style','weight','points','routing','mode']) {
    if ((entity as any)[key] !== undefined && (key !== 'initialNodeId' || (entity as any)[key] !== null)) extension[key] = (entity as any)[key];
  }
  const data = getDotUserData(entity.data);
  if (data !== undefined) extension.data = data;
  return extension;
}

function getPrivateData(value: string | undefined): any {
  if (value === undefined) return undefined;
  try {
    const result = JSON.parse(getUnescapedLabel(value));
    return result?.format === 'stately' && result.version === 1 ? result : undefined;
  } catch { return undefined; }
}

function getPreservedData(data: unknown, native: DotEntityPreserve | DotGraphPreserve): any {
  if (Object.keys(native).length === 0) return data;
  return data === undefined && !('implicitLabel' in native) ? { dot: native } : createFormatData(data,'dot',{ native });
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

function getAttrValueString(eq: DotAttrEq): string {
  if (eq !== null && typeof eq === 'object') return eq.value;
  return String(eq);
}

function isHtmlAttr(eq: DotAttrEq): boolean {
  return eq !== null && typeof eq === 'object' && eq.html === true;
}

function getAttrsMap(attrList: { id: string; eq: DotAttrEq }[]): AttrMap {
  const map: AttrMap = {};
  for (const a of attrList) {
    map[a.id] = getAttrValueString(a.eq);
  }
  return map;
}

/** Names of attributes in the list whose value is an HTML-like `<...>` value. */
function getHtmlAttrNames(attrList: { id: string; eq: DotAttrEq }[]): Set<string> {
  const names = new Set<string>();
  for (const a of attrList) {
    if (isHtmlAttr(a.eq)) names.add(a.id);
  }
  return names;
}

function getNodeFromAttrs(
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
  const label = labelIsHtml ? rawLabel : getUnescapedLabel(rawLabel);
  const rawShape = merged['shape'];
  const shape = rawShape ? (DOT_TO_SHAPE[rawShape] ?? rawShape) : undefined;
  const color = merged['fillcolor'] ?? merged['color'] ?? undefined;

  // Preserve leftover node-explicit attributes (defaults are preserved once at
  // graph scope, so they are not folded into the per-node bag).
  const rest = getLeftoverAttrs(attrs, MODELED_NODE_ATTRS);
  const preserve: DotEntityPreserve = {
    ...(rest && { attrs: rest }),
    ...(getLeftoverAttrs(defaults, MODELED_NODE_ATTRS) && { inheritedAttrs: getLeftoverAttrs(defaults, MODELED_NODE_ATTRS) }),
    ...(merged['color'] !== undefined && { borderColor: merged['color'] }),
    ...((merged['style'] !== undefined || color !== undefined) && { style: merged['style'] ?? '' }),
    ...(labelIsHtml && { labelHtml: true }),
    ...(merged['label'] === undefined && !getPrivateData(attrs['_stately']) && { implicitLabel: true }),
  };
  const privateData = getPrivateData(attrs['_stately']);
  const data = getPreservedData(privateData?.data, preserve);

  const portNames = labelIsHtml ? [...label.matchAll(/\bPORT\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1])
    : ['record','Mrecord'].includes(rawShape ?? '') ? [...label.matchAll(/<([^<>]+)>/g)].map((match) => match[1]) : [];
  return {
    type: 'node',
    id,
    parentId,
    initialNodeId: privateData?.initialNodeId ?? null,
    label: merged['label'] === undefined && privateData?.nullLabel ? null : label,
    data,
    ...(portNames.length && { ports:[...new Set(portNames)].map((name) => ({name,direction:'inout' as const,data:null})) }),
    ...Object.fromEntries(['ports','x','y','width','height','style'].filter((key) => privateData?.[key] !== undefined).map((key) => [key,privateData[key]])),
    ...(shape && { shape }),
    ...(color !== undefined && { color }),
  };
}

/**
 * Parses a DOT (Graphviz) format string into a graph.
 *
 * @remarks
 * Exported from the `@statelyai/graph/dot` subpath, which requires the optional
 * peer dependency `dotparser` (`npm install dotparser`). It is not re-exported
 * from the package root.
 *
 * @example
 * ```ts
 * import { fromDOT } from '@statelyai/graph/dot';
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
    ast = parse(getNormalizedNodeLists(dot));
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
  const strict = (root as typeof root & { strict?: boolean }).strict === true;
  const strictEdges = new Map<string, { edge: GraphEdge; attrs: AttrMap }>();
  const nodeStates = new Map<string, { attrs: AttrMap; defaults: AttrMap; html: Set<string> }>();
  const subgraphs: NonNullable<DotGraphPreserve['subgraphs']> = [];
  let privateGraph: any;
  let direction: Graph['direction'] | undefined;

  // Accumulated graph-level DOT state with no native field, for round-tripping.
  const graphPreserveAttrs: Record<string, string> = {};
  let rootNodeDefaults: Record<string, string> | undefined;
  let rootEdgeDefaults: Record<string, string> | undefined;
  const rankGroups: DotRankGroup[] = [];

  function addImplicitNode(
    id: string,
    parentId: string | null,
    defaults: AttrMap,
  ): void {
    if (!nodeMap.has(id)) {
      nodeStates.set(id,{ attrs: {}, defaults: { ...defaults }, html: new Set() });
      nodeMap.set(id, getNodeFromAttrs(id, {}, defaults, parentId));
    }
  }

  function getNodeIdsFromSubgraph(children: any[]): string[] {
    const ids = new Set<string>();

    function addNodeIds(statements: any[]): void {
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
                addNodeIds(item.children);
              }
            }
            break;
          }
          case 'subgraph': {
            addNodeIds(stmt.children);
            break;
          }
        }
      }
    }

    addNodeIds(children);
    return [...ids];
  }

  function addStatements(
    children: typeof root.children,
    parentId: string | null,
    nodeDefaults: AttrMap,
    edgeDefaults: AttrMap,
    inheritedNodeHtml = new Set<string>(),
    inheritedEdgeHtml = new Set<string>(),
  ): void {
    let nd = { ...nodeDefaults };
    let ed = { ...edgeDefaults };
    const nodeHtml = new Set(inheritedNodeHtml);
    const edgeDefaultHtml = new Set(inheritedEdgeHtml);

    for (const stmt of children) {
      switch (stmt.type) {
        case 'attr_stmt': {
          if (stmt.target === 'node') {
            const map = getAttrsMap(stmt.attr_list);
            nd = { ...nd, ...map };
            for (const key of Object.keys(map)) nodeHtml.delete(key);
            for (const key of getHtmlAttrNames(stmt.attr_list)) nodeHtml.add(key);
            // Preserve `node [...]` defaults declared at graph scope.
            if (parentId === null) {
              rootNodeDefaults = { ...(rootNodeDefaults ?? {}), ...map };
            }
          } else if (stmt.target === 'edge') {
            const map = getAttrsMap(stmt.attr_list);
            ed = { ...ed, ...map };
            for (const key of Object.keys(map)) edgeDefaultHtml.delete(key);
            for (const key of getHtmlAttrNames(stmt.attr_list)) edgeDefaultHtml.add(key);
            // Preserve `edge [...]` defaults declared at graph scope.
            if (parentId === null) {
              rootEdgeDefaults = { ...(rootEdgeDefaults ?? {}), ...map };
            }
          } else if (stmt.target === 'graph') {
            const graphAttrs = getAttrsMap(stmt.attr_list);
            for (const [k, v] of Object.entries(graphAttrs)) {
              if (k === 'rankdir') {
                direction = RANKDIR_TO_DIRECTION[v.toUpperCase()] ?? undefined;
              } else if (k === '_stately' && parentId === null) {
                privateGraph = getPrivateData(v);
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
          const attrs = getAttrsMap(stmt.attr_list);
          const previous = nodeStates.get(id);
          const html = new Set(previous?.html ?? nodeHtml);
          if ('label' in attrs) html.delete('label');
          for (const name of getHtmlAttrNames(stmt.attr_list)) html.add(name);
          const combined = { ...previous?.attrs, ...attrs };
          const defaults = previous?.defaults ?? nd;
          nodeStates.set(id, { attrs: combined, defaults: { ...defaults }, html });
          const original = nodeMap.get(id);
          const node = getNodeFromAttrs(id, combined, defaults, original?.parentId ?? parentId, html);
          nodeMap.set(id, node);
          break;
        }

        case 'edge_stmt': {
          const edgeAttrs = getAttrsMap(stmt.attr_list);
          const edgeHtml = getHtmlAttrNames(stmt.attr_list);
          const mergedEdgeAttrs = { ...ed, ...edgeAttrs };
          // Leftover edge-explicit attrs (defaults preserved once at graph scope).
          const edgeRest = getLeftoverAttrs(edgeAttrs, MODELED_EDGE_ATTRS);
          const labelIsHtml = edgeHtml.has('label') || (!('label' in edgeAttrs) && edgeDefaultHtml.has('label'));

          // Walk edge_list: each consecutive pair forms edges between endpoint sets.
          // DOT allows node IDs or subgraphs as endpoints; subgraphs expand to all
          // contained nodes (e.g., A -> {B C} == A->B and A->C).
          const endpointGroups: EndpointRef[][] = [];
          for (const item of stmt.edge_list) {
            if (item.type === 'node_id') {
              const existed = nodeMap.has(item.id);
              addImplicitNode(item.id, parentId, nd);
              if (!existed && nodeHtml.has('label')) {
                const state = nodeStates.get(item.id)!; state.html = new Set(nodeHtml);
                nodeMap.set(item.id,getNodeFromAttrs(item.id,{},nd,parentId,nodeHtml));
              }
              endpointGroups.push([
                {
                  id: item.id,
                  ...(getPortId(item) && { port: getPortId(item) }),
                  ...(getCompass(item) && { compass: getCompass(item) }),
                },
              ]);
            } else if (item.type === 'subgraph') {
              addStatements(item.children, parentId, nd, ed,nodeHtml,edgeDefaultHtml);
              const subNodeIds = getNodeIdsFromSubgraph(item.children);
              for (const subNodeId of subNodeIds) {
                addImplicitNode(subNodeId, parentId, nd);
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
                  ...(getLeftoverAttrs(ed, MODELED_EDGE_ATTRS) && { inheritedAttrs: getLeftoverAttrs(ed, MODELED_EDGE_ATTRS) }),
                  ...(labelIsHtml && { labelHtml: true }),
                  ...(source.compass && { sourceCompass: source.compass }),
                  ...(target.compass && { targetCompass: target.compass }),
                };
                const edge: GraphEdge = {
                  type: 'edge',
                  id: `e${edgeIdx++}`,
                  sourceId: source.id,
                  targetId: target.id,
                  label: labelIsHtml ? rawLabel : getUnescapedLabel(rawLabel),
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
                const privateData = getPrivateData(edgeAttrs['_stately']);
                if (privateData) {
                  if (typeof privateData.id === 'string') edge.id = privateData.id;
                  if (mergedEdgeAttrs['label'] === undefined && privateData.nullLabel) edge.label = null;
                  for (const key of ['x','y','width','height','style','weight','points','routing','mode']) if (privateData[key] !== undefined) (edge as any)[key] = privateData[key];
                  edge.data = getPreservedData(privateData.data, preserve);
                }
                const pair = isDirected ? [source.id,target.id] : [source.id,target.id].sort();
                const strictKey = JSON.stringify(pair);
                const previous = strictEdges.get(strictKey);
                if (strict && previous) {
                  if ('label' in edgeAttrs) previous.edge.label = edge.label;
                  if ('color' in edgeAttrs) previous.edge.color = edge.color;
                  const oldPreserve = { ...getDotPreserve(previous.edge.data) };
                  if (source.port !== undefined || source.compass !== undefined) {
                    previous.edge.sourcePort = source.port;
                    delete oldPreserve.sourceCompass;
                  }
                  if (target.port !== undefined || target.compass !== undefined) {
                    previous.edge.targetPort = target.port;
                    delete oldPreserve.targetCompass;
                  }
                  previous.edge.data = getPreservedData(getDotUserData(previous.edge.data), { ...oldPreserve, ...preserve, attrs: { ...oldPreserve.attrs, ...edgeRest } });
                  previous.attrs = { ...previous.attrs, ...edgeAttrs };
                } else {
                  edges.push(edge);
                  if (strict) strictEdges.set(strictKey,{ edge, attrs: edgeAttrs });
                }
              }
            }
          }
          break;
        }

        case 'subgraph': {
          // Extract subgraph-level graph attributes (label, rank, …).
          let subLabel = '';
          let subHasLabel = false;
          let rank: string | undefined;
          let subPrivate: any;
          for (const child of stmt.children) {
            if (child.type === 'attr_stmt' && child.target === 'graph') {
              const ga = getAttrsMap(child.attr_list);
              if ('label' in ga) { subLabel = getUnescapedLabel(ga['label']); subHasLabel = true; }
              if (ga['rank']) rank = ga['rank'];
              if (ga['_stately']) subPrivate = getPrivateData(ga['_stately']);
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
            addStatements(stmt.children.filter((child) => !(child.type === 'attr_stmt' && child.target === 'graph')), parentId, nd, ed,nodeHtml,edgeDefaultHtml);
            for (const m of members) addImplicitNode(m, parentId, nd);
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
          subNode.data = subPrivate?.compound ? subPrivate.data : getPreservedData(subPrivate?.data,{subgraph:true});
          if (!subHasLabel && subPrivate?.nullLabel) subNode.label = null;
          for (const key of ['initialNodeId','ports','x','y','width','height','style','shape','color']) if (subPrivate?.[key] !== undefined) (subNode as any)[key] = subPrivate[key];
          if (!nodeMap.has(subId)) nodeMap.set(subId, subNode);
          const attrs: Record<string,string> = {};
          for (const child of stmt.children) if (child.type === 'attr_stmt' && child.target === 'graph') Object.assign(attrs,getAttrsMap(child.attr_list));
          delete attrs['_stately'];
          const existing = subgraphs.find((subgraph) => subgraph.id === subId);
          if (existing) { Object.assign(existing.attrs,attrs); existing.nodes = [...new Set([...existing.nodes,...getNodeIdsFromSubgraph(stmt.children)])]; }
          else if (!subPrivate?.compound) subgraphs.push({ id: subId, parentId, attrs, nodes: getNodeIdsFromSubgraph(stmt.children) });

          addStatements(stmt.children, subId, nd, ed,nodeHtml,edgeDefaultHtml);
          break;
        }
      }
    }
  }

  addStatements(root.children, null, {}, {});

  for (const edge of edges) {
    for (const end of ['source','target'] as const) {
      const portKey = end === 'source' ? 'sourcePort' : 'targetPort';
      const id = end === 'source' ? edge.sourceId : edge.targetId;
      const port = edge[portKey];
      if (port && COMPASS_POINTS.has(port) && !nodeMap.get(id)?.ports?.some((declared) => declared.name === port)) {
        const native = {...getDotPreserve(edge.data),[end === 'source' ? 'sourceCompass' : 'targetCompass']:port};
        delete edge[portKey];
        edge.data = getPreservedData(getDotUserData(edge.data),native);
      }
    }
  }
  // Defaults introduced later must not retroactively style existing objects.
  for (const [id,state] of nodeStates) {
    const missing: Record<string,string> = {};
    for (const key of Object.keys(rootNodeDefaults ?? {})) if (!(key in state.defaults) && !(key in state.attrs)) missing[key] = '';
    if (Object.keys(missing).length) {
      const node = nodeMap.get(id)!;
      const native = getDotPreserve(node.data) ?? {};
      node.data = getPreservedData(getDotUserData(node.data),{ ...native,inheritedAttrs:{ ...missing,...native.inheritedAttrs } });
    }
  }
  // Assemble preserved graph-level DOT state (see DotGraphPreserve). Only
  // populated when there is something to preserve, so plain graphs keep
  // `data: undefined`.
  const graphPreserve: DotGraphPreserve = {
    ...(strict && { strict: true }),
    ...(subgraphs.length && { subgraphs }),
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
    mode: privateGraph?.mode === 'bidirectional' && isDirected ? 'bidirectional' : (isDirected ? 'directed' : 'undirected'),
    initialNodeId: privateGraph?.initialNodeId ?? null,
    nodes: [...nodeMap.values()],
    edges,
    data: privateGraph?.data !== undefined ? getPreservedData(privateGraph.data,graphPreserve) : graphData,
    ...(privateGraph?.style !== undefined && { style: privateGraph.style }),
    ...(direction && { direction }),
  };
}

/**
 * Bidirectional converter for DOT (Graphviz) format.
 *
 * @remarks
 * Exported from the `@statelyai/graph/dot` subpath, which requires the optional
 * peer dependency `dotparser` (`npm install dotparser`). It is not re-exported
 * from the package root.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { dotConverter } from '@statelyai/graph/dot';
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

/** Adapt the current node-list grammar to dotparser's older endpoint grammar. */
function getNormalizedNodeLists(source: string): string {
  const tokens: Array<{ text:string; start:number; end:number; square:number }> = [];
  let pos=0, square=0;
  while (pos<source.length) {
    if (/\s/.test(source[pos])) {pos++;continue;}
    if (source.startsWith('//',pos) || source[pos]==='#') {
      while (pos<source.length && source[pos]!=='\n') pos++;
      continue;
    }
    if (source.startsWith('/*',pos)) {
      const end=source.indexOf('*/',pos+2);
      if (end<0) return source;
      pos=end+2;continue;
    }
    const start=pos;
    if (source[pos]==='"') {
      pos++;
      while (pos<source.length) {
        if (source[pos]==='\\') {pos+=2;continue;}
        if (source[pos++]==='"') break;
      }
    } else if (source[pos]==='<') {
      let depth=0, quoted=false;
      do {
        const ch=source[pos++];
        if (ch==='"') quoted=!quoted;
        if (!quoted && ch==='<') depth++;
        if (!quoted && ch==='>') depth--;
      } while (pos<source.length && depth>0);
    } else if (source.startsWith('->',pos) || source.startsWith('--',pos)) pos+=2;
    else if ('[]{},;=:'.includes(source[pos])) pos++;
    else {
      while (pos<source.length && !/\s/.test(source[pos]) && !'[]{},;=:"<>'.includes(source[pos]) && !source.startsWith('->',pos) && !source.startsWith('--',pos)) pos++;
      if (pos===start) pos++;
    }
    const text=source.slice(start,pos);
    tokens.push({text,start,end:pos,square});
    if (text==='[') square++;
    if (text===']') square--;
  }
  const getEndpoint = (start:number): number => {
    const token=tokens[start];
    if (!token || token.square!==0 || ['[',']','{','}',',',';','=','->','--',':'].includes(token.text)) return start;
    let end=start+1;
    while (token.text.startsWith('"') && tokens[end]?.text==='+' && tokens[end+1]?.text.startsWith('"')) end+=2;
    for (let part=0;part<2 && tokens[end]?.text===':';part++) {
      if (!tokens[end+1] || [',',';','=','->','--','{','}','[',']',':'].includes(tokens[end+1].text)) return start;
      end+=2;
    }
    return end;
  };
  const edits: Array<{start:number;end:number;text:string}> = [];
  for (let i=0;i<tokens.length;i++) {
    const first=getEndpoint(i);
    if (first===i || tokens[first]?.text!==',') continue;
    const members=[source.slice(tokens[i].start,tokens[first-1].end)];
    let end=first;
    while (tokens[end]?.text===',') {
      const next=getEndpoint(end+1);
      if (next===end+1) break;
      members.push(source.slice(tokens[end+1].start,tokens[next-1].end));
      end=next;
    }
    if (members.length<2) continue;
    const previous=tokens[i-1]?.text, following=tokens[end]?.text;
    if (['->','--'].includes(previous ?? '') || ['->','--'].includes(following ?? '')) {
      edits.push({start:tokens[i].start,end:tokens[end-1].end,text:`{ ${members.map((id)=>`${id};`).join(' ')} }`});
    } else if (['{','}',';',']'].includes(previous ?? '') && ['[',';','}'].includes(following ?? '')) {
      const attrsStart=end;
      while (tokens[end]?.text==='[') {
        end++;
        while (end<tokens.length && tokens[end].text!==']') end++;
        if (end===tokens.length) return source;
        end++;
      }
      const attrs=end>attrsStart ? source.slice(tokens[attrsStart].start,tokens[end-1].end) : '';
      edits.push({start:tokens[i].start,end:tokens[end-1].end,text:members.map((id)=>`${id}${attrs}`).join('; ')});
    }
    i=end-1;
  }
  let result=source;
  for (const edit of edits.reverse()) result=result.slice(0,edit.start)+edit.text+result.slice(edit.end);
  return result;
}

/** Exact DOT source with a partial Graph view and conservative literal-label patches. */
export const dotDocumentConverter = createGraphDocumentConverter({
  format: 'dot', codec: { from: fromDOT, to: toDOT },
  project: (source) => getDOTDocumentProjection(source, fromDOT),
  patch: getDOTDocumentPatch,
});
