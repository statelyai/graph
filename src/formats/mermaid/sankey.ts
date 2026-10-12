import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { getEdgeMode } from '../../mode';
import { createFormatConverter } from '../converter';
import { getCSVTable, toCSVCell } from '../csv/table';
import { generateEdgeId, getMermaidPreamble, type MermaidSourceData } from './shared';
import { getMermaidProfile, getMermaidProfileGraph } from './profile-shared';
export interface SankeyGraphData extends MermaidSourceData { diagramType: 'sankey' }
export type MermaidSankeyGraph = Graph<null, null, SankeyGraphData>;
export interface MermaidSankeyOptions { defaultWeight?: number }
export function fromMermaidSankey(input: string): MermaidSankeyGraph {
  const { lines, source } = getMermaidProfile(input, /^sankey(?:-beta)?$/, 'Sankey');
  const nodes = new Map<string, GraphNode<null>>(); const edges: GraphEdge<null>[] = [];
  if (lines.length > 1) {
    const table = getCSVTable(`source,target,value\n${lines.slice(1).join('\n')}`, ',');
    for (const row of table.rows) {
      const sourceId = row[0].value.trim(); const targetId = row[1].value.trim(); const text = row[2].value.trim();
      if (/[^\x20-\x7e]/.test(sourceId + targetId) || !sourceId || !targetId || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/.test(text) || !Number.isFinite(Number(text)) || Number(text) < 0) throw new Error('Mermaid Sankey: ASCII non-empty names and finite nonnegative weights required');
      for (const id of [sourceId, targetId]) if (!nodes.has(id)) nodes.set(id, { type: 'node', id, label: id, parentId: null, initialNodeId: null, data: null });
      edges.push({ type: 'edge', id: generateEdgeId(sourceId, targetId, edges.length), sourceId, targetId, label: null, mode: 'directed', weight: Number(text), data: null });
    }
  }
  return getMermaidProfileGraph([...nodes.values()], edges, { diagramType: 'sankey' as const, ...(source && { source }) });
}
export function toMermaidSankey(graph: MermaidSankeyGraph, options: MermaidSankeyOptions = {}): string {
  const lines = [...getMermaidPreamble(graph.data ?? {}), 'sankey-beta'];
  const ids = new Set(graph.nodes.map((node) => node.id)); const used = new Set<string>();
  for (const node of graph.nodes) if (!node.id || node.id.trim() !== node.id || node.parentId != null || node.label != null && node.label !== node.id || node.ports?.length) throw new Error('Mermaid Sankey: native names are identities; hierarchy/ports unsupported');
  for (const edge of graph.edges) {
    const weight = edge.weight ?? options.defaultWeight ?? 1;
    if (!ids.has(edge.sourceId) || !ids.has(edge.targetId) || getEdgeMode(graph, edge) !== 'directed' || !Number.isFinite(weight) || weight < 0 || edge.sourcePort || edge.targetPort || edge.label) throw new Error('Mermaid Sankey: unsupported endpoint/mode/weight/port');
    if (/[^\x20-\x7e]/.test(edge.sourceId + edge.targetId)) throw new Error('Mermaid Sankey12.1: native names must be printable ASCII');
    used.add(edge.sourceId); used.add(edge.targetId);
    lines.push([edge.sourceId, edge.targetId, String(weight)].map((text) => toCSVCell(text, ',')).join(','));
  }
  if (used.size !== ids.size) throw new Error('Mermaid Sankey: isolated nodes are unrepresentable');
  return lines.join('\n');
}
export const mermaidSankeyConverter: GraphFormatConverter<string, null, null, SankeyGraphData> = createFormatConverter(toMermaidSankey, fromMermaidSankey);
