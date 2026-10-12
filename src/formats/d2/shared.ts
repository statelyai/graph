import type { Graph, GraphMode } from '../../types';

// --- D2 connector (arrow) types ---

export type D2Arrow = '->' | '<-' | '--' | '<->';

/** Map a d2 connector glyph to a graph edge mode. */
export const ARROW_TO_MODE: Record<D2Arrow, GraphMode> = {
  '->': 'directed',
  '<-': 'directed',
  '--': 'undirected',
  '<->': 'bidirectional',
};

// --- Reserved keywords (d2 "holder" keys that are not child nodes) ---
// https://d2lang.com/tour/style etc.

export const RESERVED_KEYWORDS = new Set([
  'shape',
  'label',
  'icon',
  'near',
  'tooltip',
  'link',
  'direction',
  'constraint',
  'width',
  'height',
  'top',
  'left',
  'style',
  'class',
  'classes',
  'vars',
  'source-arrowhead',
  'target-arrowhead',
  'grid-rows',
  'grid-columns',
  'grid-gap',
  'vertical-gap',
  'horizontal-gap',
]);

/** Style sub-keys that are booleans in d2. */
export const BOOLEAN_STYLE_KEYS = new Set([
  '3d',
  'multiple',
  'double-border',
  'animated',
  'bold',
  'italic',
  'underline',
  'filled',
  'shadow',
]);

/** Style sub-keys whose value is numeric in d2. */
export const NUMERIC_STYLE_KEYS = new Set([
  'stroke-width',
  'stroke-dash',
  'opacity',
  'border-radius',
  'font-size',
]);

// --- Data interfaces ---

/** Descriptor for a typed/block label (`|md ...|`, `|js ...|`, block strings). */
export interface D2LabelBlock {
  kind: 'md' | 'code' | 'latex' | 'block';
  /** Language tag for code blocks (e.g. `js`, `go`). */
  lang?: string;
  /** The fence delimiter used (`|`, `||`, `` |` ``, etc.), preserved for emit. */
  fence: string;
}

export interface D2GridSpec {
  rows?: number;
  columns?: number;
  gap?: number;
  verticalGap?: number;
  horizontalGap?: number;
}

/** Source-level abstractions preserved from the original d2 text. */
export interface D2Source {
  /** `vars: { ... }` blocks, stored as nested key/value maps. */
  vars?: Record<string, any>;
  /** `classes: { name: { ...style } }` definitions. */
  classes?: Record<string, Record<string, any>>;
  /** `@path` import references in declaration order. */
  imports?: string[];
  importRecords?: Array<{ path: string; spread: boolean; scopeId: string | null; ref: string }>;
  /** Unsupported language constructs retained for inspection, not applied to topology. */
  unknownStatements?: string[];
}

export interface D2GraphData {
  diagramType: 'd2';
  source?: D2Source;
  /** Comments before any statement / at file top. */
  leadingComments?: string[];
  /** Comments after the last statement. */
  trailingComments?: string[];
  order?: string[];
}

export interface D2NodeData {
  labelSource?: string;
  sourceLabel?: string;
  /** Authored key segments, guarded by sourceId so later ID edits take precedence. */
  keyPath?: string[];
  sourceId?: string;
  source?: D2Source;
  trailingComments?: string[];
  commentsAfter?: string[];
  /** Whether the author declared this node via dot-path or a `{ }` block. */
  declarationForm?: 'dot' | 'block';
  /** Relative positioning keyword/target (`near: top-center`, `near: a.b`). */
  near?: string;
  /** Icon URL. */
  icon?: string;
  tooltip?: string;
  link?: string;
  /** Names of `classes` applied to this node via `class:`. */
  classes?: string[];
  /** Typed/block label descriptor; absent for plain labels. */
  labelBlock?: D2LabelBlock;
  /** Grid layout spec for grid containers. */
  grid?: D2GridSpec;
  /**
   * Source-order list of direct child node IDs and edge IDs, used by
   * sequence diagrams (and any ordering-sensitive container) to replay
   * statement order on emit.
   */
  order?: string[];
  /** Comments immediately preceding this node's declaration. */
  commentsBefore?: string[];
  /** Reserved keywords with no canonical/typed home, preserved verbatim. */
  reserved?: Record<string, string | number | boolean>;
}

export interface D2ArrowheadSpec {
  shape?: string;
  label?: string;
  style?: Record<string, string | number | boolean>;
  attributes?: Record<string, any>;
}

export interface D2EdgeData {
  labelSource?: string;
  sourceLabel?: string;
  /** Authored connector glyph, for faithful re-emit (incl. reversed `<-`). */
  arrow: D2Arrow;
  sourceArrowhead?: D2ArrowheadSpec;
  targetArrowhead?: D2ArrowheadSpec;
  classes?: string[];
  labelBlock?: D2LabelBlock;
  commentsBefore?: string[];
  commentsAfter?: string[];
  reserved?: Record<string, string | number | boolean>;
}

export interface D2PortData {
  commentsBefore?: string[];
  attributes?: Record<string, any>;
  /** SQL column type (`int`, `varchar`, ...) or class member type. */
  typeName?: string;
  /** SQL constraints (`primary_key`, `foreign_key`, `unique`). */
  constraint?: string[];
  /** Class member visibility marker (`+`, `-`, `#`). */
  visibility?: string;
  /** True when this port came from a `shape: class` member rather than sql_table. */
  classMember?: boolean;
}

export type D2Graph = Graph<D2NodeData, D2EdgeData, D2GraphData, D2PortData>;

// --- Identifier escaping ---

const SAFE_ID = /^[A-Za-z0-9_][A-Za-z0-9_ -]*$/;

/** Quote a d2 key/id if it contains characters that need escaping. */
export function escapeD2Key(id: string): string {
  getD2ScalarString(id);
  if (id === '') return '""';
  // Quote reserved keywords so a node literally named e.g. `shape` round-trips
  // as a node id rather than being re-parsed as a reserved attribute.
  if (RESERVED_KEYWORDS.has(id)) return `"${id}"`;
  if (SAFE_ID.test(id) && !id.includes('  ')) return id;
  return JSON.stringify(id);
}

/** D2 accepts NUL labels, but its UTF-8 compiler cannot preserve lone surrogates. */
export function getD2ScalarString(value: string): string {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = value.charCodeAt(++index);
      if (!(next >= 0xdc00 && next <= 0xdfff)) throw new Error('D2: wire labels/IDs require Unicode scalar strings');
    } else if (code >= 0xdc00 && code <= 0xdfff) throw new Error('D2: wire labels/IDs require Unicode scalar strings');
  }
  return value;
}
export function getD2ScalarGraph(graph: D2Graph): D2Graph {
  for (const node of graph.nodes) {
    getD2ScalarString(node.id); if (node.label != null) getD2ScalarString(node.label);
    for (const port of node.ports ?? []) { getD2ScalarString(port.name); if (port.label !== undefined) getD2ScalarString(port.label); if (typeof port.data?.typeName === 'string') getD2ScalarString(port.data.typeName); }
  }
  for (const edge of graph.edges) { getD2ScalarString(edge.sourceId); getD2ScalarString(edge.targetId); if (edge.label != null) getD2ScalarString(edge.label); }
  return graph;
}
/** Quote a d2 label value if needed (contains `:`, `#`, leading/trailing space, etc.). */
export function escapeD2Label(label: string): string {
  getD2ScalarString(label);
  if (label === '') return '""';
  if (/[:;#{}|<>"\n]/.test(label) || label !== label.trim()) {
    return JSON.stringify(label);
  }
  return label;
}

/** Remove surrounding quotes from a d2 string token and unescape. */
export function unquoteD2(s: string): string {
  const t = s.trim();
  if (t.length >= 2 && t[0] === '"' && t[t.length - 1] === '"') {
    try { return JSON.parse(t); } catch { return t.slice(1, -1).replace(/\\(["\\])/g, '$1'); }
  }
  if (t.length >= 2 && t[0] === "'" && t[t.length - 1] === "'") {
    return t.slice(1, -1);
  }
  return t;
}

export function validateD2Input(input: unknown): asserts input is string {
  if (typeof input !== 'string') {
    throw new Error('D2: expected a string');
  }
}
