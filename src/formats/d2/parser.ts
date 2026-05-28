import type { GraphNode, GraphEdge, GraphPort } from '../../types';
import {
  type D2Arrow,
  type D2Graph,
  type D2NodeData,
  type D2EdgeData,
  type D2PortData,
  type D2LabelBlock,
  ARROW_TO_MODE,
  RESERVED_KEYWORDS,
  BOOLEAN_STYLE_KEYS,
  NUMERIC_STYLE_KEYS,
  unquoteD2,
  validateD2Input,
} from './shared';

// --- Statement scanning ---

interface RawComment {
  type: 'comment';
  text: string;
}
interface RawStatement {
  type: 'stmt';
  /** Statement text up to (not including) any top-level `{ }` block. */
  head: string;
  /** Block body (between braces), or undefined. */
  block?: string;
}
type RawToken = RawComment | RawStatement;

const BLOCK_BOUNDARY_CHARS = new Set([
  '`',
  "'",
  '"',
  '.',
  '*',
  '+',
  '=',
  '-',
  '_',
]);

/**
 * Read a block string starting at index `i` (text[i] === '|'). Returns the end
 * index (exclusive) and the raw fence open. d2 block strings are delimited by
 * `|`, optionally with one boundary char (e.g. `` |` `` ... `` `| ``).
 */
function readBlockString(
  text: string,
  i: number,
): { end: number; open: string; close: string } | null {
  if (text[i] !== '|') return null;
  let open = '|';
  let close = '|';
  const next = text[i + 1];
  if (next !== undefined && BLOCK_BOUNDARY_CHARS.has(next)) {
    open = '|' + next;
    close = next + '|';
  }
  const contentStart = i + open.length;
  const closeIdx = text.indexOf(close, contentStart);
  if (closeIdx === -1) return null;
  return { end: closeIdx + close.length, open, close };
}

/** Split a scope body into top-level statements and comments. */
function splitStatements(body: string): RawToken[] {
  const tokens: RawToken[] = [];
  let i = 0;
  const len = body.length;
  let buf = '';
  let braceDepth = 0;
  let blockStart = -1; // index in buf where top-level block began

  const flush = () => {
    const raw = buf;
    buf = '';
    const trimmed = raw.trim();
    if (trimmed === '') {
      blockStart = -1;
      return;
    }
    if (blockStart >= 0) {
      // statement with a block: head is before the block's `{`
      const braceIdx = raw.indexOf('{', blockStart);
      const head = raw.slice(0, braceIdx).trim();
      const closeIdx = raw.lastIndexOf('}');
      const block = raw.slice(braceIdx + 1, closeIdx);
      tokens.push({ type: 'stmt', head, block });
    } else {
      tokens.push({ type: 'stmt', head: trimmed });
    }
    blockStart = -1;
  };

  while (i < len) {
    const ch = body[i];

    // Comment (line-level) at top level, outside quotes/blocks
    if (ch === '#' && braceDepth === 0 && buf.trim() === '') {
      const nl = body.indexOf('\n', i);
      const end = nl === -1 ? len : nl;
      tokens.push({ type: 'comment', text: body.slice(i + 1, end).trim() });
      i = end + 1;
      continue;
    }

    // Inline trailing comment (dropped, best-effort)
    if (ch === '#' && braceDepth === 0 && buf.trim() !== '') {
      const nl = body.indexOf('\n', i);
      i = nl === -1 ? len : nl;
      flush();
      continue;
    }

    // Quoted string
    if (ch === '"') {
      const endQuote = (() => {
        let j = i + 1;
        while (j < len) {
          if (body[j] === '\\') {
            j += 2;
            continue;
          }
          if (body[j] === '"') return j;
          j++;
        }
        return len - 1;
      })();
      buf += body.slice(i, endQuote + 1);
      i = endQuote + 1;
      continue;
    }

    // Block string
    if (ch === '|') {
      const bs = readBlockString(body, i);
      if (bs) {
        buf += body.slice(i, bs.end);
        i = bs.end;
        continue;
      }
    }

    if (ch === '{') {
      if (braceDepth === 0) blockStart = buf.length;
      braceDepth++;
      buf += ch;
      i++;
      continue;
    }
    if (ch === '}') {
      braceDepth = Math.max(0, braceDepth - 1);
      buf += ch;
      i++;
      continue;
    }

    if ((ch === '\n' || ch === ';') && braceDepth === 0) {
      flush();
      i++;
      continue;
    }

    buf += ch;
    i++;
  }
  flush();
  return tokens;
}

// --- Connector detection ---

/** Find the top-level connector in a statement head, ignoring quotes/blocks. */
function findConnector(
  head: string,
): { index: number; arrow: D2Arrow } | null {
  let depth = 0;
  for (let i = 0; i < head.length; i++) {
    const ch = head[i];
    if (ch === '"') {
      i = skipQuoted(head, i);
      continue;
    }
    if (ch === '(') depth++;
    else if (ch === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0) {
      const slice = head.slice(i, i + 3);
      const m = slice.match(/^(<->|->|<-|--)/);
      if (m) {
        // Avoid matching `--` inside identifiers? d2 ids can have `-`.
        // Require surrounding spaces OR that it's clearly a connector.
        const arrow = m[1] as D2Arrow;
        return { index: i, arrow };
      }
    }
  }
  return null;
}

function skipQuoted(s: string, i: number): number {
  let j = i + 1;
  while (j < s.length) {
    if (s[j] === '\\') {
      j += 2;
      continue;
    }
    if (s[j] === '"') return j;
    j++;
  }
  return s.length;
}

// --- Label / value splitting ---

/** Split `key: value` at the first top-level colon. Returns null if no colon. */
function splitKeyValue(s: string): { key: string; value: string } | null {
  let depth = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') {
      i = skipQuoted(s, i);
      continue;
    }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1);
    else if (ch === ':' && depth === 0) {
      return { key: s.slice(0, i).trim(), value: s.slice(i + 1).trim() };
    }
  }
  return null;
}

/**
 * Parse a dotted key path into segments, respecting quotes. Segments are
 * returned **raw** (quotes preserved) so callers can distinguish a reserved
 * keyword (`shape`) from a quoted literal node id (`"shape"`). Use
 * {@link unquotePath} to materialize node ids.
 */
function parseKeyPath(key: string): string[] {
  const segs: string[] = [];
  let buf = '';
  for (let i = 0; i < key.length; i++) {
    const ch = key[i];
    if (ch === '"') {
      const end = skipQuoted(key, i);
      buf += key.slice(i, end + 1);
      i = end;
      continue;
    }
    if (ch === '.') {
      segs.push(buf.trim());
      buf = '';
      continue;
    }
    buf += ch;
  }
  if (buf.trim() !== '') segs.push(buf.trim());
  return segs;
}

/** Materialize node-id segments from raw key-path segments (strips quotes). */
function unquotePath(segs: string[]): string[] {
  return segs.map((s) => unquoteD2(s));
}

/**
 * Whether a raw key-path segment denotes a reserved keyword. Quoted segments
 * (e.g. `"shape"`) are literal node ids and never reserved.
 */
function isReservedSegment(rawSeg: string): boolean {
  return RESERVED_KEYWORDS.has(rawSeg);
}

// --- Label block parsing ---

function parseLabelBlock(value: string): {
  text: string;
  labelBlock?: D2LabelBlock;
} {
  const trimmed = value.trim();
  if (!trimmed.startsWith('|')) {
    return { text: unquoteD2(trimmed) };
  }
  const bs = readBlockString(trimmed, 0);
  if (!bs) return { text: unquoteD2(trimmed) };
  let inner = trimmed.slice(bs.open.length, trimmed.length - bs.close.length);
  // optional tag right after the fence
  let kind: D2LabelBlock['kind'] = 'block';
  let lang: string | undefined;
  const tagMatch = inner.match(/^([A-Za-z0-9_+-]+)(\s|\n)/);
  if (tagMatch) {
    const tag = tagMatch[1];
    inner = inner.slice(tagMatch[0].length);
    if (tag === 'md') kind = 'md';
    else if (tag === 'tex' || tag === 'latex') kind = 'latex';
    else {
      kind = 'code';
      lang = tag;
    }
  }
  return {
    text: inner.replace(/^\n/, '').replace(/\s+$/, ''),
    labelBlock: { kind, lang, fence: bs.open },
  };
}

// --- Style value coercion ---

function coerceStyleValue(
  key: string,
  raw: string,
): string | number | boolean {
  const v = unquoteD2(raw);
  if (BOOLEAN_STYLE_KEYS.has(key)) {
    if (v === 'true') return true;
    if (v === 'false') return false;
  }
  if (NUMERIC_STYLE_KEYS.has(key)) {
    const n = Number(v);
    if (!Number.isNaN(n)) return n;
  }
  return v;
}

// --- Parser state ---

interface ParseCtx {
  nodes: Map<string, GraphNode<D2NodeData, D2PortData>>;
  edges: GraphEdge<D2EdgeData>[];
  edgeCounts: Map<string, number>;
  graph: D2Graph;
}

function nodeId(path: string[]): string {
  return path.join('.');
}

function ensureNode(
  ctx: ParseCtx,
  path: string[],
  declarationForm: 'dot' | 'block',
): GraphNode<D2NodeData, D2PortData> {
  const id = nodeId(path);
  let node = ctx.nodes.get(id);
  if (!node) {
    const parentId = path.length > 1 ? nodeId(path.slice(0, -1)) : null;
    if (parentId) ensureNode(ctx, path.slice(0, -1), 'dot');
    node = {
      type: 'node',
      id,
      parentId,
      label: null,
      data: { declarationForm },
    };
    ctx.nodes.set(id, node);
    registerChildOrder(ctx, parentId, id);
  }
  return node;
}

function registerChildOrder(
  ctx: ParseCtx,
  parentId: string | null,
  childId: string,
): void {
  if (!parentId) return;
  const parent = ctx.nodes.get(parentId);
  if (!parent) return;
  parent.data.order = parent.data.order ?? [];
  if (!parent.data.order.includes(childId)) parent.data.order.push(childId);
}

function applyReserved(
  node: GraphNode<D2NodeData, D2PortData>,
  keyword: string,
  rest: string[],
  value: string,
): void {
  switch (keyword) {
    case 'shape':
      node.shape = unquoteD2(value);
      break;
    case 'label': {
      const { text, labelBlock } = parseLabelBlock(value);
      node.label = text;
      if (labelBlock) node.data.labelBlock = labelBlock;
      break;
    }
    case 'icon':
      node.data.icon = unquoteD2(value);
      break;
    case 'near':
      node.data.near = unquoteD2(value);
      break;
    case 'tooltip':
      node.data.tooltip = unquoteD2(value);
      break;
    case 'link':
      node.data.link = unquoteD2(value);
      break;
    case 'class':
      node.data.classes = unquoteD2(value)
        .split(/[\s;]+/)
        .filter(Boolean);
      break;
    case 'width':
      node.width = Number(unquoteD2(value));
      break;
    case 'height':
      node.height = Number(unquoteD2(value));
      break;
    case 'left':
      node.x = Number(unquoteD2(value));
      break;
    case 'top':
      node.y = Number(unquoteD2(value));
      break;
    case 'grid-rows':
      node.data.grid = { ...node.data.grid, rows: Number(unquoteD2(value)) };
      break;
    case 'grid-columns':
      node.data.grid = {
        ...node.data.grid,
        columns: Number(unquoteD2(value)),
      };
      break;
    case 'grid-gap':
      node.data.grid = { ...node.data.grid, gap: Number(unquoteD2(value)) };
      break;
    case 'style': {
      // style.key handled via rest
      if (rest.length > 0) {
        const styleKey = rest[0];
        node.style = node.style ?? {};
        node.style[styleKey] = coerceStyleValue(styleKey, value);
      }
      break;
    }
    default: {
      node.data.reserved = node.data.reserved ?? {};
      node.data.reserved[[keyword, ...rest].join('.')] = unquoteD2(value);
    }
  }
}

/** Apply a `style: { ... }` block to a node. */
function applyStyleBlock(
  node: GraphNode<D2NodeData, D2PortData>,
  block: string,
): void {
  for (const tok of splitStatements(block)) {
    if (tok.type !== 'stmt') continue;
    const kv = splitKeyValue(tok.head);
    if (!kv) continue;
    node.style = node.style ?? {};
    node.style[kv.key] = coerceStyleValue(kv.key, kv.value);
  }
}

/** Parse a sql_table / class field declaration into a port. */
function parseFieldPort(
  name: string,
  value: string,
  block: string | undefined,
  classMember: boolean,
): GraphPort<D2PortData> {
  const data: D2PortData = {};
  if (classMember) data.classMember = true;
  let portName = name;
  // class visibility marker prefix (+ - #)
  const vis = portName.match(/^([+\-#])\s*/);
  if (vis) {
    data.visibility = vis[1];
    portName = portName.slice(vis[0].length);
  }
  const typeName = unquoteD2(value);
  if (typeName) data.typeName = typeName;
  if (block) {
    for (const tok of splitStatements(block)) {
      if (tok.type !== 'stmt') continue;
      const kv = splitKeyValue(tok.head);
      if (kv && kv.key === 'constraint') {
        data.constraint = unquoteD2(kv.value)
          .replace(/^\[|\]$/g, '')
          .split(/[\s;,]+/)
          .filter(Boolean);
      }
    }
  }
  return {
    name: unquoteD2(portName),
    direction: 'inout',
    data,
  };
}

const STRUCTURED_SHAPES = new Set(['sql_table', 'class']);

/** Parse the body of a structured-shape (sql_table/class) node into ports. */
function parseStructuredBody(
  ctx: ParseCtx,
  node: GraphNode<D2NodeData, D2PortData>,
  block: string,
  classMember: boolean,
): void {
  node.ports = node.ports ?? [];
  for (const tok of splitStatements(block)) {
    if (tok.type !== 'stmt') continue;
    const kv = splitKeyValue(tok.head);
    if (kv && kv.key === 'shape') {
      node.shape = unquoteD2(kv.value);
      continue;
    }
    if (kv && (kv.key === 'style' || kv.key.startsWith('style.'))) {
      applyStyleBlock(node, tok.block ?? kv.value);
      continue;
    }
    const fieldName = kv ? kv.key : tok.head.trim();
    const fieldType = kv ? kv.value : '';
    node.ports.push(parseFieldPort(fieldName, fieldType, tok.block, classMember));
  }
}

// --- Connection parsing ---

function makeEdge(
  ctx: ParseCtx,
  sourcePath: string[],
  targetPath: string[],
  arrow: D2Arrow,
  label: string | null,
  labelBlock: D2LabelBlock | undefined,
): GraphEdge<D2EdgeData> {
  // Resolve ports: if a path points at a port (last seg is a port name of an
  // existing structured node), split into node + port.
  const resolve = (path: string[]) => resolveEndpoint(ctx, path);
  const src = resolve(sourcePath);
  const tgt = resolve(targetPath);

  // Reverse `<-` so semantic direction is correct.
  let sId = src.nodeId;
  let tId = tgt.nodeId;
  let sPort = src.port;
  let tPort = tgt.port;
  if (arrow === '<-') {
    [sId, tId] = [tId, sId];
    [sPort, tPort] = [tPort, sPort];
  }

  const key = `${sId} ${tId}`;
  const count = ctx.edgeCounts.get(key) ?? 0;
  ctx.edgeCounts.set(key, count + 1);
  const id = `${sId}->${tId}#${count}`;

  const data: D2EdgeData = { arrow };
  if (labelBlock) data.labelBlock = labelBlock;

  const edge: GraphEdge<D2EdgeData> = {
    type: 'edge',
    id,
    sourceId: sId,
    targetId: tId,
    label,
    data,
    mode: ARROW_TO_MODE[arrow],
  };
  if (sPort) edge.sourcePort = sPort;
  if (tPort) edge.targetPort = tPort;
  return edge;
}

function resolveEndpoint(
  ctx: ParseCtx,
  path: string[],
): { nodeId: string; port?: string } {
  if (path.length >= 2) {
    const maybeNode = nodeId(path.slice(0, -1));
    const node = ctx.nodes.get(maybeNode);
    const portName = path[path.length - 1];
    if (node?.ports?.some((p) => p.name === portName)) {
      return { nodeId: maybeNode, port: portName };
    }
  }
  // Ensure the node exists.
  ensureNode(ctx, path, 'dot');
  return { nodeId: nodeId(path) };
}

// --- Top-level scope parsing ---

function parseScope(
  ctx: ParseCtx,
  body: string,
  scopePath: string[],
  pendingComments: string[],
): void {
  const tokens = splitStatements(body);
  let comments: string[] = [...pendingComments];

  for (const tok of tokens) {
    if (tok.type === 'comment') {
      comments.push(tok.text);
      continue;
    }

    const head = tok.head;

    // Import: `key: @path` or `...@path`
    if (head.startsWith('...@') || head.startsWith('@')) {
      const importPath = head.replace(/^\.\.\./, '').replace(/^@/, '').trim();
      ctx.graph.data.source = ctx.graph.data.source ?? {};
      ctx.graph.data.source.imports = ctx.graph.data.source.imports ?? [];
      ctx.graph.data.source.imports.push(importPath);
      comments = [];
      continue;
    }

    // Connection?
    const conn = findConnector(head);
    if (conn && scopePath.length >= 0) {
      handleConnection(ctx, head, tok.block, scopePath, comments);
      comments = [];
      continue;
    }

    // Key declaration
    const kv = splitKeyValue(head);
    const keyText = kv ? kv.key : head;
    const value = kv ? kv.value : '';
    const rawSegs = parseKeyPath(keyText);

    // Scope-level reserved keywords (vars/classes/direction/style on container)
    if (
      rawSegs.length >= 1 &&
      isReservedSegment(rawSegs[0]) &&
      scopePath.length === 0
    ) {
      handleScopeReserved(ctx, rawSegs, value, tok.block, scopePath);
      comments = [];
      continue;
    }

    handleDeclaration(ctx, rawSegs, value, tok.block, scopePath, comments);
    comments = [];
  }

  // Leftover comments → attach to graph trailing (only at root)
  if (scopePath.length === 0 && comments.length > 0) {
    ctx.graph.data.trailingComments = comments;
  }
}

function handleScopeReserved(
  ctx: ParseCtx,
  segs: string[],
  value: string,
  block: string | undefined,
  scopePath: string[],
): void {
  const keyword = segs[0];
  if (keyword === 'direction' && scopePath.length === 0) {
    const dir = unquoteD2(value) as any;
    if (['up', 'down', 'left', 'right'].includes(dir)) ctx.graph.direction = dir;
    return;
  }
  if (keyword === 'vars' && block !== undefined) {
    ctx.graph.data.source = ctx.graph.data.source ?? {};
    ctx.graph.data.source.vars = parseVarsBlock(block);
    return;
  }
  if (keyword === 'classes' && block !== undefined) {
    ctx.graph.data.source = ctx.graph.data.source ?? {};
    ctx.graph.data.source.classes = parseClassesBlock(block);
    return;
  }
  if (keyword === 'style') {
    // graph-level style
    if (block !== undefined) {
      for (const tok of splitStatements(block)) {
        if (tok.type !== 'stmt') continue;
        const kv = splitKeyValue(tok.head);
        if (!kv) continue;
        ctx.graph.style = ctx.graph.style ?? {};
        ctx.graph.style[kv.key] = coerceStyleValue(kv.key, kv.value);
      }
    } else if (segs.length > 1) {
      ctx.graph.style = ctx.graph.style ?? {};
      ctx.graph.style[segs[1]] = coerceStyleValue(segs[1], value);
    }
    return;
  }
}

function parseVarsBlock(block: string): Record<string, any> {
  const out: Record<string, any> = {};
  for (const tok of splitStatements(block)) {
    if (tok.type !== 'stmt') continue;
    const kv = splitKeyValue(tok.head);
    if (kv) out[kv.key] = unquoteD2(kv.value);
  }
  return out;
}

function parseClassesBlock(
  block: string,
): Record<string, Record<string, string | number | boolean>> {
  const out: Record<string, Record<string, string | number | boolean>> = {};
  for (const tok of splitStatements(block)) {
    if (tok.type !== 'stmt' || tok.block === undefined) continue;
    const kv = splitKeyValue(tok.head);
    const className = (kv ? kv.key : tok.head).trim();
    const style: Record<string, string | number | boolean> = {};
    for (const inner of splitStatements(tok.block)) {
      if (inner.type !== 'stmt') continue;
      const ikv = splitKeyValue(inner.head);
      if (!ikv) continue;
      const segs = parseKeyPath(ikv.key);
      const styleKey = segs[0] === 'style' ? segs[1] : segs[0];
      style[styleKey] = coerceStyleValue(styleKey, ikv.value);
    }
    out[className] = style;
  }
  return out;
}

function handleConnection(
  ctx: ParseCtx,
  head: string,
  block: string | undefined,
  scopePath: string[],
  comments: string[],
): void {
  // Strip a connection-reference index suffix: (a -> b)[0]
  let working = head;
  // Split into chain segments and a trailing label.
  const kv = splitKeyValue(working);
  let label: string | null = null;
  let labelBlock: D2LabelBlock | undefined;
  if (kv && findConnector(kv.value) === null) {
    // colon after the connection → label
    working = kv.key;
    const parsed = parseLabelBlock(kv.value);
    label = parsed.text || null;
    labelBlock = parsed.labelBlock;
  }

  // Parse chain: split on connectors, keep arrows.
  const parts: { text: string }[] = [];
  const arrows: D2Arrow[] = [];
  let rest = working.trim();
  // remove surrounding parens of a connection reference
  rest = rest.replace(/^\((.*)\)\s*(\[\d+\])?$/s, '$1');
  let conn = findConnector(rest);
  let lastIndex = 0;
  while (conn) {
    parts.push({ text: rest.slice(lastIndex, conn.index).trim() });
    arrows.push(conn.arrow);
    rest = rest.slice(conn.index + conn.arrow.length);
    conn = findConnector(rest);
    lastIndex = 0;
  }
  parts.push({ text: rest.trim() });

  for (let k = 0; k < arrows.length; k++) {
    const sourcePath = unquotePath(parseKeyPath(parts[k].text));
    const targetPath = unquotePath(parseKeyPath(parts[k + 1].text));
    const fullSource = [...scopePath, ...sourcePath];
    const fullTarget = [...scopePath, ...targetPath];
    const edge = makeEdge(
      ctx,
      fullSource,
      fullTarget,
      arrows[k],
      k === arrows.length - 1 ? label : null,
      k === arrows.length - 1 ? labelBlock : undefined,
    );
    if (comments.length > 0 && k === 0) edge.data.commentsBefore = comments;
    ctx.edges.push(edge);
    registerChildOrder(ctx, scopePath.length ? nodeId(scopePath) : null, edge.id);
    // edge style/arrowhead block
    if (block !== undefined && k === arrows.length - 1) {
      applyEdgeBlock(edge, block);
    }
  }
}

function applyEdgeBlock(edge: GraphEdge<D2EdgeData>, block: string): void {
  for (const tok of splitStatements(block)) {
    if (tok.type !== 'stmt') continue;
    const kv = splitKeyValue(tok.head);
    if (!kv) continue;
    const segs = parseKeyPath(kv.key);
    if (segs[0] === 'style') {
      edge.style = edge.style ?? {};
      if (segs.length > 1) {
        edge.style[segs[1]] = coerceStyleValue(segs[1], kv.value);
      } else if (tok.block !== undefined) {
        for (const inner of splitStatements(tok.block)) {
          if (inner.type !== 'stmt') continue;
          const ikv = splitKeyValue(inner.head);
          if (ikv) edge.style![ikv.key] = coerceStyleValue(ikv.key, ikv.value);
        }
      }
    } else if (segs[0] === 'source-arrowhead' || segs[0] === 'target-arrowhead') {
      const side = segs[0] === 'source-arrowhead' ? 'sourceArrowhead' : 'targetArrowhead';
      edge.data[side] = edge.data[side] ?? {};
      if (segs[1] === 'shape') edge.data[side]!.shape = unquoteD2(kv.value);
      else edge.data[side]!.label = unquoteD2(kv.value);
    } else if (segs[0] === 'label') {
      edge.label = unquoteD2(kv.value);
    } else {
      edge.data.reserved = edge.data.reserved ?? {};
      edge.data.reserved[kv.key] = unquoteD2(kv.value);
    }
  }
}

function handleDeclaration(
  ctx: ParseCtx,
  rawSegs: string[],
  value: string,
  block: string | undefined,
  scopePath: string[],
  comments: string[],
): void {
  // Node-id segments (quotes stripped); scopePath is already unquoted.
  const segs = unquotePath(rawSegs);
  const fullPath = [...scopePath, ...segs];

  // If the leading segment(s) form a node path and the trailing is a reserved
  // attribute, find the split. Quoted segments are literal ids, never reserved.
  let reservedAt = -1;
  for (let i = 0; i < rawSegs.length; i++) {
    if (isReservedSegment(rawSegs[i])) {
      reservedAt = i;
      break;
    }
  }

  if (reservedAt >= 0) {
    const nodePath = [...scopePath, ...segs.slice(0, reservedAt)];
    if (nodePath.length === 0) return; // scope-level reserved handled elsewhere
    const node = ensureNode(ctx, nodePath, 'dot');
    if (comments.length > 0 && !node.data.commentsBefore) {
      node.data.commentsBefore = comments;
    }
    applyReserved(node, rawSegs[reservedAt], segs.slice(reservedAt + 1), value);
    if (rawSegs[reservedAt] === 'style' && block !== undefined) {
      applyStyleBlock(node, block);
    }
    return;
  }

  // Plain node declaration (possibly with label and/or block).
  const declForm: 'dot' | 'block' =
    block !== undefined ? 'block' : segs.length > 1 ? 'dot' : 'block';
  const node = ensureNode(ctx, fullPath, declForm);
  if (comments.length > 0 && !node.data.commentsBefore) {
    node.data.commentsBefore = comments;
  }
  if (value !== '') {
    const { text, labelBlock } = parseLabelBlock(value);
    node.label = text;
    if (labelBlock) node.data.labelBlock = labelBlock;
  }

  if (block !== undefined) {
    // Determine shape to know if structured.
    const shapeFromBlock = peekShape(block);
    if (shapeFromBlock) node.shape = shapeFromBlock;
    if (node.shape && STRUCTURED_SHAPES.has(node.shape)) {
      parseStructuredBody(ctx, node, block, node.shape === 'class');
    } else {
      parseScope(ctx, block, fullPath, []);
    }
  }
}

function peekShape(block: string): string | undefined {
  for (const tok of splitStatements(block)) {
    if (tok.type !== 'stmt') continue;
    const kv = splitKeyValue(tok.head);
    if (kv && parseKeyPath(kv.key).join('.') === 'shape') {
      return unquoteD2(kv.value);
    }
  }
  return undefined;
}

/**
 * Resolve edge endpoints that point at a structured-shape field but were parsed
 * as child nodes because the connection appeared *before* the `sql_table`/`class`
 * declaration (forward reference). Rewrites such endpoints to `sourcePort` /
 * `targetPort` and strips the spurious empty-leaf node that was auto-created.
 */
function finalizePortEndpoints(ctx: ParseCtx): void {
  const childCount = new Map<string, number>();
  for (const n of ctx.nodes.values()) {
    if (n.parentId) {
      childCount.set(n.parentId, (childCount.get(n.parentId) ?? 0) + 1);
    }
  }

  const toRemove = new Set<string>();

  const resolve = (
    id: string,
    port: string | undefined,
  ): [string, string | undefined] => {
    if (port) return [id, port]; // already resolved during parsing
    const node = ctx.nodes.get(id);
    if (!node?.parentId) return [id, port];
    const parent = ctx.nodes.get(node.parentId);
    const portName = id.slice(node.parentId.length + 1);
    if (!parent?.ports?.some((p) => p.name === portName)) return [id, port];
    // Only collapse a node that is an empty leaf shadowing the real port.
    const isEmptyLeaf =
      (childCount.get(id) ?? 0) === 0 &&
      !node.shape &&
      !node.style &&
      (node.label == null || node.label === '') &&
      (node.ports?.length ?? 0) === 0;
    if (!isEmptyLeaf) return [id, port];
    toRemove.add(id);
    return [node.parentId, portName];
  };

  for (const edge of ctx.edges) {
    [edge.sourceId, edge.sourcePort] = resolve(edge.sourceId, edge.sourcePort);
    [edge.targetId, edge.targetPort] = resolve(edge.targetId, edge.targetPort);
  }

  for (const id of toRemove) {
    const node = ctx.nodes.get(id);
    ctx.nodes.delete(id);
    const parent = node?.parentId ? ctx.nodes.get(node.parentId) : undefined;
    if (parent?.data.order) {
      parent.data.order = parent.data.order.filter((x) => x !== id);
    }
  }
}

// --- Entry point ---

export function fromD2(input: string): D2Graph {
  validateD2Input(input);

  const graph: D2Graph = {
    id: '',
    mode: 'directed',
    initialNodeId: null,
    nodes: [],
    edges: [],
    data: { diagramType: 'd2' },
  };

  const ctx: ParseCtx = {
    nodes: new Map(),
    edges: [],
    edgeCounts: new Map(),
    graph,
  };

  parseScope(ctx, input, [], []);
  finalizePortEndpoints(ctx);

  graph.nodes = [...ctx.nodes.values()];
  graph.edges = ctx.edges;

  // Determine graph mode from edges: directed unless all edges undirected.
  if (graph.edges.length > 0) {
    const modes = new Set(graph.edges.map((e) => e.mode));
    if (modes.size === 1 && modes.has('undirected')) {
      graph.mode = 'undirected';
    }
  }

  return graph;
}
