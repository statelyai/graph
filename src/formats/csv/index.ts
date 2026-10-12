import type { Graph, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import { createGraphDocumentConverter, type JSONValue, type GraphDocumentPatchContext } from '../document';
import { getCSVTable, toCSVCell, type CSVTable } from './table';

export interface CSVColumnConfig {
  name: string;
  /** Graph field name; `$extra` carries otherwise unmapped JSON fields. */
  field: string;
  type: 'string' | 'number' | 'boolean' | 'json' | 'mode';
  required?: boolean;
}
export interface CSVGraphSchema {
  delimiter?: ',' | '\t';
  nodes?: CSVColumnConfig[];
  edges?: CSVColumnConfig[];
}
export interface CSVGraphSource {
  nodes: string;
  edges: string;
  schema?: CSVGraphSchema;
  /** Explicit Graph root properties, excluding nodes/edges. */
  graph?: Record<string, any>;
  /** Opaque native source metadata, not implicitly assigned to Graph.data. */
  metadata?: JSONValue;
}
export interface CSVImportOptions {
  delimiter?: ',' | '\t';
  schema?: CSVGraphSchema;
  /** `native` disables the `$extra` adapter field; declared data cells remain typed. */
  metadata?: 'auto' | 'native';
}
export interface CSVExportOptions {
  delimiter?: ',' | '\t';
  schema?: CSVGraphSchema;
  lineEnding?: '\n' | '\r\n';
  /** False omits unmapped Graph fields and root properties; this is explicitly lossy. */
  nativeCarrier?: boolean;
}

const NODE_FIELDS = ['label', 'parentId', 'initialNodeId', 'data', 'ports', 'x', 'y', 'width', 'height', 'color', 'shape', 'style'];
const EDGE_FIELDS = ['mode', 'sourcePort', 'targetPort', 'label', 'data', 'weight', 'points', 'routing', 'x', 'y', 'width', 'height', 'color', 'style'];
const MODES = new Set(['directed', 'undirected', 'bidirectional']);
const TYPES = new Set(['string', 'number', 'boolean', 'json', 'mode']);

/** Reject values outside the plain JSON domain before any serialization loss. */
function getCSVJSON(value: any): string {
  const ancestors = new Set<object>();
  const stack: Array<{ value: any; exit?: boolean }> = [{ value }];
  while (stack.length) {
    const item = stack.pop()!;
    const current = item.value;
    if (item.exit) { ancestors.delete(current); continue; }
    if (current === null || ['string', 'boolean'].includes(typeof current) || typeof current === 'number' && Number.isFinite(current)) continue;
    if (!current || typeof current !== 'object' || !Array.isArray(current) && ![Object.prototype, null].includes(Object.getPrototypeOf(current))) throw new Error('CSV: values must be plain finite JSON');
    if (ancestors.has(current)) throw new Error('CSV: cyclic JSON data');
    if (Object.getOwnPropertySymbols(current).length) throw new Error('CSV: symbol properties cannot be encoded');
    const descriptors = Object.getOwnPropertyDescriptors(current);
    const keys = Object.keys(descriptors).filter((key) => !(Array.isArray(current) && key === 'length'));
    if (Array.isArray(current) && keys.length !== current.length) throw new Error('CSV: sparse JSON arrays');
    ancestors.add(current); stack.push({ value: current, exit: true });
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor.enumerable || !('value' in descriptor) || Array.isArray(current) && !/^(?:0|[1-9]\d*)$/.test(key)) throw new Error('CSV: accessors/non-JSON properties cannot be encoded');
      stack.push({ value: descriptor.value });
    }
  }
  return JSON.stringify(value);
}

function getCSVColumns(kind: 'nodes' | 'edges', schema?: CSVGraphSchema): CSVColumnConfig[] {
  const required = kind === 'nodes' ? ['id'] : ['id', 'sourceId', 'targetId'];
  const columns = schema?.[kind] ?? [
    ...required.map((field): CSVColumnConfig => ({ name: field, field, type: 'string', required: true })),
    ...(kind === 'nodes' ? NODE_FIELDS : EDGE_FIELDS).map((field): CSVColumnConfig => ({ name: field, field, type: 'json' })),
    { name: '__extra', field: '$extra', type: 'json' as const },
  ];
  if (!Array.isArray(columns) || columns.some((column) => !column || typeof column.name !== 'string' || !column.name || typeof column.field !== 'string' || !column.field || !TYPES.has(column.type) || column.required !== undefined && typeof column.required !== 'boolean' || column.field === 'type' || column.field === 'nodes' || column.field === 'edges' || column.field === '$extra' && column.type !== 'json')) throw new Error('CSV: invalid column schema');
  if (new Set(columns.map((column) => column.name)).size !== columns.length || new Set(columns.map((column) => column.field)).size !== columns.length) throw new Error('CSV: duplicate schema column names/fields');
  if (required.some((field) => !columns.some((column) => column.field === field))) throw new Error(`CSV: schema requires ${required.join(', ')} fields`);
  return columns.map((column) => ({ name: column.name, field: column.field, type: column.type, ...(column.required !== undefined && { required: column.required }) }));
}

function getCSVDelimiter(source?: CSVGraphSource, options?: CSVImportOptions | CSVExportOptions): ',' | '\t' {
  const delimiter = options?.delimiter ?? options?.schema?.delimiter ?? source?.schema?.delimiter ?? ',';
  if (delimiter !== ',' && delimiter !== '\t') throw new Error('CSV: delimiter must be comma or tab');
  return delimiter;
}

function getCSVValue(text: string, column: CSVColumnConfig): any {
  if (text === '' && column.type !== 'string') {
    if (column.required) throw new Error(`CSV: required cell ${column.name} is empty`);
    return undefined;
  }
  switch (column.type) {
    case 'string': return text;
    case 'json': try { const value = JSON.parse(text); getCSVJSON(value); return value; } catch { throw new Error(`CSV: invalid JSON cell ${column.name}`); }
    case 'number': {
      if (!/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text))) throw new Error(`CSV: invalid finite number cell ${column.name}`);
      return Number(text);
    }
    case 'boolean': if (text === 'true') return true; if (text === 'false') return false; throw new Error(`CSV: invalid boolean cell ${column.name}`);
    case 'mode': if (MODES.has(text)) return text; throw new Error(`CSV: unknown mode cell ${column.name}`);
  }
}

function toCSVValue(value: any, column: CSVColumnConfig): string {
  if (value === undefined) { if (column.required) throw new Error(`CSV: missing required field ${column.field}`); return ''; }
  if (column.type === 'json') return getCSVJSON(value);
  if (column.type === 'string' && typeof value === 'string') return value;
  if (column.type === 'number' && typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (column.type === 'boolean' && typeof value === 'boolean') return String(value);
  if (column.type === 'mode' && MODES.has(value)) return value;
  throw new Error(`CSV: ${column.field} cannot be encoded as ${column.type}`);
}

function getCSVRecords(table: CSVTable, columns: CSVColumnConfig[], kind: 'nodes' | 'edges', native: boolean): any[] {
  const indices = new Map(table.headers.map((header, index) => [header, index]));
  const required = kind === 'nodes' ? ['id'] : ['id', 'sourceId', 'targetId'];
  for (const column of columns) if ((column.required || required.includes(column.field)) && !indices.has(column.name)) throw new Error(`CSV: missing required header ${column.name}`);
  return table.rows.map((cells) => {
    const record: Record<string, any> = { type: kind === 'nodes' ? 'node' : 'edge' };
    const extras: Array<[string, any]> = [];
    for (const column of columns) {
      const index = indices.get(column.name);
      if (index === undefined || native && column.field === '$extra') continue;
      const value = getCSVValue(cells[index].value, column);
      if (column.field === '$extra') {
        if (value === undefined) continue;
        if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('CSV: $extra must be a JSON object');
        extras.push(...Object.entries(value));
      } else if (value !== undefined) Object.defineProperty(record, column.field, { value, enumerable: true, writable: true, configurable: true });
    }
    for (const [key, value] of extras) {
      if (key === 'type' || columns.some((column) => column.field !== '$extra' && column.field === key)) throw new Error(`CSV: $extra collides with mapped field ${key}`);
      Object.defineProperty(record, key, { value, enumerable: true, writable: true, configurable: true });
    }
    return record;
  });
}

function getCSVValidatedStyle(style: any): void {
  if (style !== undefined && (!style || typeof style !== 'object' || Array.isArray(style) || Object.values(style).some((value) => !['string', 'number', 'boolean'].includes(typeof value) || typeof value === 'number' && !Number.isFinite(value)))) throw new Error('CSV: invalid style');
}

function getCSVValidatedGraph(graph: Graph): void {
  const nodes = new Map<string, Graph['nodes'][number]>();
  const edges = new Set<string>();
  if (typeof graph.id !== 'string' || !MODES.has(graph.mode)) throw new Error('CSV: invalid graph id/mode');
  for (const node of graph.nodes) {
    if (typeof node.id !== 'string' || !node.id || nodes.has(node.id)) throw new Error('CSV: duplicate/empty node IDs');
    if (node.type !== 'node') throw new Error('CSV: invalid node type');
    if (node.ports !== undefined && (!Array.isArray(node.ports) || node.ports.some((port) => !port || typeof port.name !== 'string' || !port.name || !['in', 'out', 'inout'].includes(port.direction)) || new Set(node.ports.map((port) => port.name)).size !== node.ports.length)) throw new Error('CSV: invalid or duplicate ports');
    nodes.set(node.id, node);
  }
  for (const edge of graph.edges) {
    if (typeof edge.id !== 'string' || !edge.id || edges.has(edge.id)) throw new Error('CSV: duplicate/empty edge IDs');
    if (edge.type !== 'edge' || !nodes.has(edge.sourceId) || !nodes.has(edge.targetId)) throw new Error('CSV: dangling/invalid edge endpoints');
    if (edge.mode !== undefined && !MODES.has(edge.mode)) throw new Error('CSV: unknown edge mode');
    for (const [field, endpoint] of [['sourcePort', edge.sourceId], ['targetPort', edge.targetId]] as const) if (edge[field] !== undefined && !nodes.get(endpoint)?.ports?.some((port) => port.name === edge[field])) throw new Error(`CSV: missing ${field}`);
    edges.add(edge.id);
  }
  for (const entity of [...graph.nodes, ...graph.edges]) {
    if (entity.label !== undefined && entity.label !== null && typeof entity.label !== 'string') throw new Error('CSV: label must be string or null');
    for (const field of ['x', 'y', 'width', 'height', 'weight']) if ((entity as any)[field] !== undefined && (typeof (entity as any)[field] !== 'number' || !Number.isFinite((entity as any)[field]))) throw new Error(`CSV: ${field} must be finite`);
    for (const field of ['color', 'shape', 'sourcePort', 'targetPort']) if ((entity as any)[field] !== undefined && typeof (entity as any)[field] !== 'string') throw new Error(`CSV: ${field} must be string`);
    getCSVValidatedStyle(entity.style);
    const points = (entity as any).points;
    if (points !== undefined && (!Array.isArray(points) || points.some((point) => !point || typeof point.x !== 'number' || !Number.isFinite(point.x) || typeof point.y !== 'number' || !Number.isFinite(point.y)))) throw new Error('CSV: invalid route points');
    if ((entity as any).routing !== undefined && !['polyline', 'orthogonal', 'splines'].includes((entity as any).routing)) throw new Error('CSV: invalid routing');

  }
  getCSVValidatedStyle(graph.style);
  if (graph.direction !== undefined && !['up', 'down', 'left', 'right'].includes(graph.direction)) throw new Error('CSV: invalid graph direction');
  if (graph.initialNodeId !== undefined && graph.initialNodeId !== null && !nodes.has(graph.initialNodeId)) throw new Error('CSV: missing graph initial node');
  for (const node of graph.nodes) {
    if (node.parentId !== undefined && node.parentId !== null && (typeof node.parentId !== 'string' || !nodes.has(node.parentId))) throw new Error('CSV: missing parent node');
    if (node.initialNodeId !== undefined && node.initialNodeId !== null && !nodes.has(node.initialNodeId)) throw new Error('CSV: missing node initial reference');
    for (const port of node.ports ?? []) {
      if (port.label !== undefined && typeof port.label !== 'string') throw new Error('CSV: invalid port label');
      for (const field of ['x', 'y', 'width', 'height']) if ((port as any)[field] !== undefined && (typeof (port as any)[field] !== 'number' || !Number.isFinite((port as any)[field]))) throw new Error('CSV: invalid port geometry');
      getCSVValidatedStyle(port.style);
    }

  }
}

export function fromCSV<N = any, E = any, G = any, P = any>(source: CSVGraphSource, options: CSVImportOptions = {}): Graph<N, E, G, P> {
  if (!source || typeof source !== 'object') throw new Error('CSV: expected separate nodes/edges tables');
  const delimiter = getCSVDelimiter(source, options);
  const schema = options.schema ?? source.schema;
  const nodes = getCSVRecords(getCSVTable(source.nodes, delimiter), getCSVColumns('nodes', schema), 'nodes', options.metadata === 'native');
  const edges = getCSVRecords(getCSVTable(source.edges, delimiter), getCSVColumns('edges', schema), 'edges', options.metadata === 'native');
  const root = source.graph === undefined ? { id: '', mode: 'directed', initialNodeId: null, data: null } : JSON.parse(getCSVJSON(source.graph));
  if (!root || typeof root !== 'object' || Array.isArray(root) || Object.hasOwn(root, 'nodes') || Object.hasOwn(root, 'edges')) throw new Error('CSV: graph root must be a property object without tables');
  const graph = { ...root, id: Object.hasOwn(root, 'id') ? root.id : '', mode: Object.hasOwn(root, 'mode') ? root.mode : 'directed', nodes, edges } as Graph<N, E, G, P>;
  getCSVValidatedGraph(graph);
  return graph;
}

export function toCSV(graph: Graph, options: CSVExportOptions = {}): CSVGraphSource {
  getCSVValidatedGraph(graph);
  const delimiter = getCSVDelimiter(undefined, options);
  const schema: CSVGraphSchema = { delimiter, nodes: getCSVColumns('nodes', options.schema), edges: getCSVColumns('edges', options.schema) };
  if (options.nativeCarrier === false) {
    schema.nodes = schema.nodes!.filter((column) => column.field !== '$extra');
    schema.edges = schema.edges!.filter((column) => column.field !== '$extra');
  }
  const ending = options.lineEnding ?? '\r\n';
  if (ending !== '\n' && ending !== '\r\n') throw new Error('CSV: invalid line ending');
  const source = {} as CSVGraphSource;
  for (const kind of ['nodes', 'edges'] as const) {
    const columns = schema[kind]!;
    const mapped = new Set(['type', ...columns.filter((column) => column.field !== '$extra').map((column) => column.field)]);
    const lines = [columns.map((column) => toCSVCell(column.name, delimiter)).join(delimiter)];
    for (const entity of graph[kind]) lines.push(columns.map((column) => {
      const value = column.field === '$extra' ? Object.fromEntries(Object.entries(entity).filter(([key, value]) => !mapped.has(key) && value !== undefined)) : (entity as any)[column.field];
      return toCSVCell(toCSVValue(value, column), delimiter);
    }).join(delimiter));
    source[kind] = lines.join(ending) + ending;
  }
  source.schema = schema;
  if (options.nativeCarrier !== false) source.graph = Object.fromEntries(Object.entries(graph).filter(([key, value]) => !['nodes', 'edges'].includes(key) && value !== undefined).map(([key, value]) => [key, JSON.parse(getCSVJSON(value))]));
  return source;
}

export function fromTSV<N = any, E = any, G = any, P = any>(source: CSVGraphSource, options: CSVImportOptions = {}): Graph<N, E, G, P> { return fromCSV(source, { ...options, delimiter: '\t' }); }
export function toTSV(graph: Graph, options: CSVExportOptions = {}): CSVGraphSource { return toCSV(graph, { ...options, delimiter: '\t' }); }
export const csvConverter: GraphFormatConverter<CSVGraphSource> = createFormatConverter(toCSV, fromCSV);
export const tsvConverter: GraphFormatConverter<CSVGraphSource> = createFormatConverter(toTSV, fromTSV);

function getCSVDocumentPatch(context: GraphDocumentPatchContext<CSVGraphSource>, forcedDelimiter?: ',' | '\t') {
  const source = context.source;
  const delimiter = getCSVDelimiter(source, { delimiter: forcedDelimiter });
  const patches: Record<'nodes' | 'edges', Array<{ start: number; end: number; text: string }>> = { nodes: [], edges: [] };
  const tables = { nodes: getCSVTable(source.nodes, delimiter), edges: getCSVTable(source.edges, delimiter) };
  const records = { nodes: context.sourceGraph.nodes, edges: context.sourceGraph.edges };
  const columnMaps = { nodes: new Map(getCSVColumns('nodes', source.schema).map((column) => [column.field, column])), edges: new Map(getCSVColumns('edges', source.schema).map((column) => [column.field, column])) };
  const rows = { nodes: new Map(records.nodes.map((entity, index) => [entity.id, tables.nodes.rows[index]])), edges: new Map(records.edges.map((entity, index) => [entity.id, tables.edges.rows[index]])) };
  try {
    for (const change of context.changes) {
      if (change.entity === 'graph') {
        if (change.field === 'nodes' || change.field === 'edges') throw new Error('structural edits require explicit source editing');
        const root = source.graph ?? Object.fromEntries(Object.entries(context.sourceGraph).filter(([key]) => !['nodes', 'edges'].includes(key)));
        if (change.afterPresent) Object.defineProperty(root, change.field, { value: change.after, enumerable: true, writable: true, configurable: true });
        else delete root[change.field];
        source.graph = root; continue;
      }
      if (['id', 'sourceId', 'targetId', 'type', 'parentId', 'ports', 'sourcePort', 'targetPort'].includes(change.field)) throw new Error(`${change.field} changes are outside the bounded cell patch policy`);
      const kind = change.entity === 'node' ? 'nodes' : 'edges';
      const column = columnMaps[kind].get(change.field);
      const index = column ? tables[kind].headers.indexOf(column.name) : -1;
      const cell = rows[kind].get(change.id!)?.[index];
      if (!column || !cell) throw new Error(`${change.field} has no declared source cell`);
      patches[kind].push({ start: cell.start, end: cell.end, text: toCSVCell(toCSVValue(change.afterPresent ? change.after : undefined, column), delimiter, cell.quoted) });
    }
    for (const kind of ['nodes', 'edges'] as const) {
      patches[kind].sort((a, b) => a.start - b.start);
      let output = ''; let offset = 0;
      for (const patch of patches[kind]) { output += source[kind].slice(offset, patch.start) + patch.text; offset = patch.end; }
      source[kind] = output + source[kind].slice(offset);
    }
    return { ok: true as const, source };
  } catch (error) { return { ok: false as const, diagnostics: [{ code: 'unsupported-edit', severity: 'error' as const, message: `CSV: ${error instanceof Error ? error.message : String(error)}` }] }; }
}

export const csvDocumentConverter = createGraphDocumentConverter({ format: 'csv', codec: { from: fromCSV, to: toCSV }, patch: (context) => getCSVDocumentPatch(context) });
export const tsvDocumentConverter = createGraphDocumentConverter({ format: 'tsv', codec: { from: fromTSV, to: toTSV }, patch: (context) => getCSVDocumentPatch(context, '\t') });
