import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import { getEdgeMode } from '../../mode';
import { generateEdgeId, getMermaidPreamble, type MermaidSourceData, getMermaidStyle, MERMAID_TO_DIRECTION, DIRECTION_TO_MERMAID } from './shared';
import { getMermaidProfile, getMermaidProfileGraph, getMermaidProfileText, toMermaidProfileText } from './profile-shared';

export type RequirementKind = 'requirement' | 'functionalRequirement' | 'interfaceRequirement' | 'performanceRequirement' | 'physicalRequirement' | 'designConstraint' | 'element';
export interface RequirementNodeData { kind: RequirementKind; requirementId?: string; risk?: 'low' | 'medium' | 'high'; verifyMethod?: 'analysis' | 'inspection' | 'test' | 'demonstration'; elementType?: string; docRef?: string; classes?: string[] }
export interface RequirementEdgeData { relationship: 'contains' | 'copies' | 'derives' | 'satisfies' | 'verifies' | 'refines' | 'traces' }
export interface RequirementGraphData extends MermaidSourceData { diagramType: 'requirement'; classDefs?: Array<{ name: string; style: string }> }
export type MermaidRequirementGraph = Graph<RequirementNodeData, RequirementEdgeData, RequirementGraphData>;
const KINDS = ['requirement', 'functionalRequirement', 'interfaceRequirement', 'performanceRequirement', 'physicalRequirement', 'designConstraint', 'element'];
const RELATIONS = ['contains', 'copies', 'derives', 'satisfies', 'verifies', 'refines', 'traces'];
const NAME = '(?:"[^"\\n]*"|[^\\s{}]+?)';

export function fromMermaidRequirement(input: string): MermaidRequirementGraph {
  const { lines, source } = getMermaidProfile(input, /^requirementDiagram$/, 'Requirement');
  const nodes: GraphNode<RequirementNodeData>[] = []; const edges: GraphEdge<RequirementEdgeData>[] = [];
  const classDefs: NonNullable<RequirementGraphData['classDefs']> = [];
  let current: GraphNode<RequirementNodeData> | undefined; let direction: Graph['direction'];
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    if (current) {
      if (line === '}') { current = undefined; continue; }
      const field = line.match(/^(id|text|risk|verifymethod|type|docref)\s*:\s*(.*)$/);
      if (!field) throw new Error(`Mermaid Requirement: unsupported field ${line}`);
      const value = getMermaidProfileText(field[2]);
      if (!value) throw new Error('Mermaid Requirement: native field strings cannot be empty; omit empty fields');
      if (current.data.kind === 'element' && !['type', 'docref'].includes(field[1]) || current.data.kind !== 'element' && ['type', 'docref'].includes(field[1])) throw new Error('Mermaid Requirement: invalid field for node kind');
      if (field[1] === 'risk' && !['low', 'medium', 'high'].includes(value.toLowerCase())) throw new Error('Mermaid Requirement: unknown risk');
      if (field[1] === 'verifymethod' && !['analysis', 'inspection', 'test', 'demonstration'].includes(value.toLowerCase())) throw new Error('Mermaid Requirement: unknown verification');
      if (field[1] === 'text') current.label = value;
      else Object.assign(current.data, { [{ id: 'requirementId', risk: 'risk', verifymethod: 'verifyMethod', type: 'elementType', docref: 'docRef' }[field[1]]!]: ['risk', 'verifymethod'].includes(field[1]) ? value.toLowerCase() : value });
      continue;
    }
    const declaration = line.match(new RegExp(`^(${KINDS.join('|')})\\s+(${NAME})(?::::([A-Za-z0-9_,]+))?\\s*\\{\\s*$`));
    if (declaration) {
      const id = getMermaidProfileText(declaration[2]);
      current = { type: 'node', id, parentId: null, initialNodeId: null, label: declaration[1] === 'element' ? id : '', data: { kind: declaration[1] as RequirementKind, ...(declaration[3] && { classes: declaration[3].split(',') }) } };
      nodes.push(current); continue;
    }
    const relationship = line.match(new RegExp(`^(${NAME})\\s+(-\\s*(${RELATIONS.join('|')})\\s*->|<-\\s*(${RELATIONS.join('|')})\\s*-)\\s+(${NAME})$`));
    if (relationship) {
      const reverse = !!relationship[4];
      const sourceId = getMermaidProfileText(reverse ? relationship[5] : relationship[1]); const targetId = getMermaidProfileText(reverse ? relationship[1] : relationship[5]);
      const kind = (relationship[3] ?? relationship[4]) as RequirementEdgeData['relationship'];
      edges.push({ type: 'edge', id: generateEdgeId(sourceId, targetId, edges.length), sourceId, targetId, label: kind, mode: 'directed', data: { relationship: kind } }); continue;
    }
    const definition = line.match(/^classDef\s+([A-Za-z0-9_,]+)\s+(.+)$/);
    if (definition) { for (const name of definition[1].split(',')) classDefs.push({ name, style: definition[2] }); continue; }
    const decoration = line.match(/^(style|class)\s+([A-Za-z0-9_,]+)\s+(.+)$/);
    if (decoration) {
      for (const id of decoration[2].split(',')) {
        const node = nodes.find((node) => node.id === getMermaidProfileText(id));
        if (!node) throw new Error('Mermaid Requirement: missing style target');
        if (decoration[1] === 'style') node.style = getMermaidStyle(decoration[3]); else node.data.classes = decoration[3].split(',');
      }
      continue;
    }
    const dir = line.match(/^direction\s+(TB|BT|LR|RL)$/);
    if (dir) { direction = MERMAID_TO_DIRECTION[dir[1]]; continue; }
    throw new Error(`Mermaid Requirement: unsupported statement ${line}`);
  }
  if (current) throw new Error('Mermaid Requirement: unclosed definition');
  return { ...getMermaidProfileGraph(nodes, edges, { diagramType: 'requirement' as const, ...(source && { source }), ...(classDefs.length && { classDefs }) }), ...(direction && { direction }) };
}
export function toMermaidRequirement(graph: MermaidRequirementGraph): string {
  const lines = [...getMermaidPreamble(graph.data ?? {}), 'requirementDiagram'];
  if (graph.direction) lines.push(`    direction ${DIRECTION_TO_MERMAID[graph.direction]}`);
  for (const node of graph.nodes) {
    const kind = node.data?.kind ?? 'requirement';
    if (!node.id || !KINDS.includes(kind) || node.parentId != null || node.ports?.length) throw new Error('Mermaid Requirement: invalid kind/hierarchy');
    lines.push(`    ${kind} "${toMermaidProfileText(node.id)}"${node.data?.classes?.length ? `:::${node.data.classes.join(',')}` : ''} {`);
    if (kind === 'element') {
      if (node.label != null && node.label !== node.id) throw new Error('Mermaid Requirement: element display name is its identity');
      if (node.data?.elementType !== undefined) lines.push(`        type: "${toMermaidProfileText(node.data.elementType)}"`);
      if (node.data?.docRef !== undefined) lines.push(`        docref: "${toMermaidProfileText(node.data.docRef)}"`);
    } else {
      if (node.data?.requirementId !== undefined) lines.push(`        id: "${toMermaidProfileText(node.data.requirementId)}"`);
      if (node.label) lines.push(`        text: "${toMermaidProfileText(node.label)}"`);
      if (node.data?.risk !== undefined) lines.push(`        risk: ${node.data.risk}`);
      if (node.data?.verifyMethod !== undefined) lines.push(`        verifymethod: ${node.data.verifyMethod}`);
    }
    lines.push('    }');
  }
  for (const edge of graph.edges) {
    if (getEdgeMode(graph, edge) !== 'directed' || !RELATIONS.includes(edge.data?.relationship) || edge.sourcePort || edge.targetPort || edge.label != null && edge.label !== edge.data.relationship) throw new Error('Mermaid Requirement: unsupported relation/mode');
    lines.push(`    "${toMermaidProfileText(edge.sourceId)}" - ${edge.data.relationship} -> "${toMermaidProfileText(edge.targetId)}"`);
  }
  for (const definition of graph.data?.classDefs ?? []) lines.push(`    classDef ${definition.name} ${definition.style}`);
  for (const node of graph.nodes) if (node.style) lines.push(`    style ${node.id} ${Object.entries(node.style).map(([key, value]) => `${key}:${value}`).join(',')}`);
  const result = lines.join('\n'); fromMermaidRequirement(result); return result;
}
export const mermaidRequirementConverter: GraphFormatConverter<string, RequirementNodeData, RequirementEdgeData, RequirementGraphData> = createFormatConverter(toMermaidRequirement, fromMermaidRequirement);
