import type { Graph } from '../../types';
import { createFormatConverter } from '../converter';
import { createGraphDocumentConverter } from '../document';
import { createNativeCarrier, getNativeCarrier, getCarrierData, getNativeDocumentGraph, isJSONEqual, type FormatImportOptions, type FormatExportOptions } from '../preservation';
import { createMatrixSidecar, getMatrixSidecar, getMatrixGraph, getGraphMatrixView, getMatrixKey, getMatrixLimit, getValidatedNodeIds, getMatrixAggregation, getMatrixDocumentChanges, type MatrixAggregation, type MatrixSidecar, type MatrixView } from '../adjacency-matrix/core';

export interface MatrixMarketImportOptions extends FormatImportOptions {
  nodeIds?: string[]; mode?: 'directed' | 'undirected'; aggregation?: MatrixAggregation;
  maxCells?: number; maxNodes?: number; maxEntries?: number;
}
export interface MatrixMarketExportOptions extends FormatExportOptions {
  storage?: 'coordinate' | 'array'; field?: 'real' | 'integer' | 'pattern'; symmetry?: 'general' | 'symmetric';
  aggregation?: MatrixAggregation; maxCells?: number;
}
interface MatrixMarketRecord { row: number; col: number; value: number; line: number }
interface MatrixMarketSource {
  lines: string[]; endings: string[]; storage: 'coordinate' | 'array'; field: 'real' | 'integer' | 'pattern'; symmetry: 'general' | 'symmetric';
  size: number; dimensionLine: number; records: MatrixMarketRecord[]; sidecar?: MatrixSidecar; sidecarLine?: number;
}
const SIDECAR = '% @statelyai/graph/matrix ';

function getInteger(value: string, label: string): number {
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value))) throw new Error(`Matrix Market: invalid ${label}`);
  return Number(value);
}
function getNumber(value: string, field: MatrixMarketSource['field']): number {
  if ((field === 'integer' && !/^[+-]?\d+$/.test(value)) || !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eEdD][+-]?\d+)?$/.test(value)) throw new Error('Matrix Market: invalid numeric coefficient');
  const number = Number(value.replace(/[dD]/, 'e'));
  if (!Number.isFinite(number) || (field === 'integer' && !Number.isSafeInteger(number))) throw new Error('Matrix Market: coefficient is non-finite or not a safe integer');
  return number;
}
function getParsedMatrixMarket(text: string, options: MatrixMarketImportOptions = {}): MatrixMarketSource {
  if (typeof text !== 'string') throw new Error('Matrix Market: expected text');
  const lines: string[] = [], endings: string[] = [];
  const pattern = /([^\r\n]*)(\r\n|\r|\n|$)/g; let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) && (match[0].length || match.index < text.length)) { lines.push(match[1]); endings.push(match[2]); if (!match[2]) break; }
  const header = lines[0]?.trim().toLowerCase().split(/\s+/);
  if (header?.length !== 5 || header[0] !== '%%matrixmarket' || header[1] !== 'matrix' || !['coordinate', 'array'].includes(header[2]) || !['real', 'integer', 'pattern'].includes(header[3]) || !['general', 'symmetric'].includes(header[4])) throw new Error('Matrix Market: unsupported header/storage/field/symmetry');
  const storage = header[2] as MatrixMarketSource['storage'], field = header[3] as MatrixMarketSource['field'], symmetry = header[4] as MatrixMarketSource['symmetry'];
  if (storage === 'array' && field === 'pattern') throw new Error('Matrix Market: array pattern storage is unsupported');
  let sidecar: MatrixSidecar | undefined, sidecarLine: number | undefined;
  const dataLines: number[] = [];
  for (let line = 1; line < lines.length; line++) {
    const value = lines[line].trim(); if (!value) continue;
    if (value.startsWith('%')) {
      if (options.metadata !== 'native' && value.startsWith(SIDECAR)) {
        let parsed: any; try { parsed = JSON.parse(value.slice(SIDECAR.length)); } catch { throw new Error('Matrix Market: malformed Graph sidecar'); }
        const metadata = getMatrixSidecar(parsed, 'matrix-market');
        if (metadata) { sidecar = metadata; sidecarLine = line; }
      }
      continue;
    }
    dataLines.push(line);
  }
  const dimensionLine = dataLines.shift();
  if (dimensionLine === undefined) throw new Error('Matrix Market: missing dimensions');
  const dimensions = lines[dimensionLine].trim().split(/\s+/);
  if (dimensions.length !== (storage === 'coordinate' ? 3 : 2)) throw new Error('Matrix Market: invalid dimensions');
  const rows = getInteger(dimensions[0], 'row count'), cols = getInteger(dimensions[1], 'column count');
  if (rows !== cols) throw new Error('Matrix Market: rectangular matrices have no square Graph projection');
  const maxNodes = options.maxNodes ?? 1_000_000, maxEntries = options.maxEntries ?? 1_000_000;
  if (!Number.isSafeInteger(maxNodes) || maxNodes < 0 || !Number.isSafeInteger(maxEntries) || maxEntries < 0 || rows > maxNodes) throw new Error('Matrix Market: maxNodes/maxEntries exceeded or invalid');
  const count = storage === 'coordinate' ? getInteger(dimensions[2], 'entry count') : symmetry === 'symmetric' ? rows * (rows + 1) / 2 : rows * rows;
  if (storage === 'array') getMatrixLimit(rows, options.maxCells);
  if (!Number.isSafeInteger(count) || count > maxEntries || dataLines.length !== count) throw new Error('Matrix Market: record count does not match dimensions or exceeds maxEntries');
  const records: MatrixMarketRecord[] = [];
  let row = 0, col = 0;
  for (const line of dataLines) {
    const values = lines[line].trim().split(/\s+/);
    if (storage === 'coordinate') {
      if (values.length !== (field === 'pattern' ? 2 : 3)) throw new Error('Matrix Market: invalid coordinate record');
      const r = getInteger(values[0], 'row index') - 1, c = getInteger(values[1], 'column index') - 1;
      if (r < 0 || c < 0 || r >= rows || c >= cols || (symmetry === 'symmetric' && r < c)) throw new Error('Matrix Market: coordinate index outside declared lower-triangle dimensions');
      records.push({ row: r, col: c, value: field === 'pattern' ? 1 : getNumber(values[2], field), line });
    } else {
      if (values.length !== 1) throw new Error('Matrix Market: scoped array records require one coefficient per line');
      records.push({ row, col, value: getNumber(values[0], field), line }); row++;
      if (row === rows) { col++; row = symmetry === 'symmetric' ? col : 0; }
    }
  }
  return { lines, endings, storage, field, symmetry, size: rows, dimensionLine, records, sidecar, sidecarLine };
}

function getMatrixMarketView(parsed: MatrixMarketSource, options: MatrixMarketImportOptions = {}): MatrixView {
  if (parsed.sidecar && options.nodeIds && !isJSONEqual(options.nodeIds, parsed.sidecar.nodeIds)) throw new Error('Matrix Market: nodeIds parameter conflicts with Graph sidecar; use metadata:native to override');
  if (parsed.sidecar && options.mode && options.mode !== parsed.sidecar.mode) throw new Error('Matrix Market: mode parameter conflicts with Graph sidecar');
  const nodeIds = options.nodeIds ?? parsed.sidecar?.nodeIds ?? Array.from({ length: parsed.size }, (_, index) => String(index));
  getValidatedNodeIds(nodeIds); if (nodeIds.length !== parsed.size) throw new Error('Matrix Market: nodeIds count differs from dimensions');
  const mode = options.mode ?? parsed.sidecar?.mode ?? (parsed.symmetry === 'symmetric' ? 'undirected' : 'directed');
  const zeros = new Set(parsed.sidecar?.zeroPresence?.map(([sourceId, targetId]) => getMatrixKey(sourceId, targetId, mode)));
  const groups = new Map<string, { sourceId: string; targetId: string; values: number[] }>();
  for (const record of parsed.records) {
    const endpoints = [[record.row, record.col]];
    if (parsed.symmetry === 'symmetric' && mode === 'directed' && record.row !== record.col) endpoints.push([record.col, record.row]);
    for (const [row, col] of endpoints) {
      const sourceId = nodeIds[row], targetId = nodeIds[col], key = getMatrixKey(sourceId, targetId, mode);
      if (parsed.storage === 'array' && record.value === 0 && !zeros.has(key)) continue;
      const group = groups.get(key) ?? { sourceId, targetId, values: [] }; group.values.push(record.value); groups.set(key, group);
    }
  }
  if (mode === 'undirected' && parsed.symmetry === 'general') {
    // A general dense/sparse symmetric matrix contains both halves of each edge.
    const positions = new Map<string, number[]>();
    for (const record of parsed.records) { const key = `${record.row},${record.col}`, values = positions.get(key) ?? []; values.push(record.value); positions.set(key, values); }
    const byPosition = new Map([...positions].map(([key, values]) => [key, getMatrixAggregation(values, options.aggregation ?? 'reject')]));
    for (const record of parsed.records) if (record.row !== record.col && ((parsed.storage === 'coordinate' && !byPosition.has(`${record.col},${record.row}`)) || byPosition.get(`${record.row},${record.col}`) !== (byPosition.get(`${record.col},${record.row}`) ?? 0))) throw new Error('Matrix Market: undirected general coefficients and stored presence must be symmetric');
    groups.clear();
    for (const record of parsed.records) if (record.row <= record.col && (parsed.storage === 'coordinate' || record.value !== 0 || zeros.has(getMatrixKey(nodeIds[record.row], nodeIds[record.col], mode)))) {
      const key = getMatrixKey(nodeIds[record.row], nodeIds[record.col], mode), group = groups.get(key) ?? { sourceId: nodeIds[record.row], targetId: nodeIds[record.col], values: [] };
      group.values.push(record.value); groups.set(key, group);
    }
  }
  return { nodeIds, mode, cells: [...groups.values()].map((group) => ({ sourceId: group.sourceId, targetId: group.targetId, value: getMatrixAggregation(group.values, options.aggregation ?? 'reject') })) };
}

/** Stored coordinate zeros are edges; dense array zeros default to absence. */
export function fromMatrixMarket(text: string, options: MatrixMarketImportOptions = {}): Graph {
  const parsed = getParsedMatrixMarket(text, options), view = getMatrixMarketView(parsed, options);
  const graph = getMatrixGraph(view, parsed.sidecar);
  graph.data = createNativeCarrier(graph.data, 'matrix-market', text, graph); return graph;
}

function toRawMatrixMarket(graph: Graph, options: MatrixMarketExportOptions): string {
  const aggregation = options.aggregation ?? 'reject'; const view = getGraphMatrixView(graph, aggregation);
  const storage = options.storage ?? 'coordinate', field = options.field ?? 'real', symmetry = options.symmetry ?? (view.mode === 'undirected' ? 'symmetric' : 'general');
  if (!['coordinate', 'array'].includes(storage) || !['real', 'integer', 'pattern'].includes(field) || !['general', 'symmetric'].includes(symmetry)) throw new Error('Matrix Market: unsupported export profile');
  if (symmetry === 'symmetric' && view.mode !== 'undirected') throw new Error('Matrix Market: symmetric export requires undirected Graph semantics');
  if (storage === 'array' && field === 'pattern') throw new Error('Matrix Market: pattern array is unsupported');
  if (field === 'integer' && view.cells.some((cell) => !Number.isSafeInteger(cell.value))) throw new Error('Matrix Market: integer export requires safe integer weights');
  if (field === 'pattern' && view.cells.some((cell) => cell.value !== 1)) throw new Error('Matrix Market: pattern export requires unit coefficients');
  const sidecar = createMatrixSidecar(graph, 'matrix-market', aggregation);
  if (storage === 'array' && view.cells.some((cell) => cell.value === 0)) sidecar.zeroPresence = view.cells.filter((cell) => cell.value === 0).map((cell) => [cell.sourceId, cell.targetId]);
  const lines = [`%%MatrixMarket matrix ${storage} ${field} ${symmetry}`, `${SIDECAR}${JSON.stringify(sidecar)}`];
  const indices = new Map(view.nodeIds.map((id, index) => [id, index]));
  if (storage === 'coordinate') {
    const records: Array<[number, number, number]> = [];
    for (const cell of view.cells) {
      let row = indices.get(cell.sourceId)!, col = indices.get(cell.targetId)!;
      if (symmetry === 'symmetric' && row < col) [row, col] = [col, row];
      records.push([row, col, cell.value]); if (view.mode === 'undirected' && symmetry === 'general' && row !== col) records.push([col, row, cell.value]);
    }
    lines.push(`${view.nodeIds.length} ${view.nodeIds.length} ${records.length}`);
    for (const [row, col, value] of records) lines.push(`${row + 1} ${col + 1}${field === 'pattern' ? '' : ` ${value}`}`);
  } else {
    getMatrixLimit(view.nodeIds.length, options.maxCells);
    const cells = new Map(view.cells.map((cell) => [getMatrixKey(cell.sourceId, cell.targetId, view.mode), cell.value]));
    lines.push(`${view.nodeIds.length} ${view.nodeIds.length}`);
    for (let col = 0; col < view.nodeIds.length; col++) for (let row = symmetry === 'symmetric' ? col : 0; row < view.nodeIds.length; row++) lines.push(String(cells.get(getMatrixKey(view.nodeIds[row], view.nodeIds[col], view.mode)) ?? 0));
  }
  return `${lines.join('\n')}\n`;
}

/** Sparse coordinate export remains O(N+E); array storage uses bounded column-major coefficients. */
export function toMatrixMarket(graph: Graph, options: MatrixMarketExportOptions = {}): string {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, 'matrix-market');
  const aggregation = options.aggregation ?? (carrier ? getParsedMatrixMarket(carrier.native).sidecar?.baseline.aggregation : undefined);
  return toRawMatrixMarket(carrier ? { ...graph, data: getCarrierData(graph.data, 'matrix-market') } : graph, { ...options, aggregation });
}

export const matrixMarketConverter = createFormatConverter(toMatrixMarket, fromMatrixMarket);
export const matrixMarketDocumentConverter = createGraphDocumentConverter({
  format: 'matrix-market', codec: { from: fromMatrixMarket, to: (graph) => toMatrixMarket(graph, { nativeCarrier: false }) },
  project: (source: string) => ({ graph: getNativeDocumentGraph(fromMatrixMarket(source), 'matrix-market', source) }),
  patch: (context) => {
    const error = getMatrixDocumentChanges(context); if (error) return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', message: error }] };
    const parsed = getParsedMatrixMarket(context.source), view = getMatrixMarketView(parsed);
    if (parsed.sidecar?.baseline.aggregation && parsed.sidecar.baseline.aggregation !== 'reject') return { ok: false, diagnostics: [{ code: 'ambiguous-aggregate-edit', severity: 'error', message: 'Aggregated coefficients cannot be distributed' }] };
    const indices = new Map(view.nodeIds.map((id, index) => [id, index]));
    const edges = new Map(context.graph.edges.map((edge) => [edge.id, edge]));
    const byCell = new Map<string, MatrixMarketRecord[]>();
    for (const record of parsed.records) {
      const key = getMatrixKey(view.nodeIds[record.row], view.nodeIds[record.col], view.mode), records = byCell.get(key) ?? []; records.push(record); byCell.set(key, records);
    }
    const zeroPresence = parsed.sidecar?.zeroPresence ?? [], zeroKeys = new Set(zeroPresence.map(([a, b]) => getMatrixKey(a, b, view.mode))); let sidecarChanged = false;
    for (const change of context.changes) {
      const edge = edges.get(change.id!)!; const row = indices.get(edge.sourceId)!, col = indices.get(edge.targetId)!; const value = edge.weight ?? 1;
      if (!Number.isFinite(value) || (parsed.field === 'integer' && !Number.isSafeInteger(value)) || (parsed.field === 'pattern' && value !== 1)) return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', message: 'Requested coefficient is incompatible with the native field' }] };
      const records = byCell.get(getMatrixKey(edge.sourceId, edge.targetId, view.mode)) ?? [];
      if (!records.length || (parsed.storage === 'coordinate' && records.length > (view.mode === 'undirected' && parsed.symmetry === 'general' && row !== col ? 2 : 1))) return { ok: false, diagnostics: [{ code: 'ambiguous-aggregate-edit', severity: 'error', message: 'Native record correspondence is not unique' }] };
      for (const record of records) {
        if (parsed.field !== 'pattern') parsed.lines[record.line] = parsed.lines[record.line].replace(/\S+(\s*)$/, `${value}$1`);
      }
      if (parsed.storage === 'array' && value === 0) {
        if (!parsed.sidecar || parsed.sidecarLine === undefined) return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', message: 'Dense zero edges require an explicit Graph presence sidecar' }] };
        const key = getMatrixKey(edge.sourceId, edge.targetId, view.mode); if (!zeroKeys.has(key)) { zeroPresence.push([edge.sourceId, edge.targetId]); zeroKeys.add(key); sidecarChanged = true; }
        parsed.sidecar.zeroPresence = zeroPresence;
      }
    }
    if (sidecarChanged) parsed.lines[parsed.sidecarLine!] = `${SIDECAR}${JSON.stringify(parsed.sidecar)}`;
    return { ok: true, source: parsed.lines.map((line, index) => line + parsed.endings[index]).join('') };
  },
});
