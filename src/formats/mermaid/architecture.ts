import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { getEdgeMode } from '../../mode';
import { createFormatConverter } from '../converter';
import { escapeMermaidId, unescapeMermaidId, generateEdgeId, getMermaidPreamble, type MermaidSourceData } from './shared';
import { getMermaidProfile, getMermaidProfileGraph, getMermaidProfileOrderedNodes, getMermaidProfileText, toMermaidProfileText } from './profile-shared';

export interface ArchitectureNodeData { kind: 'group' | 'service' | 'junction'; icon?: string }
export interface ArchitectureEdgeData { arrow?: '--' | '-->' | '<--' | '<-->'; sourceGroup?: boolean; targetGroup?: boolean }
export interface ArchitectureGraphData extends MermaidSourceData { diagramType: 'architecture'; align?: Array<{ direction: 'row' | 'column'; members: string[] }> }
export type MermaidArchitectureGraph = Graph<ArchitectureNodeData, ArchitectureEdgeData, ArchitectureGraphData>;
const SIDES = ['L', 'R', 'T', 'B'];

export function fromMermaidArchitecture(input: string): MermaidArchitectureGraph {
  const { lines, source } = getMermaidProfile(input, /^architecture-beta$/, 'Architecture');
  const nodes: GraphNode<ArchitectureNodeData>[] = []; const edges: GraphEdge<ArchitectureEdgeData>[] = [];
  const align: NonNullable<ArchitectureGraphData['align']> = [];
  for (const text of lines.slice(1)) {
    const line = text.trim();
    const node = line.match(/^(group|service|junction)\s+([A-Za-z0-9_]+)(?:\(([^)]*)\))?(?:\[([^\]]*)\])?(?:\s+in\s+([A-Za-z0-9_]+))?$/);
    if (node) {
      if (node[4] === '') throw new Error('Mermaid Architecture: native empty labels are unsupported');
      const kind = node[1] as ArchitectureNodeData['kind'];
      if (kind === 'junction' && (node[3] !== undefined || node[4] !== undefined)) throw new Error('Mermaid Architecture: junctions cannot have icons/labels');
      nodes.push({ type: 'node', id: unescapeMermaidId(node[2]), parentId: node[5] ? unescapeMermaidId(node[5]) : null, initialNodeId: null,
        label: node[4] === undefined ? null : getMermaidProfileText(node[4]), data: { kind, ...(node[3] !== undefined && { icon: node[3] }) },
        ...(kind !== 'group' && { ports: SIDES.map((name) => ({ name, direction: 'inout' as const, data: null })) }) });
      continue;
    }
    const edge = line.match(/^([A-Za-z0-9_]+)(\{group\})?:([LRTB])\s+(<)?--(>)?\s+([LRTB]):([A-Za-z0-9_]+)(\{group\})?$/);
    if (edge) {
      const reverse = !!edge[4] && !edge[5];
      const sourceId = unescapeMermaidId(reverse ? edge[7] : edge[1]); const targetId = unescapeMermaidId(reverse ? edge[1] : edge[7]);
      const arrow = `${edge[4] ?? ''}--${edge[5] ?? ''}` as ArchitectureEdgeData['arrow'];
      edges.push({ type: 'edge', id: generateEdgeId(sourceId, targetId, edges.length), sourceId, targetId,
        sourcePort: reverse ? edge[6] : edge[3], targetPort: reverse ? edge[3] : edge[6], label: null,
        mode: edge[4] && edge[5] ? 'bidirectional' : edge[4] || edge[5] ? 'directed' : 'undirected',
        data: { arrow, ...(edge[2] && { [reverse ? 'targetGroup' : 'sourceGroup']: true }), ...(edge[8] && { [reverse ? 'sourceGroup' : 'targetGroup']: true }) } });
      continue;
    }
    const alignment = line.match(/^align\s+(row|column)\s+([A-Za-z0-9_ ]+)$/);
    if (alignment) { align.push({ direction: alignment[1] as 'row' | 'column', members: alignment[2].trim().split(/\s+/).map(unescapeMermaidId) }); continue; }
    throw new Error(`Mermaid Architecture: unsupported statement ${line}`);
  }
  const graph = getMermaidProfileGraph(nodes, edges, { diagramType: 'architecture' as const, ...(source && { source }), ...(align.length && { align }) });
  const byId = new Map(nodes.map((node) => [node.id, node]));
  getMermaidProfileOrderedNodes(nodes);
  for (const node of nodes) if (node.parentId != null && byId.get(node.parentId)?.data.kind !== 'group') throw new Error('Mermaid Architecture: parent must be a group');
  for (const edge of edges) if ([edge.sourceId, edge.targetId].some((id) => byId.get(id)?.data.kind === 'group')) throw new Error('Mermaid Architecture: edges require services/junctions');
  for (const item of align) if (item.members.some((id) => !byId.has(id))) throw new Error('Mermaid Architecture: missing alignment member');
  return graph;
}

export function toMermaidArchitecture(graph: MermaidArchitectureGraph): string {
  const lines = [...getMermaidPreamble(graph.data ?? {}), 'architecture-beta'];
  for (const node of getMermaidProfileOrderedNodes(graph.nodes)) {
    const kind = node.data?.kind ?? 'service';
    if (node.label === '') throw new Error('Mermaid Architecture: native empty labels are unsupported');
    if (!['group', 'service', 'junction'].includes(kind)) throw new Error('Mermaid Architecture: invalid node kind');
    if (node.data?.icon && !/^[A-Za-z0-9_:-]+$/.test(node.data.icon)) throw new Error('Mermaid Architecture: invalid icon');
    if (kind === 'junction' && (node.label != null || node.data?.icon)) throw new Error('Mermaid Architecture: junction labels/icons unsupported');
    lines.push(`    ${kind} ${escapeMermaidId(node.id)}${node.data?.icon ? `(${node.data.icon})` : ''}${node.label != null ? `[${toMermaidProfileText(node.label)}]` : ''}${node.parentId != null ? ` in ${escapeMermaidId(node.parentId)}` : ''}`);
  }
  for (const edge of graph.edges) {
    if (edge.label) throw new Error('Mermaid Architecture: native edges have no labels');
    const mode = getEdgeMode(graph, edge); const reverse = mode === 'directed' && edge.data?.arrow === '<--';
    const left = reverse ? edge.targetId : edge.sourceId; const right = reverse ? edge.sourceId : edge.targetId;
    const leftSide = (reverse ? edge.targetPort : edge.sourcePort) ?? 'R'; const rightSide = (reverse ? edge.sourcePort : edge.targetPort) ?? 'L';
    if (!SIDES.includes(leftSide) || !SIDES.includes(rightSide)) throw new Error('Mermaid Architecture: ports must be L/R/T/B sides');
    const arrow = mode === 'undirected' ? '--' : mode === 'bidirectional' ? '<-->' : reverse ? '<--' : '-->';
    lines.push(`    ${escapeMermaidId(left)}${(reverse ? edge.data?.targetGroup : edge.data?.sourceGroup) ? '{group}' : ''}:${leftSide} ${arrow} ${rightSide}:${escapeMermaidId(right)}${(reverse ? edge.data?.sourceGroup : edge.data?.targetGroup) ? '{group}' : ''}`);
  }
  for (const item of graph.data?.align ?? []) lines.push(`    align ${item.direction} ${item.members.map(escapeMermaidId).join(' ')}`);
  const result = lines.join('\n'); fromMermaidArchitecture(result); return result;
}
export const mermaidArchitectureConverter: GraphFormatConverter<string, ArchitectureNodeData, ArchitectureEdgeData, ArchitectureGraphData> = createFormatConverter(toMermaidArchitecture, fromMermaidArchitecture);
