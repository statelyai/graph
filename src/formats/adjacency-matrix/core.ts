import type { Graph } from '../../types';
import { getClonedJSON, isJSONEqual } from '../preservation';
import { getUniformMode, getValidatedGraph, isNativeMetadataRecord } from '../structured-json';

export type MatrixAggregation = 'reject' | 'sum' | 'min' | 'max' | 'count';
export interface MatrixCell { sourceId: string; targetId: string; value: number }
export interface MatrixSidecar {
  kind: '@statelyai/graph/matrix'; version: 1; format: string;
  nodeIds: string[]; mode: 'directed' | 'undirected'; graph: Graph;
  baseline: { nodeIds: string[]; mode: 'directed' | 'undirected'; cells: MatrixCell[]; aggregation: MatrixAggregation };
  zeroPresence?: Array<[string, string]>;
}
export interface MatrixView { nodeIds: string[]; mode: 'directed' | 'undirected'; cells: MatrixCell[] }

export function getMatrixKey(sourceId: string, targetId: string, mode: MatrixView['mode']): string {
  return JSON.stringify(mode === 'undirected' ? [sourceId, targetId].sort() : [sourceId, targetId]);
}
export function getMatrixLimit(size: number, maxCells = 1_000_000): void {
  if (!Number.isSafeInteger(maxCells) || maxCells < 0 || !Number.isSafeInteger(size) || size < 0 || size > Math.sqrt(maxCells)) throw new Error('Matrix: maxCells exceeded or invalid limit');
}
export function getValidatedNodeIds(nodeIds: string[]): void {
  if (!Array.isArray(nodeIds) || nodeIds.some((id) => typeof id !== 'string') || new Set(nodeIds).size !== nodeIds.length) throw new Error('Matrix: nodeIds must be unique strings');
}
export function getMatrixAggregation(values: number[], aggregation: MatrixAggregation): number {
  if (values.length > 1 && aggregation === 'reject') throw new Error('Matrix: parallel edges/duplicate entries require explicit aggregation');
  const value = aggregation === 'count' ? values.length : aggregation === 'min' ? values.reduce((minimum, weight) => Math.min(minimum, weight), Infinity) : aggregation === 'max' ? values.reduce((maximum, weight) => Math.max(maximum, weight), -Infinity) : values.reduce((sum, weight) => sum + weight, 0);
  if (!Number.isFinite(value)) throw new Error('Matrix: aggregated coefficients must remain finite');
  return value;
}
export function getGraphMatrixView(graph: Graph, aggregation: MatrixAggregation = 'reject'): MatrixView {
  if (!['reject', 'sum', 'min', 'max', 'count'].includes(aggregation)) throw new Error('Matrix: unsupported aggregation');
  getValidatedGraph(graph, 'Matrix');
  const mode = getUniformMode(graph, 'Matrix');
  if (!['directed', 'undirected'].includes(mode)) throw new Error('Matrix: invalid graph mode');
  const groups = new Map<string, { sourceId: string; targetId: string; weights: number[] }>();
  for (const edge of graph.edges) {
    if (edge.weight !== undefined && (typeof edge.weight !== 'number' || !Number.isFinite(edge.weight))) throw new Error('Matrix: weights must be finite numbers');
    const key = getMatrixKey(edge.sourceId, edge.targetId, mode);
    const group = groups.get(key) ?? { sourceId: edge.sourceId, targetId: edge.targetId, weights: [] };
    group.weights.push(edge.weight ?? 1); groups.set(key, group);
  }
  return { nodeIds: graph.nodes.map((node) => node.id), mode, cells: [...groups.values()].map((group) => ({ sourceId: group.sourceId, targetId: group.targetId, value: getMatrixAggregation(group.weights, aggregation) })) };
}
export function createMatrixSidecar(graph: Graph, format: string, aggregation: MatrixAggregation = 'reject'): MatrixSidecar {
  const view = getGraphMatrixView(graph, aggregation);
  return { kind: '@statelyai/graph/matrix', version: 1, format, nodeIds: view.nodeIds, mode: view.mode, graph: getClonedJSON(graph), baseline: { ...getClonedJSON(view), aggregation } };
}
export function getMatrixSidecar(value: any, format: string): MatrixSidecar | undefined {
  if (value?.kind !== '@statelyai/graph/matrix' || value.version !== 1 || value.format !== format || !Array.isArray(value.graph?.nodes) || !Array.isArray(value.graph?.edges) || !Array.isArray(value.baseline?.cells) || !Array.isArray(value.nodeIds) || !['directed', 'undirected'].includes(value.mode) || !isNativeMetadataRecord(value.graph, 'graph') || !value.graph.nodes.every((node: any) => isNativeMetadataRecord(node, 'node')) || !value.graph.edges.every((edge: any) => isNativeMetadataRecord(edge, 'edge'))) return undefined;
  try { getValidatedGraph(value.graph, 'Matrix sidecar'); getValidatedNodeIds(value.nodeIds); getValidatedNodeIds(value.baseline.nodeIds); }
  catch { return undefined; }
  if (!['directed', 'undirected'].includes(value.baseline.mode) || !['reject', 'sum', 'min', 'max', 'count'].includes(value.baseline.aggregation) || value.baseline.cells.some((cell: any) => !cell || typeof cell.sourceId !== 'string' || typeof cell.targetId !== 'string' || typeof cell.value !== 'number' || !Number.isFinite(cell.value))) return undefined;
  const nodeIds = new Set(value.nodeIds);
  if (value.zeroPresence !== undefined && (!Array.isArray(value.zeroPresence) || value.zeroPresence.some((pair: any) => !Array.isArray(pair) || pair.length !== 2 || pair.some((id: any) => typeof id !== 'string' || !nodeIds.has(id))))) return undefined;
  return value;
}
export function getMatrixSourceSidecar(source: Record<string, any>, format: string): { key: string; sidecar: MatrixSidecar } | undefined {
  const keys = Object.keys(source).filter((key) => key === '__statelyai' || (/^__statelyai__\d+$/.test(key) && Number.isSafeInteger(Number(key.slice('__statelyai__'.length)))));
  keys.sort((a, b) => Number(b.slice('__statelyai__'.length) || 0) - Number(a.slice('__statelyai__'.length) || 0));
  for (const key of keys) { const sidecar = getMatrixSidecar(source[key], format); if (sidecar) return { key, sidecar }; }
  return undefined;
}
/** Live coefficients and row IDs determine topology; snapshots supply untouched fields only. */
export function getMatrixGraph(view: MatrixView, sidecar?: MatrixSidecar, data: any = null): Graph {
  getValidatedNodeIds(view.nodeIds);
  const ids = new Set(view.nodeIds);
  const cells = new Map(view.cells.map((cell) => [getMatrixKey(cell.sourceId, cell.targetId, view.mode), cell]));
  if (cells.size !== view.cells.length || view.cells.some((cell) => !ids.has(cell.sourceId) || !ids.has(cell.targetId) || !Number.isFinite(cell.value))) throw new Error('Matrix: invalid or duplicate cells');
  const original = sidecar?.graph;
  const rootMode = sidecar && view.mode !== sidecar.baseline.mode ? view.mode : original?.mode ?? view.mode;
  const oldNodes = new Map(original?.nodes.map((node) => [node.id, node]));
  const groups = new Map<string, Graph['edges']>();
  for (const edge of original?.edges ?? []) {
    const key = getMatrixKey(edge.sourceId, edge.targetId, view.mode);
    const group = groups.get(key) ?? []; group.push(edge); groups.set(key, group);
  }
  const baseline = new Map(sidecar?.baseline.cells.map((cell) => [getMatrixKey(cell.sourceId, cell.targetId, view.mode), cell.value]));
  if (sidecar?.baseline.aggregation === 'count' && (view.mode !== sidecar.baseline.mode || cells.size !== baseline.size || [...cells].some(([key, cell]) => cell.value !== baseline.get(key)))) throw new Error('Matrix: edited count aggregate is ambiguous; cardinality does not determine individual edge weights/IDs');
  for (const [key, group] of groups) if (group.length > 1 && (!cells.has(key) || cells.get(key)!.value !== baseline.get(key) || view.mode !== sidecar!.baseline.mode)) throw new Error('Matrix: edited/removed aggregate is ambiguous; individual edge weights cannot be inferred');
  const edges: Graph['edges'] = [];
  const used = new Set<string>();
  for (const edge of original?.edges ?? []) {
    const key = getMatrixKey(edge.sourceId, edge.targetId, view.mode); const cell = cells.get(key);
    if (!cell || !ids.has(edge.sourceId) || !ids.has(edge.targetId)) continue;
    if (groups.get(key)!.length > 1 && (cell.value !== baseline.get(key) || view.mode !== sidecar!.baseline.mode)) throw new Error('Matrix: edited aggregate is ambiguous; individual edge weights cannot be inferred');
    const restored = getClonedJSON(edge);
    if (cell.value !== baseline.get(key)) restored.weight = cell.value;
    if (view.mode !== sidecar!.baseline.mode) delete restored.mode;
    edges.push(restored); used.add(key);
  }
  const edgeIds = new Set(edges.map((edge) => edge.id));
  for (const [key, cell] of cells) if (!used.has(key)) {
    let id = `matrix:${key}`, suffix = 0;
    while (edgeIds.has(id)) id = `matrix:${key}__${++suffix}`;
    edgeIds.add(id); edges.push({ type: 'edge', id, sourceId: cell.sourceId, targetId: cell.targetId, label: null, data: null, weight: cell.value, ...(rootMode !== view.mode && { mode: view.mode }) });
  }
  const { nodes: _nodes, edges: _edges, ...root } = original ?? { id: '', mode: view.mode, initialNodeId: null, data };
  const graph: Graph = { ...getClonedJSON(root), ...(sidecar && view.mode !== sidecar.baseline.mode && { mode: view.mode }), nodes: view.nodeIds.map((id) => getClonedJSON(oldNodes.get(id) ?? { type: 'node', id, label: null, data: null })), edges };
  getValidatedGraph(graph, 'Matrix'); return graph;
}

export function getMatrixDocumentChanges(context: any): string | undefined {
  for (const change of context.changes) if (change.entity !== 'edge' || change.field !== 'weight') return `Unsupported matrix edit ${change.path}; only existing edge weights have native coefficients`;
  if (context.sourceGraph.edges.length !== context.graph.edges.length || !isJSONEqual(context.sourceGraph.nodes.map((node: any) => node.id), context.graph.nodes.map((node: any) => node.id))) return 'Matrix structural edits require explicit regeneration';
  return undefined;
}
