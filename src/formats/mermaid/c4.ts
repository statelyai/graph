import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { getEdgeMode } from '../../mode';
import { createFormatConverter } from '../converter';
import { escapeMermaidId, unescapeMermaidId, generateEdgeId, getMermaidPreamble, getMermaidIdDisplay, getMermaidDisplayText, type MermaidSourceData } from './shared';
import { getMermaidProfile, getMermaidProfileArguments, getMermaidProfileGraph, getMermaidProfileOrderedNodes, getMermaidProfileText, toMermaidProfileText } from './profile-shared';
export type C4DiagramType = 'C4Context' | 'C4Container' | 'C4Component' | 'C4Dynamic' | 'C4Deployment';
export interface C4NodeData { kind: string; description?: string; technology?: string; extraArguments?: string[]; namedArguments?: Array<{ name: string; value: string }> }
export interface C4EdgeData { kind: string; technology?: string; extraArguments?: string[]; namedArguments?: Array<{ name: string; value: string }>; index?: string }
export interface C4GraphData extends MermaidSourceData { diagramType: C4DiagramType; title?: string }
export type MermaidC4Graph = Graph<C4NodeData, C4EdgeData, C4GraphData>;
const NODE_KINDS = new Set(['Person', 'Person_Ext', 'System', 'System_Ext', 'SystemDb', 'SystemDb_Ext', 'SystemQueue', 'SystemQueue_Ext', 'Container', 'Container_Ext', 'ContainerDb', 'ContainerDb_Ext', 'ContainerQueue', 'ContainerQueue_Ext', 'Component', 'Component_Ext', 'ComponentDb', 'ComponentDb_Ext', 'ComponentQueue', 'ComponentQueue_Ext', 'Boundary', 'Enterprise_Boundary', 'System_Boundary', 'Container_Boundary', 'Deployment_Node', 'Node']);
const EDGE_KINDS = new Set(['Rel', 'BiRel', 'Rel_Back', 'Rel_U', 'Rel_Up', 'Rel_D', 'Rel_Down', 'Rel_L', 'Rel_Left', 'Rel_R', 'Rel_Right', 'RelIndex']);
function getC4Technology(kind: string): boolean { return /^(?:Container|Component|Deployment_Node|Node)/.test(kind) && !kind.endsWith('_Boundary'); }
function getC4Arguments(values: string[]) {
  const positional: string[] = []; const named: Array<{ name: string; value: string }> = [];
  for (const value of values) {
    const pair = value.match(/^(\$[A-Za-z_][\w]*)\s*=\s*(.*)$/);
    if (pair) named.push({ name: pair[1], value: getMermaidProfileText(pair[2]) });
    else if (named.length) throw new Error('Mermaid C4: positional argument after named argument');
    else positional.push(getMermaidProfileText(value));
  }
  return { positional, named };
}
function toC4Arguments(values: string[], named: C4NodeData['namedArguments']): string {
  const quoted = values.map((value) => `"${toMermaidProfileText(value)}"`);
  for (const item of named ?? []) {
    if (!/^\$[A-Za-z_]\w*$/.test(item.name)) throw new Error('Mermaid C4: invalid named argument');
    quoted.push(`${item.name}="${toMermaidProfileText(item.value)}"`);
  }
  return quoted.join(', ');
}
export function fromMermaidC4(input: string): MermaidC4Graph {
  const { lines, source } = getMermaidProfile(input, /^C4(?:Context|Container|Component|Dynamic|Deployment)$/, 'C4');
  const nodes: GraphNode<C4NodeData>[] = []; const edges: GraphEdge<C4EdgeData>[] = []; const stack: string[] = [];
  let title: string | undefined; const relationPairs = new Set<string>();
  for (const text of lines.slice(1)) {
    const line = text.trim();
    if (line === '}') { if (!stack.length) throw new Error('Mermaid C4: unmatched closing boundary'); stack.pop(); continue; }
    if (line.startsWith('title ')) { title = getMermaidDisplayText(line.slice(6)); continue; }
    const macro = line.match(/^([A-Za-z_]+)\((.*)\)\s*(\{)?$/);
    if (!macro) throw new Error(`Mermaid C4: unsupported statement ${line}`);
    const kind = macro[1]; const { positional: args, named } = getC4Arguments(getMermaidProfileArguments(macro[2]));
    if (NODE_KINDS.has(kind)) {
      if (args.length < 2 || !args[0]) throw new Error('Mermaid C4: node requires alias and label');
      const id = unescapeMermaidId(args[0]); const tech = getC4Technology(kind);
      const description = args[tech ? 3 : 2]; const extraArguments = args.slice(tech ? 4 : 3);
      nodes.push({ type: 'node', id, label: args[1], parentId: stack.at(-1) ?? null, initialNodeId: null, data: { kind,
        ...(tech && args[2] !== undefined && { technology: args[2] }), ...(description !== undefined && { description }),
        ...(extraArguments.length && { extraArguments }), ...(named.length && { namedArguments: named }) } });
      if (macro[3]) { if (!kind.endsWith('_Boundary') && !['Boundary', 'Deployment_Node', 'Node'].includes(kind)) throw new Error('Mermaid C4: this node kind cannot contain children'); stack.push(id); }
    } else if (EDGE_KINDS.has(kind)) {
      if (macro[3]) throw new Error('Mermaid C4: relationship cannot contain children');
      const index = kind === 'RelIndex' ? args.shift() : undefined;
      if (args.length < 3) throw new Error('Mermaid C4: relation requires aliases and label');
      const pair = JSON.stringify(args.slice(0, 2));
      if (relationPairs.has(pair)) throw new Error('Mermaid C4: repeated native relationship pair unsupported');
      relationPairs.add(pair);
      const sourceId = unescapeMermaidId(args[kind === 'Rel_Back' ? 1 : 0]); const targetId = unescapeMermaidId(args[kind === 'Rel_Back' ? 0 : 1]);
      edges.push({ type: 'edge', id: generateEdgeId(sourceId, targetId, edges.length), sourceId, targetId, label: args[2], mode: kind === 'BiRel' ? 'bidirectional' : 'directed', data: { kind,
        ...(args[3] !== undefined && { technology: args[3] }), ...(args.length > 4 && { extraArguments: args.slice(4) }), ...(named.length && { namedArguments: named }), ...(index !== undefined && { index }) } });
    } else throw new Error(`Mermaid C4: unsupported macro ${kind}`);
  }
  if (stack.length) throw new Error('Mermaid C4: unclosed boundary');
  const graph = getMermaidProfileGraph(nodes, edges, { diagramType: lines[0].trim() as C4DiagramType, ...(source && { source }), ...(title !== undefined && { title }) });
  getMermaidProfileOrderedNodes(nodes); return graph;
}
export function toMermaidC4(graph: MermaidC4Graph): string {
  const header = graph.data?.diagramType ?? 'C4Context';
  if (!/^C4(?:Context|Container|Component|Dynamic|Deployment)$/.test(header)) throw new Error('Mermaid C4: invalid diagram type');
  const lines = [...getMermaidPreamble(graph.data ?? {}), header];
  if (graph.data?.title !== undefined) { if (/[\r\n]/.test(graph.data.title)) throw new Error('Mermaid C4: multiline title unsupported'); lines.push(`title ${getMermaidDisplayText(graph.data.title)}`); }
  const ordered = getMermaidProfileOrderedNodes(graph.nodes); const children = new Set(graph.nodes.flatMap((node) => node.parentId == null ? [] : [node.parentId]));
  const stack: string[] = [];
  for (const node of ordered) {
    while (stack.length && stack.at(-1) !== (node.parentId ?? null)) { lines.push('    }'); stack.pop(); }
    const kind = node.data?.kind ?? 'System';
    if (!NODE_KINDS.has(kind) || node.ports?.length) throw new Error('Mermaid C4: invalid node kind');
    const tech = getC4Technology(kind); const fields = [node.label ?? getMermaidIdDisplay(node.id)];
    if (tech && (node.data?.technology !== undefined || node.data?.description !== undefined || node.data?.extraArguments?.length)) fields.push(node.data?.technology ?? '');
    if (node.data?.description !== undefined || node.data?.extraArguments?.length) fields.push(node.data?.description ?? '');
    fields.push(...(node.data?.extraArguments ?? []));
    const suffix = children.has(node.id) || kind.endsWith('_Boundary') || kind === 'Boundary' ? ' {' : '';
    lines.push(`    ${kind}(${escapeMermaidId(node.id)}, ${toC4Arguments(fields, node.data?.namedArguments)})${suffix}`);
    if (suffix) stack.push(node.id);
  }
  while (stack.length) { stack.pop(); lines.push('    }'); }
  for (const edge of graph.edges) {
    const mode = getEdgeMode(graph, edge); const authored = edge.data?.kind ?? 'Rel';
    if (mode === 'undirected' || edge.sourcePort || edge.targetPort) throw new Error('Mermaid C4: undirected relationship unsupported');
    const kind = mode === 'bidirectional' ? 'BiRel' : authored === 'BiRel' ? 'Rel' : authored;
    if (!EDGE_KINDS.has(kind)) throw new Error('Mermaid C4: invalid relationship');
    const fields = [edge.label ?? ''];
    if (edge.data?.technology !== undefined || edge.data?.extraArguments?.length) fields.push(edge.data?.technology ?? '');
    fields.push(...(edge.data?.extraArguments ?? []));
    const index = kind === 'RelIndex' ? `${toC4Arguments([edge.data?.index ?? '1'], undefined)}, ` : '';
    lines.push(`    ${kind}(${index}${escapeMermaidId(kind === 'Rel_Back' ? edge.targetId : edge.sourceId)}, ${escapeMermaidId(kind === 'Rel_Back' ? edge.sourceId : edge.targetId)}, ${toC4Arguments(fields, edge.data?.namedArguments)})`);
  }
  const result = lines.join('\n'); fromMermaidC4(result); return result;
}
export const mermaidC4Converter: GraphFormatConverter<string, C4NodeData, C4EdgeData, C4GraphData> = createFormatConverter(toMermaidC4, fromMermaidC4);
