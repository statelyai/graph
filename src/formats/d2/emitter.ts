import type { GraphNode, GraphEdge } from '../../types';
import {
  type D2Arrow,
  type D2Graph,
  type D2NodeData,
  type D2EdgeData,
  type D2PortData,
  type D2LabelBlock,
  escapeD2Key,
  escapeD2Label,
} from './shared';

const STRUCTURED_SHAPES = new Set(['sql_table', 'class']);

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
  return out;
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
  childrenOf: Map<string | null, GraphNode<D2NodeData, D2PortData>[]>;
  nodeById: Map<string, GraphNode<D2NodeData, D2PortData>>;
  /** Edges owned by a container (present in its `data.order`), keyed by owner id. */
  edgesByOwner: Map<string, GraphEdge<D2EdgeData>[]>;
  /** Owner container id for an edge, or undefined if it emits at root scope. */
  ownerOfEdge: Map<string, string>;
  /** Edge ids already emitted (so order-replay and fallback don't duplicate). */
  emittedEdges: Set<string>;
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
  const d = node.data;
  if (node.shape) lines.push(`${indent(ind)}shape: ${escapeD2Label(node.shape)}`);
  if (d.near) lines.push(`${indent(ind)}near: ${escapeD2Label(d.near)}`);
  if (d.icon) lines.push(`${indent(ind)}icon: ${d.icon}`);
  if (d.tooltip) lines.push(`${indent(ind)}tooltip: ${escapeD2Label(d.tooltip)}`);
  if (d.link) lines.push(`${indent(ind)}link: ${escapeD2Label(d.link)}`);
  if (d.classes?.length) lines.push(`${indent(ind)}class: ${d.classes.join(' ')}`);
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
  return lines;
}

function portLines(node: GraphNode<D2NodeData, D2PortData>, ind: number): string[] {
  const lines: string[] = [];
  for (const port of node.ports ?? []) {
    const pd = port.data ?? ({} as D2PortData);
    const vis = pd.visibility ?? '';
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
  if (node.data.labelBlock) {
    return emitLabelBlock(node.label, node.data.labelBlock);
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
    node.data.declarationForm !== 'block' &&
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
  const order = container?.data.order;

  if (order) {
    const childById = new Map(children.map((c) => [c.id, c]));
    const edgeById = new Map(ownedEdges.map((e) => [e.id, e]));
    for (const refId of order) {
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
  const rel = splitId(node.id).slice(scopeSegs.length).map(escapeD2Key).join('.');

  // Pure prefix: don't emit a block; recurse so descendants carry the prefix.
  if (isPurePrefix(ctx, node)) {
    emitScope(ctx, node, node.id, scopeSegs, ind, lines);
    return;
  }

  emitComments(node.data.commentsBefore, ind, lines);
  const label = labelHeader(node);
  const structured = node.shape && STRUCTURED_SHAPES.has(node.shape);
  const attrLines = nodeAttrLines(node, ind + 1);
  const children = ctx.childrenOf.get(node.id) ?? [];
  const ports = structured ? portLines(node, ind + 1) : [];
  const needsBlock =
    attrLines.length > 0 || children.length > 0 || ports.length > 0;

  if (!needsBlock) {
    lines.push(`${indent(ind)}${rel}${label ? `: ${label}` : ''}`);
    return;
  }

  // Block form. Emit a label inside the block (as a `label:` line) rather than
  // inline in the header — `key: label { ... }` is ambiguous in d2.
  lines.push(`${indent(ind)}${rel}: {`);
  if (label) lines.push(`${indent(ind + 1)}label: ${label}`);
  if (structured) {
    lines.push(`${indent(ind + 1)}shape: ${node.shape}`);
    lines.push(...ports);
  } else {
    lines.push(...attrLines);
    emitScope(ctx, node, node.id, splitId(node.id), ind + 1, lines);
  }
  lines.push(`${indent(ind)}}`);
}

function endpointRef(nodeId: string, port: string | undefined, scopeSegs: string[]): string {
  const segs = splitId(nodeId).slice(scopeSegs.length);
  let ref = segs.map(escapeD2Key).join('.');
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
  emitComments(edge.data.commentsBefore, ind, lines);

  const arrow: D2Arrow = edge.data.arrow ?? modeToArrow(edge);
  const owner = scoped ? ctx.ownerOfEdge.get(edge.id) : undefined;
  const scopeSegs = owner ? splitId(owner) : [];

  // Honor authored reversed `<-`: swap endpoints back for display.
  let sId = edge.sourceId;
  let tId = edge.targetId;
  let sPort = edge.sourcePort;
  let tPort = edge.targetPort;
  if (arrow === '<-') {
    [sId, tId] = [tId, sId];
    [sPort, tPort] = [tPort, sPort];
  }

  const left = endpointRef(sId, sPort, scopeSegs);
  const right = endpointRef(tId, tPort, scopeSegs);
  let line = `${indent(ind)}${left} ${arrow} ${right}`;
  if (edge.label != null && edge.label !== '') {
    const lbl = edge.data.labelBlock
      ? emitLabelBlock(edge.label, edge.data.labelBlock)
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
}

function edgeBlockLines(edge: GraphEdge<D2EdgeData>): string[] {
  const out: string[] = [];
  if (edge.style) {
    for (const [k, v] of Object.entries(edge.style)) {
      out.push(`style.${k}: ${styleValueToD2(v)}`);
    }
  }
  const { sourceArrowhead, targetArrowhead } = edge.data;
  if (sourceArrowhead?.shape) out.push(`source-arrowhead.shape: ${sourceArrowhead.shape}`);
  if (targetArrowhead?.shape) out.push(`target-arrowhead.shape: ${targetArrowhead.shape}`);
  if (edge.data.reserved) {
    for (const [k, v] of Object.entries(edge.data.reserved)) {
      out.push(`${k}: ${styleValueToD2(v)}`);
    }
  }
  return out;
}

function modeToArrow(edge: GraphEdge<D2EdgeData>): D2Arrow {
  switch (edge.mode) {
    case 'undirected':
      return '--';
    case 'bidirectional':
      return '<->';
    default:
      return '->';
  }
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
    const order = node.data.order;
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
    lines.push('vars: {');
    for (const [k, v] of Object.entries(data.source.vars)) {
      lines.push(`  ${escapeD2Key(k)}: ${styleValueToD2(v as any)}`);
    }
    lines.push('}');
  }

  // classes
  if (data.source?.classes && Object.keys(data.source.classes).length > 0) {
    lines.push('classes: {');
    for (const [name, style] of Object.entries(data.source.classes)) {
      lines.push(`  ${escapeD2Key(name)}: {`);
      for (const [k, v] of Object.entries(style)) {
        lines.push(`    style.${k}: ${styleValueToD2(v)}`);
      }
      lines.push('  }');
    }
    lines.push('}');
  }

  // imports
  if (data.source?.imports) {
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

