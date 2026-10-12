import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { getEdgeMode } from '../../mode';
import { createFormatConverter } from '../converter';
import { generateEdgeId, getMermaidPreamble, getMermaidDisplayText, type MermaidSourceData, DIRECTION_TO_MERMAID, MERMAID_TO_DIRECTION } from './shared';
import { getMermaidProfile, getMermaidProfileGraph, getMermaidProfileText, toMermaidProfileText } from './profile-shared';
export interface GitGraphNodeData { kind: 'commit' | 'merge' | 'cherry-pick'; branch: string; commitType: 'NORMAL' | 'REVERSE' | 'HIGHLIGHT'; tags?: string[] }
export interface GitGraphEdgeData { kind: 'parent' }
export type GitGraphAction = { kind: 'branch'; name: string; order?: number } | { kind: 'checkout'; name: string } | { kind: 'commit'; nodeId: string } | { kind: 'merge'; branch: string; nodeId: string } | { kind: 'cherry-pick'; target: string; parent?: string; nodeId: string };
export interface GitGraphData extends MermaidSourceData { diagramType: 'gitGraph'; actions: GitGraphAction[]; mainBranch?: string }
export type MermaidGitGraph = Graph<GitGraphNodeData, GitGraphEdgeData, GitGraphData>;
function getGitGraphIdentity(value: string): string {
  const text = value.trim(); return getMermaidDisplayText(text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text);
}
function toGitGraphIdentity(value: string): string {
  getMermaidDisplayText(value);
  if (typeof value !== 'string' || !value || /["\x00-\x1f\x7f]/.test(value)) throw new Error('Mermaid GitGraph: identity is outside the native quoted-token profile');
  return `"${value}"`;
}
function getGitGraphAttributes(text: string) {
  const values: Record<string, string[]> = {};
  const expression = /\s*(id|type|tag|parent)\s*:\s*("[^"\n]*"|[A-Za-z0-9_]+)\s*/gy;
  let index = 0;
  while (index < text.length) {
    expression.lastIndex = index; const match = expression.exec(text);
    if (!match) throw new Error(`Mermaid GitGraph: unsupported attributes ${text.slice(index)}`);
    const key = match[1]; const list = values[key] ?? []; list.push(key === 'tag' ? getMermaidProfileText(match[2]) : getGitGraphIdentity(match[2])); values[key] = list; index = expression.lastIndex;
  }
  for (const key of ['id', 'type', 'parent']) if (values[key]?.length > 1) throw new Error(`Mermaid GitGraph: duplicate ${key}`);
  return values;
}
export function fromMermaidGitGraph(input: string): MermaidGitGraph {
  const { lines, source, directives } = getMermaidProfile(input, /^gitGraph(?:\s+(?:LR|TB|BT))?\s*:?$/, 'GitGraph');
  const yamlBranch = source?.frontmatter?.match(/mainBranchName:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/);
  const mainBranch = directives.init?.gitGraph?.mainBranchName ?? yamlBranch?.slice(1).find((value) => value !== undefined) ?? 'main';
  if (typeof mainBranch !== 'string' || !mainBranch) throw new Error('Mermaid GitGraph: invalid main branch');
  getMermaidDisplayText(mainBranch);
  const branches = new Map<string, string | null>([[mainBranch, null]]); let branch = mainBranch;
  const nodes: GraphNode<GitGraphNodeData>[] = []; const edges: GraphEdge<GitGraphEdgeData>[] = []; const actions: GitGraphAction[] = []; const byId = new Map<string, GraphNode<GitGraphNodeData>>();
  for (const raw of lines.slice(1)) {
    const line = raw.trim();
    const operation = line.match(/^(branch|checkout|switch)\s+("[^"\n]*"|[^\s]+)(?:\s+order:\s*(-?\d+))?$/);
    if (operation) {
      const name = getGitGraphIdentity(operation[2]);
      if (operation[1] === 'branch') {
        if (branches.has(name)) throw new Error(`Mermaid GitGraph: duplicate branch ${name}`);
        branches.set(name, branches.get(branch)!); branch = name; actions.push({ kind: 'branch', name, ...(operation[3] !== undefined && { order: Number(operation[3]) }) });
      } else {
        if (!branches.has(name) || operation[3] !== undefined) throw new Error('Mermaid GitGraph: invalid checkout');
        branch = name; actions.push({ kind: 'checkout', name });
      }
      continue;
    }
    const commit = line.match(/^(commit|merge|cherry-pick)(?:\s+(.*))?$/);
    if (!commit) throw new Error(`Mermaid GitGraph: unsupported statement ${line}`);
    const kind = commit[1] as GitGraphNodeData['kind']; let tail = commit[2] ?? ''; let mergeBranch: string | undefined;
    if (kind === 'merge') {
      const target = tail.match(/^("[^"\n]*"|[^\s]+)(?:\s+(.*))?$/);
      if (!target) throw new Error('Mermaid GitGraph: merge branch required');
      mergeBranch = getGitGraphIdentity(target[1]); tail = target[2] ?? '';
      if (mergeBranch === branch || !branches.has(mergeBranch) || branches.get(mergeBranch) == null || branches.get(branch) == null || branches.get(mergeBranch) === branches.get(branch)) throw new Error('Mermaid GitGraph: invalid merge');
    }
    const attributes = getGitGraphAttributes(tail); const commitType = attributes.type?.[0] ?? 'NORMAL';
    if (!['NORMAL', 'REVERSE', 'HIGHLIGHT'].includes(commitType)) throw new Error('Mermaid GitGraph: invalid commit type');
    if (kind !== 'cherry-pick' && attributes.parent) throw new Error('Mermaid GitGraph: parent is only valid for cherry-pick');
    const target = kind === 'cherry-pick' ? attributes.id?.[0] : undefined;
    if (kind === 'cherry-pick') {
      const node = target ? byId.get(target) : undefined;
      if (!node || node.data.branch === branch || !branches.get(branch) || attributes.type) throw new Error('Mermaid GitGraph: invalid cherry-pick target/current branch');
      const parents = edges.filter((edge) => edge.sourceId === target).map((edge) => edge.targetId);
      if (node.data.kind === 'merge' && !attributes.parent?.[0] || attributes.parent && !parents.includes(attributes.parent[0])) throw new Error('Mermaid GitGraph: merge cherry-pick requires an immediate parent');
    }
    let id = kind !== 'cherry-pick' && attributes.id ? attributes.id[0] : `git_${nodes.length}`;
    if (kind === 'cherry-pick' || !attributes.id) { let suffix = 1; while (byId.has(id)) id = `git_${nodes.length}_${suffix++}`; }
    if (!id || byId.has(id)) throw new Error(`Mermaid GitGraph: duplicate/empty commit ID ${id}`);
    const node: GraphNode<GitGraphNodeData> = { type: 'node', id, label: id, parentId: null, initialNodeId: null, data: { kind, branch, commitType: commitType as GitGraphNodeData['commitType'], ...(attributes.tag?.length && { tags: attributes.tag }) } };
    const parents = [branches.get(branch), ...(mergeBranch ? [branches.get(mergeBranch)] : target ? [target] : [])].filter((value): value is string => value != null);
    for (const parent of parents) edges.push({ type: 'edge', id: generateEdgeId(id, parent, edges.length), sourceId: id, targetId: parent, label: null, mode: 'directed', data: { kind: 'parent' } });
    nodes.push(node); byId.set(id, node); branches.set(branch, id);
    actions.push(kind === 'commit' ? { kind, nodeId: id } : kind === 'merge' ? { kind, nodeId: id, branch: mergeBranch! } : { kind, nodeId: id, target: target!, ...(attributes.parent && { parent: attributes.parent[0] }) });
  }
  const direction = lines[0].match(/\b(LR|TB|BT)\b/)?.[1];
  return { ...getMermaidProfileGraph(nodes, edges, { diagramType: 'gitGraph' as const, actions, ...(mainBranch !== 'main' && { mainBranch }), ...(source && { source }) }), ...(direction && { direction: MERMAID_TO_DIRECTION[direction] }) };
}
export function toMermaidGitGraph(graph: MermaidGitGraph): string {
  if (!Array.isArray(graph.data?.actions)) throw new Error('Mermaid GitGraph: ordered actions required; arbitrary DAGs are not native histories');
  const mainBranch = graph.data.mainBranch ?? 'main';
  if (typeof mainBranch !== 'string' || !mainBranch) throw new Error('Mermaid GitGraph: invalid main branch');
  getMermaidDisplayText(mainBranch);
  if (graph.direction === 'left') throw new Error('Mermaid GitGraph: RL direction unsupported');
  const init = graph.data.source?.directives?.init ?? {};
  const override = mainBranch !== 'main' || init.gitGraph?.mainBranchName !== undefined || graph.data.source?.frontmatter?.includes('mainBranchName:');
  const data = override ? { ...graph.data, source: { ...graph.data.source, directives: { ...graph.data.source?.directives, init: { ...init, gitGraph: { ...init.gitGraph, mainBranchName: mainBranch } } } } } : graph.data;
  const lines = [...getMermaidPreamble(data), `gitGraph${graph.direction ? ` ${graph.direction === 'down' ? 'TB' : DIRECTION_TO_MERMAID[graph.direction]}` : ''}`];
  const oldMainBranch = graph.data.source?.directives?.init?.gitGraph?.mainBranchName ?? graph.data.source?.frontmatter?.match(/mainBranchName:\s*(?:"([^"]+)"|'([^']+)'|([^\s#]+))/)?.slice(1).find((value) => value !== undefined) ?? 'main';
  const declaredBranches = new Set<string>();
  const nodes = new Map(graph.nodes.map((node) => [node.id, node])); const consumed = new Set<string>();
  for (const action of graph.data.actions) {
    if (action.kind === 'branch' || action.kind === 'checkout') {
      if (action.kind === 'branch' && action.order !== undefined && !Number.isSafeInteger(action.order)) throw new Error('Mermaid GitGraph: invalid branch order');
      const name = action.kind === 'checkout' && action.name === oldMainBranch && !declaredBranches.has(action.name) ? mainBranch : action.name;
      if (action.kind === 'branch') declaredBranches.add(action.name);
      lines.push(`    ${action.kind} ${toGitGraphIdentity(name)}${action.kind === 'branch' && action.order !== undefined ? ` order: ${action.order}` : ''}`); continue;
    }
    const node = nodes.get(action.nodeId);
    if (!node || consumed.has(node.id) || node.label != null && node.label !== node.id || node.parentId != null) throw new Error('Mermaid GitGraph: stale action reference or unsupported commit label/hierarchy');
    consumed.add(node.id);
    const type = node.data?.commitType ?? 'NORMAL';
    let command = action.kind === 'merge' ? `merge ${toGitGraphIdentity(action.branch)}` : action.kind;
    command += action.kind === 'cherry-pick' ? ` id: ${toGitGraphIdentity(action.target)}${action.parent !== undefined ? ` parent: ${toGitGraphIdentity(action.parent)}` : ''}` : ` id: ${toGitGraphIdentity(node.id)}`;
    if (action.kind !== 'cherry-pick' && type !== 'NORMAL') command += ` type: ${type}`;
    for (const tag of node.data?.tags ?? []) command += ` tag: "${toMermaidProfileText(tag)}"`;
    lines.push(`    ${command}`);
  }
  if (consumed.size !== graph.nodes.length || graph.edges.some((edge) => getEdgeMode(graph, edge) !== 'directed')) throw new Error('Mermaid GitGraph: history does not cover live commits/modes');
  const result = lines.join('\n'); const parsed = fromMermaidGitGraph(result);
  const expected = new Set(graph.edges.map((edge) => JSON.stringify([edge.sourceId, edge.targetId]))); const actual = new Set(parsed.edges.map((edge) => JSON.stringify([edge.sourceId, edge.targetId])));
  if (expected.size !== graph.edges.length || expected.size !== actual.size || [...expected].some((key) => !actual.has(key)) || parsed.nodes.some((node) => (nodes.get(node.id)?.data?.branch !== node.data.branch && !(mainBranch !== oldMainBranch && node.data.branch === mainBranch && nodes.get(node.id)?.data?.branch === oldMainBranch)) || nodes.get(node.id)?.data?.kind !== node.data.kind)) throw new Error('Mermaid GitGraph: live DAG/branch edits conflict with ordered actions');
  return result;
}
export const mermaidGitGraphConverter: GraphFormatConverter<string, GitGraphNodeData, GitGraphEdgeData, GitGraphData> = createFormatConverter(toMermaidGitGraph, fromMermaidGitGraph);
