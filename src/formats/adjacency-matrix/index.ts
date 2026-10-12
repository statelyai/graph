import type { Graph } from '../../types';
import { createFormatConverter } from '../converter';
import { createGraphDocumentConverter } from '../document';
import { createNativeCarrier, getCarrierData, getNativeCarrier, getClonedJSON, getNativeDocumentGraph, isJSONEqual, type FormatExportOptions, type FormatImportOptions } from '../preservation';
import { createMatrixSidecar, getMatrixSourceSidecar, getMatrixGraph, getGraphMatrixView, getMatrixLimit, getValidatedNodeIds, getMatrixDocumentChanges, type MatrixAggregation, type MatrixSidecar, type MatrixView } from './core';

export type { MatrixAggregation } from './core';
export interface AdjacencyMatrixJSON {
  nodeIds: string[];
  matrix: number[][];
  mode: 'directed' | 'undirected';
  presence?: boolean[][];
  __statelyai?: MatrixSidecar | any;
  [field: string]: any;
}
export interface AdjacencyMatrixExportOptions extends FormatExportOptions { aggregation?: MatrixAggregation; maxCells?: number }
export interface AdjacencyMatrixImportOptions extends FormatImportOptions { maxCells?: number }

function getMatrixView(source: AdjacencyMatrixJSON, maxCells?: number): MatrixView {
  if (!source || !Array.isArray(source.matrix) || !['directed', 'undirected'].includes(source.mode)) throw new Error('Adjacency matrix: expected square matrix and mode');
  getValidatedNodeIds(source.nodeIds); const size = source.nodeIds.length; getMatrixLimit(size, maxCells);
  if (source.matrix.length !== size || source.matrix.some((row) => !Array.isArray(row) || row.length !== size || row.some((value) => typeof value !== 'number' || !Number.isFinite(value)))) throw new Error('Adjacency matrix: dimensions/finite coefficients disagree with nodeIds');
  if (source.presence !== undefined && (!Array.isArray(source.presence) || source.presence.length !== size || source.presence.some((row) => !Array.isArray(row) || row.length !== size || row.some((value) => typeof value !== 'boolean')))) throw new Error('Adjacency matrix: invalid presence mask');
  const cells: MatrixView['cells'] = [];
  for (let row = 0; row < size; row++) for (let col = 0; col < size; col++) {
    const present = source.presence?.[row][col] ?? source.matrix[row][col] !== 0;
    if (!present && source.matrix[row][col] !== 0) throw new Error('Adjacency matrix: presence mask hides a nonzero coefficient');
    if (source.mode === 'undirected' && (source.matrix[row][col] !== source.matrix[col][row] || present !== (source.presence?.[col][row] ?? source.matrix[col][row] !== 0))) throw new Error('Adjacency matrix: undirected coefficients/presence must be symmetric');
    if (present && (source.mode === 'directed' || row <= col)) cells.push({ sourceId: source.nodeIds[row], targetId: source.nodeIds[col], value: source.matrix[row][col] });
  }
  return { nodeIds: source.nodeIds, mode: source.mode, cells };
}

/** Square finite coefficients; zero means absence unless an explicit presence mask marks it. */
export function fromAdjacencyMatrix(source: AdjacencyMatrixJSON, options: AdjacencyMatrixImportOptions = {}): Graph {
  const metadata = options.metadata === 'native' ? undefined : getMatrixSourceSidecar(source, 'adjacency-matrix');
  const extras = Object.fromEntries(Object.entries(source).filter(([key]) => !['nodeIds', 'matrix', 'mode', 'presence', metadata?.key].includes(key)));
  const graph = getMatrixGraph(getMatrixView(source, options.maxCells), metadata?.sidecar, Object.keys(extras).length ? getClonedJSON(extras) : null);
  graph.data = createNativeCarrier(graph.data, 'adjacency-matrix', source, graph); return graph;
}

/** Dense allocation is bounded by maxCells (default 1,000,000); parallel aggregation is opt-in. */
export function toAdjacencyMatrix(graph: Graph, options: AdjacencyMatrixExportOptions = {}): AdjacencyMatrixJSON {
  getMatrixLimit(graph.nodes.length, options.maxCells);
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, 'adjacency-matrix');
  const current = carrier ? { ...graph, data: getCarrierData(graph.data, 'adjacency-matrix') } : graph;
  const candidate = carrier ? getMatrixSourceSidecar(carrier.native, 'adjacency-matrix') : undefined;
  const prior = candidate && !isJSONEqual(carrier!.baseline.data?.[candidate.key], carrier!.native[candidate.key]) ? candidate : undefined;
  const aggregation = options.aggregation ?? prior?.sidecar.baseline.aggregation ?? 'reject';
  const view = getGraphMatrixView(current, aggregation), size = view.nodeIds.length;
  const source: AdjacencyMatrixJSON = carrier ? getClonedJSON(carrier.native) : {} as AdjacencyMatrixJSON;
  source.nodeIds = view.nodeIds; source.mode = view.mode; source.matrix = Array.from({ length: size }, () => Array<number>(size).fill(0));
  const presence = Array.from({ length: size }, () => Array<boolean>(size).fill(false)); const indices = new Map(view.nodeIds.map((id, index) => [id, index]));
  for (const cell of view.cells) {
    const row = indices.get(cell.sourceId)!, col = indices.get(cell.targetId)!;
    source.matrix[row][col] = cell.value; presence[row][col] = true;
    if (view.mode === 'undirected') { source.matrix[col][row] = cell.value; presence[col][row] = true; }
  }
  if (view.cells.some((cell) => cell.value === 0) || (carrier && Object.hasOwn(carrier.native, 'presence'))) source.presence = presence; else delete source.presence;
  let key = prior?.key ?? '__statelyai';
  if (!prior && Object.hasOwn(source, key)) { let suffix = 1; while (Object.hasOwn(source, `__statelyai__${suffix}`)) suffix++; key = `__statelyai__${suffix}`; }
  source[key] = createMatrixSidecar(current, 'adjacency-matrix', aggregation); return source;
}

export const adjacencyMatrixConverter = createFormatConverter(toAdjacencyMatrix, fromAdjacencyMatrix);
export const adjacencyMatrixDocumentConverter = createGraphDocumentConverter({
  format: 'adjacency-matrix', codec: { from: fromAdjacencyMatrix, to: (graph) => toAdjacencyMatrix(graph, { nativeCarrier: false }) },
  project: (source: AdjacencyMatrixJSON) => ({ graph: getNativeDocumentGraph(fromAdjacencyMatrix(source), 'adjacency-matrix', source) }),
  patch: (context) => {
    const error = getMatrixDocumentChanges(context);
    if (error) return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', message: error }] };
    const sidecar = getMatrixSourceSidecar(context.source, 'adjacency-matrix')?.sidecar;
    if (sidecar?.baseline.aggregation !== undefined && sidecar.baseline.aggregation !== 'reject') return { ok: false, diagnostics: [{ code: 'ambiguous-aggregate-edit', severity: 'error', message: 'Aggregated coefficients cannot be distributed among original edges' }] };
    const source = getClonedJSON(context.source); const indices = new Map(source.nodeIds.map((id, index) => [id, index]));
    const edges = new Map(context.graph.edges.map((edge) => [edge.id, edge]));
    for (const change of context.changes) {
      const edge = edges.get(change.id!)!; const row = indices.get(edge.sourceId)!, col = indices.get(edge.targetId)!; const weight = edge.weight ?? 1;
      source.matrix[row][col] = weight; if (source.mode === 'undirected') source.matrix[col][row] = weight;
      if (weight === 0 && !source.presence) { source.presence = context.source.matrix.map((row) => row.map((value) => value !== 0)); }
      if (source.presence) { source.presence[row][col] = true; if (source.mode === 'undirected') source.presence[col][row] = true; }
    }
    return { ok: true, source };
  },
});
