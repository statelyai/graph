import type { GraphNode, GraphEdge } from '../../types';
import { getEdgeMode } from '../../mode';
import {
  type D2Arrow,
  type D2Graph,
  type D2NodeData,
  type D2EdgeData,
  type D2PortData,
  type D2LabelBlock,
  escapeD2Key,
  escapeD2Label,
  getD2ScalarGraph,
  unquoteD2,
  ARROW_TO_MODE,
  RESERVED_KEYWORDS,
} from './shared';

const STRUCTURED_SHAPES = new Set(['sql_table', 'class']);

/**
 * Parser-shaped node data, tolerating graphs not produced by `fromD2` whose
 * `data` may be `undefined`, `null`, or an arbitrary user object.
 */
function nodeData(node: GraphNode<D2NodeData, D2PortData>): Partial<D2NodeData> {
  return node.data ?? {};
}

/** Parser-shaped edge data; see {@link nodeData}. */
function edgeData(edge: GraphEdge<D2EdgeData>): Partial<D2EdgeData> {
  return edge.data ?? {};
}

function splitId(id: string): string[] {
  // Split on dots that are not inside quotes.
  const out: string[] = [];
  let buf = '';
  let inQuote = false;
  for (let i = 0; i < id.length; i++) {
    const ch = id[i];
    if (ch === '"') inQuote = !inQuote;
    if (ch === '.' && !inQuote) {
      out.push(buf);
      buf = '';
    } else buf += ch;
  }
  out.push(buf);
  return out.map(unquoteD2);
}

function getSourceValueLines(key: string, value: any, ind: number): string[] {
  const sourceKey = /^[A-Za-z0-9_-]+$/.test(key) ? key : escapeD2Key(key);
  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    return [`${indent(ind)}${sourceKey}: {`, ...Object.entries(value).flatMap(([name, child]) => getSourceValueLines(name, child, ind + 1)), `${indent(ind)}}`];
  }
  const scalar = Array.isArray(value) ? `[${value.map((entry) => entry === null ? 'null' : typeof entry === 'string' && /^(?:true|false|null|-?\d)/.test(entry) ? JSON.stringify(entry) : styleValueToD2(entry)).join('; ')}]`
    : value === null ? 'null' : typeof value === 'string' && /^(?:true|false|null|-?\d)/.test(value) ? JSON.stringify(value) : styleValueToD2(value);
  return [`${indent(ind)}${sourceKey}: ${scalar}`];
}

function indent(n: number): string {
  return '  '.repeat(n);
}

function emitLabelBlock(text: string, block: D2LabelBlock): string {
  const open = block.fence;
  const close =
    open.length > 1 ? open[1] + '|' : '|';
  const tag =
    block.kind === 'md'
      ? 'md'
      : block.kind === 'latex'
        ? 'tex'
        : block.kind === 'code'
          ? (block.lang ?? '')
          : '';
  const tagPart = tag ? `${tag} ` : '';
  return `${open}${tagPart}${text}${close}`;
}

function styleValueToD2(v: string | number | boolean): string {
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return String(v);
  return escapeD2Label(v);
}

interface EmitCtx {
  graph: D2Graph;
  childrenOf: Map<string | null, GraphNode<D2NodeData, D2PortData>[]>;
  nodeById: Map<string, GraphNode<D2NodeData, D2PortData>>;
  /** Edges owned by a container (present in its `data.order`), keyed by owner id. */
  edgesByOwner: Map<string, GraphEdge<D2EdgeData>[]>;
  /** Owner container id for an edge, or undefined if it emits at root scope. */
  ownerOfEdge: Map<string, string>;
  /** Edge ids already emitted (so order-replay and fallback don't duplicate). */
  emittedEdges: Set<string>;
}

function getNodePath(ctx: EmitCtx, id: string): string[] {
  const node = ctx.nodeById.get(id);
  if (node?.data?.keyPath && node.data.sourceId === node.id) return node.data.keyPath;
  const path = splitId(id);
  // Graph-created hierarchies need not encode parent IDs into child IDs.
  const ancestors: string[] = [];
  const visited = new Set<string>([id]);
  let parentId = node?.parentId;
  while (parentId && !visited.has(parentId)) {
    visited.add(parentId);
    if (id.startsWith(parentId + '.')) return path;
    ancestors.unshift(parentId);
    parentId = ctx.nodeById.get(parentId)?.parentId;
  }
  return [...ancestors.flatMap(splitId), ...path];
}


function emitComments(comments: string[] | undefined, ind: number, lines: string[]): void {
  if (!comments) return;
  for (const c of comments) lines.push(`${indent(ind)}#${c ? ' ' + c.trimStart() : ''}`);
}

function nodeAttrLines(
  node: GraphNode<D2NodeData, D2PortData>,
  ind: number,
): string[] {
  const lines: string[] = [];
  const d = nodeData(node);
  if (node.shape) lines.push(`${indent(ind)}shape: ${escapeD2Label(node.shape)}`);
  if (d.near) lines.push(`${indent(ind)}near: ${escapeD2Label(d.near)}`);
  if (d.icon) lines.push(`${indent(ind)}icon: ${d.icon}`);
  if (d.tooltip) lines.push(`${indent(ind)}tooltip: ${escapeD2Label(d.tooltip)}`);
  if (d.link) lines.push(`${indent(ind)}link: ${escapeD2Label(d.link)}`);
  if (d.classes?.length) lines.push(`${indent(ind)}class: ${d.classes.length > 1 ? `[${d.classes.map(escapeD2Label).join('; ')}]` : escapeD2Label(d.classes[0])}`);
  if (node.width !== undefined) lines.push(`${indent(ind)}width: ${node.width}`);
  if (node.height !== undefined) lines.push(`${indent(ind)}height: ${node.height}`);
  if (node.x !== undefined) lines.push(`${indent(ind)}left: ${node.x}`);
  if (node.y !== undefined) lines.push(`${indent(ind)}top: ${node.y}`);
  if (d.grid) {
    if (d.grid.rows !== undefined) lines.push(`${indent(ind)}grid-rows: ${d.grid.rows}`);
    if (d.grid.columns !== undefined) lines.push(`${indent(ind)}grid-columns: ${d.grid.columns}`);
    if (d.grid.gap !== undefined) lines.push(`${indent(ind)}grid-gap: ${d.grid.gap}`);
  }
  if (node.style) {
    for (const [k, v] of Object.entries(node.style)) {
      lines.push(`${indent(ind)}style.${k}: ${styleValueToD2(v)}`);
    }
  }
  if (d.reserved) {
    for (const [k, v] of Object.entries(d.reserved)) {
      lines.push(`${indent(ind)}${k}: ${styleValueToD2(v)}`);
    }
  }
  if (d.source?.vars) lines.push(...getSourceValueLines('vars', d.source.vars, ind));
  if (d.source?.classes) lines.push(...getClassLines(d.source.classes, ind));
  return lines;
}

function portLines(node: GraphNode<D2NodeData, D2PortData>, ind: number): string[] {
  const lines: string[] = [];
  for (const port of node.ports ?? []) {
    const pd = port.data ?? ({} as D2PortData);
    const vis = pd.visibility ?? '';
    emitComments(pd.commentsBefore, ind, lines);
    const name = `${vis}${escapeD2Key(port.name)}`;
    let line = `${indent(ind)}${name}`;
    if (pd.typeName) line += `: ${escapeD2Label(pd.typeName)}`;
    if (pd.constraint?.length) {
      line += ` { constraint: ${pd.constraint.length === 1 ? pd.constraint[0] : `[${pd.constraint.join('; ')}]`} }`;
    }
    lines.push(line);
  }
  return lines;
}

function labelHeader(node: GraphNode<D2NodeData, D2PortData>): string {
  if (node.label == null || node.label === '') return '';
  const labelBlock = nodeData(node).labelBlock;
  const data = nodeData(node);
  if (data.labelSource && data.sourceLabel === node.label) return data.labelSource;
  if (labelBlock) {
    return emitLabelBlock(node.label, labelBlock);
  }
  return escapeD2Label(node.label);
}

/** Whether a node carries its own attributes/ports/label (needs a line of its own). */
function hasOwnContent(node: GraphNode<D2NodeData, D2PortData>): boolean {
  return (
    nodeAttrLines(node, 0).length > 0 ||
    (node.ports?.length ?? 0) > 0 ||
    (node.label != null && node.label !== '')
  );
}

/**
 * A node is a "pure prefix" — emitted by carrying its dotted path down to
 * descendants rather than as its own block — when it was authored in dot form,
 * has no own content, and has children.
 */
function isPurePrefix(
  ctx: EmitCtx,
  node: GraphNode<D2NodeData, D2PortData>,
): boolean {
  const children = ctx.childrenOf.get(node.id) ?? [];
  return (
    nodeData(node).declarationForm !== 'block' &&
    children.length > 0 &&
    !hasOwnContent(node)
  );
}

/**
 * Emit the items (child nodes + owned edges) of a scope, in `data.order` when
 * present (sequence diagrams), else nodes-then-edges in insertion order.
 * `scopeSegs` is the dotted prefix already implied by enclosing blocks.
 */
function emitScope(
  ctx: EmitCtx,
  container: GraphNode<D2NodeData, D2PortData> | null,
  containerId: string | null,
  scopeSegs: string[],
  ind: number,
  lines: string[],
): void {
  const children = ctx.childrenOf.get(containerId) ?? [];
  const ownedEdges = container ? (ctx.edgesByOwner.get(container.id) ?? []) : [];
  const order = container ? nodeData(container).order : ctx.graph.data?.order;

  if (order) {
    const childById = new Map(children.map((c) => [c.id, c]));
    const edgeById = new Map(ownedEdges.map((e) => [e.id, e]));
    for (const refId of order) {
      const imported = ctx.graph.data?.source?.importRecords?.find((record) => record.ref === refId && record.scopeId === containerId);
      if (imported) {
        lines.push(`${indent(ind)}${imported.spread ? '...' : ''}@${imported.path}`);
        continue;
      }
      const child = childById.get(refId);
      if (child) {
        emitItem(ctx, child, scopeSegs, ind, lines);
        continue;
      }
      const edge = edgeById.get(refId);
      if (edge && !ctx.emittedEdges.has(edge.id)) {
        emitEdge(ctx, edge, ind, lines, true);
      }
    }
    // Anything not referenced in order, appended.
    for (const child of children) {
      if (!order.includes(child.id)) emitItem(ctx, child, scopeSegs, ind, lines);
    }
    return;
  }

  for (const child of children) emitItem(ctx, child, scopeSegs, ind, lines);
}

/** Emit a single node within a scope, choosing dot-prefix vs block form. */
function emitItem(
  ctx: EmitCtx,
  node: GraphNode<D2NodeData, D2PortData>,
  scopeSegs: string[],
  ind: number,
  lines: string[],
): void {
  // Relative dotted key from the current scope.
  const rel = getNodePath(ctx, node.id).slice(scopeSegs.length).map(escapeD2Key).join('.');

  // Pure prefix: don't emit a block; recurse so descendants carry the prefix.
  if (isPurePrefix(ctx, node)) {
    emitScope(ctx, node, node.id, scopeSegs, ind, lines);
    return;
  }

  emitComments(nodeData(node).commentsBefore, ind, lines);
  const label = labelHeader(node);
  const structured = node.shape && STRUCTURED_SHAPES.has(node.shape);
  const attrLines = nodeAttrLines(node, ind + 1);
  const children = ctx.childrenOf.get(node.id) ?? [];
  const ports = structured ? portLines(node, ind + 1) : [];
  const needsBlock =
    attrLines.length > 0 || children.length > 0 || ports.length > 0;

  if (!needsBlock) {
    lines.push(`${indent(ind)}${rel}${label ? `: ${label}` : ''}`);
    emitComments(nodeData(node).commentsAfter, ind, lines);
    return;
  }

  // Block form. Emit a label inside the block (as a `label:` line) rather than
  // inline in the header — `key: label { ... }` is ambiguous in d2.
  lines.push(`${indent(ind)}${rel}: {`);
  if (label) lines.push(`${indent(ind + 1)}label: ${label}`);
  if (structured) {
    lines.push(...attrLines);
    lines.push(...ports);
  } else {
    lines.push(...attrLines);
    emitScope(ctx, node, node.id, getNodePath(ctx, node.id), ind + 1, lines);
  }
  emitComments(nodeData(node).trailingComments, ind + 1, lines);
  lines.push(`${indent(ind)}}`);
  emitComments(nodeData(node).commentsAfter, ind, lines);
}

function endpointRef(ctx: EmitCtx, nodeId: string, port: string | undefined, scopeSegs: string[]): string {
  const path = getNodePath(ctx, nodeId);
  let shared = 0;
  while (shared < scopeSegs.length && path[shared] === scopeSegs[shared]) shared++;
  const segs = path.slice(shared);
  let ref = [...Array(scopeSegs.length - shared).fill('_'), ...segs.map(escapeD2Key)].join('.');
  if (port) ref += `.${escapeD2Key(port)}`;
  return ref;
}

function emitEdge(
  ctx: EmitCtx,
  edge: GraphEdge<D2EdgeData>,
  ind: number,
  lines: string[],
  scoped: boolean,
): void {
  ctx.emittedEdges.add(edge.id);
  const d = edgeData(edge);
  emitComments(d.commentsBefore, ind, lines);

  const mode = getEdgeMode(ctx.graph, edge);
  const arrow: D2Arrow = d.arrow && ARROW_TO_MODE[d.arrow] === mode ? d.arrow : modeToArrow(ctx.graph, edge);
  const owner = scoped ? ctx.ownerOfEdge.get(edge.id) : undefined;
  const scopeSegs = owner ? getNodePath(ctx, owner) : [];

  // Honor authored reversed `<-`: swap endpoints back for display.
  let sId = edge.sourceId;
  let tId = edge.targetId;
  let sPort = edge.sourcePort;
  let tPort = edge.targetPort;
  if (arrow === '<-') {
    [sId, tId] = [tId, sId];
    [sPort, tPort] = [tPort, sPort];
  }

  const left = endpointRef(ctx, sId, sPort, scopeSegs);
  const right = endpointRef(ctx, tId, tPort, scopeSegs);
  let line = `${indent(ind)}${left} ${arrow} ${right}`;
  if (edge.label != null && edge.label !== '') {
    const lbl = d.labelSource && d.sourceLabel === edge.label ? d.labelSource : d.labelBlock
      ? emitLabelBlock(edge.label, d.labelBlock)
      : escapeD2Label(edge.label);
    line += `: ${lbl}`;
  }

  const blockLines = edgeBlockLines(edge);
  if (blockLines.length > 0) {
    lines.push(`${line} {`);
    lines.push(...blockLines.map((l) => `${indent(ind + 1)}${l}`));
    lines.push(`${indent(ind)}}`);
  } else {
    lines.push(line);
  }
  emitComments(d.commentsAfter, ind, lines);
}

function edgeBlockLines(edge: GraphEdge<D2EdgeData>): string[] {
  const out: string[] = [];
  if (edge.style) {
    for (const [k, v] of Object.entries(edge.style)) {
      out.push(`style.${k}: ${styleValueToD2(v)}`);
    }
  }
  const d = edgeData(edge);
  const { sourceArrowhead, targetArrowhead } = d;
  for (const [name, spec] of [['source-arrowhead', sourceArrowhead], ['target-arrowhead', targetArrowhead]] as const) {
    if (!spec) continue;
    if (spec.shape) out.push(`${name}.shape: ${escapeD2Label(spec.shape)}`);
    if (spec.label !== undefined) out.push(`${name}.label: ${escapeD2Label(spec.label)}`);
    for (const [key, value] of Object.entries(spec.style ?? {})) out.push(`${name}.style.${key}: ${styleValueToD2(value)}`);
    for (const [key, value] of Object.entries(spec.attributes ?? {})) out.push(`${name}.${key}: ${styleValueToD2(value)}`);
  }
  if (d.reserved) {
    for (const [k, v] of Object.entries(d.reserved)) {
      out.push(`${k}: ${styleValueToD2(v)}`);
    }
  }
  return out;
}

function modeToArrow(graph: D2Graph, edge: GraphEdge<D2EdgeData>): D2Arrow {
  switch (getEdgeMode(graph, edge)) {
    case 'undirected':
      return '--';
    case 'bidirectional':
      return '<->';
    default:
      return '->';
  }
}

function getClassLines(classes: Record<string, Record<string, any>>, ind: number): string[] {
  const lines = [`${indent(ind)}classes: {`];
  for (const [name, attributes] of Object.entries(classes)) {
    lines.push(`${indent(ind + 1)}${escapeD2Key(name)}: {`);
    for (const [key, value] of Object.entries(attributes)) {
      if (RESERVED_KEYWORDS.has(key) || (value && typeof value === 'object')) lines.push(...getSourceValueLines(key, value, ind + 2));
      else lines.push(`${indent(ind + 2)}style.${key}: ${styleValueToD2(value)}`);
    }
    lines.push(`${indent(ind + 1)}}`);
  }
  lines.push(`${indent(ind)}}`);
  return lines;
}

/**
 * Single pass over container `data.order` lists, building both edge→owner and
 * owner→edges indexes. An edge "belongs" to a container when that container
 * references it in its order (sequence diagrams / scoped connections); all
 * other edges emit at root scope.
 */
function buildEdgeOwnership(graph: D2Graph): {
  edgesByOwner: Map<string, GraphEdge<D2EdgeData>[]>;
  ownerOfEdge: Map<string, string>;
} {
  const edgesByOwner = new Map<string, GraphEdge<D2EdgeData>[]>();
  const ownerOfEdge = new Map<string, string>();
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
  for (const node of graph.nodes) {
    const order = nodeData(node).order;
    if (!order) continue;
    for (const refId of order) {
      const edge = edgeById.get(refId);
      if (!edge) continue;
      ownerOfEdge.set(refId, node.id);
      const arr = edgesByOwner.get(node.id) ?? [];
      arr.push(edge);
      edgesByOwner.set(node.id, arr);
    }
  }
  return { edgesByOwner, ownerOfEdge };
}

export function toD2(graph: D2Graph): string {
  getD2ScalarGraph(graph);
  const lines: string[] = [];
  const data = graph.data ?? { diagramType: 'd2' };

  // Leading comments
  if (data.leadingComments) {
    for (const c of data.leadingComments) lines.push(`#${c ? ' ' + c.trimStart() : ''}`);
  }

  // Graph direction
  if (graph.direction) lines.push(`direction: ${graph.direction}`);

  // vars
  if (data.source?.vars && Object.keys(data.source.vars).length > 0) {
    lines.push(...getSourceValueLines('vars', data.source.vars, 0));
  }

  // classes
  if (data.source?.classes && Object.keys(data.source.classes).length > 0) {
    lines.push(...getClassLines(data.source.classes, 0));
  }

  // imports
  if (data.source?.imports && !data.source.importRecords) {
    for (const imp of data.source.imports) lines.push(`@${imp}`);
  }

  // graph-level style
  if (graph.style && Object.keys(graph.style).length > 0) {
    lines.push('style: {');
    for (const [k, v] of Object.entries(graph.style)) {
      lines.push(`  ${k}: ${styleValueToD2(v)}`);
    }
    lines.push('}');
  }

  // Build context
  const childrenOf = new Map<string | null, GraphNode<D2NodeData, D2PortData>[]>();
  const nodeById = new Map<string, GraphNode<D2NodeData, D2PortData>>();
  for (const node of graph.nodes) {
    nodeById.set(node.id, node);
    const key = node.parentId ?? null;
    const arr = childrenOf.get(key) ?? [];
    arr.push(node);
    childrenOf.set(key, arr);
  }
  const { edgesByOwner, ownerOfEdge } = buildEdgeOwnership(graph);
  const ctx: EmitCtx = {
    graph,
    childrenOf,
    nodeById,
    edgesByOwner,
    ownerOfEdge,
    emittedEdges: new Set(),
  };

  // Emit root scope (nodes carry dotted prefixes for pure-prefix ancestors).
  emitScope(ctx, null, null, [], 0, lines);

  // Emit edges not yet emitted via container order, at their owner scope.
  for (const edge of graph.edges) {
    if (ctx.emittedEdges.has(edge.id)) continue;
    const owner = ownerOfEdge.get(edge.id);
    const ind = owner ? splitId(owner).length : 0;
    emitEdge(ctx, edge, ind, lines, true);
  }

  // Trailing comments
  if (data.trailingComments) {
    for (const c of data.trailingComments) lines.push(`#${c ? ' ' + c.trimStart() : ''}`);
  }

  return lines.join('\n') + '\n';
}
