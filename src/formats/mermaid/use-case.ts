import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { getEdgeMode } from '../../mode';
import { createFormatConverter } from '../converter';
import { escapeMermaidId, unescapeMermaidId, generateEdgeId, getMermaidPreamble, getMermaidIdDisplay, getMermaidProperties, toMermaidProperties, getMermaidStyle, type MermaidSourceData, MERMAID_TO_DIRECTION, DIRECTION_TO_MERMAID } from './shared';
import { getMermaidProfile, getMermaidProfileGraph, getMermaidProfileText, toMermaidProfileText, getMermaidProfileJSON } from './profile-shared';
export interface UseCaseNodeData { kind: 'actor' | 'usecase' | 'boundary' | 'note' | 'json'; shape?: 'ellipse' | 'rect'; properties?: Record<string, string | number | boolean>; stereotype?: string; classes?: string[]; noteTarget?: string; value?: Record<string, any> }
export interface UseCaseEdgeData { relationship: 'association' | 'include' | 'extend' | 'generalization' | 'note'; operator?: string; minlen?: number; explicitId?: boolean; properties?: Record<string, string | number | boolean>; classes?: string[] }
export interface UseCaseGraphData extends MermaidSourceData { diagramType: 'usecase'; classDefs?: Array<{ name: string; style: string }> }
export type MermaidUseCaseGraph = Graph<UseCaseNodeData, UseCaseEdgeData, UseCaseGraphData>;
const ID = '[A-Za-z0-9_]+';
function getUseCaseProperties(text: string): Record<string, string | number | boolean> {
  const properties = getMermaidProperties(text);
  if (Object.keys(properties).some((key) => !['type', 'icon', 'business', 'animate', 'animation'].includes(key))) throw new Error('Mermaid UseCase: unsupported metadata');
  if (properties.business !== undefined && typeof properties.business !== 'boolean' || properties.animate !== undefined && typeof properties.animate !== 'boolean') throw new Error('Mermaid UseCase: metadata requires booleans');
  return properties;
}
export function fromMermaidUseCase(input: string): MermaidUseCaseGraph {
  const { lines, source } = getMermaidProfile(input, /^usecase-beta$/, 'UseCase');
  const nodes = new Map<string, GraphNode<UseCaseNodeData>>(); const edges: GraphEdge<UseCaseEdgeData>[] = []; const classDefs: NonNullable<UseCaseGraphData['classDefs']> = [];
  let boundary: string | null = null; let direction: Graph['direction']; let noteCounter = 0; let relationCounter = 0;
  const nativeIds = new Map<string, string>();
  function getId(raw: string): string { const id = unescapeMermaidId(raw); if (nativeIds.has(id) && nativeIds.get(id) !== raw) throw new Error('Mermaid UseCase: ambiguous encoded native ID'); nativeIds.set(id, raw); return id; }
  const reservedIds = new Set(lines.flatMap((line) => { const match = line.trim().match(/^(?:actor\s+|systemBoundary\s+|json\s+)?([A-Za-z0-9_]+)/); return match ? [unescapeMermaidId(match[1])] : []; }));
  function getNode(id: string) {
    if (!nodes.has(id)) nodes.set(id, { type: 'node', id, label: getMermaidIdDisplay(id), parentId: null, initialNodeId: null, data: { kind: 'usecase', shape: 'ellipse' } });
    return nodes.get(id)!;
  }
  for (let index = 1; index < lines.length; index++) {
    const line = lines[index].trim();
    if (line === 'end') { if (boundary === null) throw new Error('Mermaid UseCase: unmatched end'); boundary = null; continue; }
    const dir = line.match(/^direction\s+(TB|TD|BT|LR|RL)$/);
    if (dir) { if (boundary !== null) throw new Error('Mermaid UseCase: direction inside boundary'); direction = MERMAID_TO_DIRECTION[dir[1]]; continue; }
    const note = line.match(new RegExp(`^note\\s+for\\s+(${ID})\\s+("[^"\\n]*")$`));
    if (note) {
      if (boundary !== null) throw new Error('Mermaid UseCase: note inside boundary');
      const target = getId(note[1]); let id = `__note_${noteCounter++}`; while (reservedIds.has(id) || nodes.has(id)) id = `__note_${noteCounter++}`;
      nodes.set(id, { type: 'node', id, label: getMermaidProfileText(note[2]), parentId: null, initialNodeId: null, data: { kind: 'note', noteTarget: target } });
      edges.push({ type: 'edge', id: `note:${JSON.stringify([id, target])}`, sourceId: id, targetId: target, label: null, mode: 'undirected', data: { relationship: 'note' } }); continue;
    }
    const json = line.match(new RegExp(`^json\\s+(${ID})@\\{([\\s\\S]*)$`));
    if (json) {
      if (boundary !== null) throw new Error('Mermaid UseCase: JSON node inside boundary');
      let body = `{${json[2]}`;
      while (!body.trim().endsWith('}') && index + 1 < lines.length) body += `\n${lines[++index]}`;
      let value: any; try { value = JSON.parse(body); } catch { throw new Error('Mermaid UseCase: invalid JSON object'); }
      if (!value || Array.isArray(value) || typeof value !== 'object') throw new Error('Mermaid UseCase: JSON node requires object');
      const id = getId(json[1]); if (nodes.has(id)) throw new Error('Mermaid UseCase: duplicate JSON ID');
      nodes.set(id, { type: 'node', id, label: getMermaidIdDisplay(id), parentId: null, initialNodeId: null, data: { kind: 'json', value } }); continue;
    }
    const include = line.match(new RegExp(`^(${ID})\\s+(?:(${ID})@)?(\\.\\.>|--\\|>)\\s*(?::\\s*(include|extend)\\s+)?(${ID})$`));
    const association = line.match(new RegExp(`^(${ID})\\s+(?:(${ID})@)?(--+>|<--+|--+|--o|o--|--x|x--)(?:\\s+(${ID})|\\s+(.+?)\\s+(--+>|<--+|--+|--o|o--|--x|x--|--\\|>)\\s+(${ID}))$`));
    if (include || association) {
      if (boundary !== null) throw new Error('Mermaid UseCase: relationship inside boundary');
      const match = (include ?? association)!;
      const rawOperator = include ? match[3] : association![6] ?? match[3];
      const relationship: UseCaseEdgeData['relationship'] = include ? match[3] === '--|>' ? 'generalization' : match[4] as 'include' | 'extend' : 'association';
      if (include && !relationship) throw new Error('Mermaid UseCase: dotted relation requires include/extend');
      const left = getId(match[1]); const right = getId(include ? match[5] : association![7] ?? association![4]);
      const reverse = rawOperator.startsWith('<') || rawOperator.startsWith('o') || rawOperator.startsWith('x');
      const sourceId = reverse ? right : left; const targetId = reverse ? left : right;
      getNode(sourceId); getNode(targetId);
      const mode = /^--+$/.test(rawOperator) ? 'undirected' : 'directed';
      const id = match[2] ? getId(match[2]) : generateEdgeId(sourceId, targetId, relationCounter++);
      if (edges.some((edge) => edge.id === id) || nodes.has(id)) throw new Error('Mermaid UseCase: duplicate relationship ID');
      edges.push({ type: 'edge', id, sourceId, targetId, label: association?.[5] ? getMermaidProfileText(association[5]) : null, mode,
        data: { relationship, operator: rawOperator, ...(relationship === 'association' && !/[ox]/.test(rawOperator) && { minlen: rawOperator.replace(/[<>]/g, '').length - 1 }), ...(match[2] && { explicitId: true }) } }); continue;
    }
    const classDef = line.match(/^classDef\s+([A-Za-z0-9_,]+)\s+(.+)$/);
    if (classDef) { if (boundary !== null) throw new Error('Mermaid UseCase: style inside boundary'); for (const name of classDef[1].split(',')) classDefs.push({ name, style: classDef[2] }); continue; }
    const decoration = line.match(/^(class|style)\s+([A-Za-z0-9_,]+)\s+(.+)$/);
    if (decoration) {
      if (boundary !== null) throw new Error('Mermaid UseCase: style inside boundary');
      for (const rawId of decoration[2].split(',')) {
        const id = getId(rawId); const entity = nodes.get(id) ?? edges.find((edge) => edge.id === id);
        if (!entity) throw new Error('Mermaid UseCase: unknown style target');
        if (decoration[1] === 'class') entity.data.classes = decoration[3].split(','); else entity.style = getMermaidStyle(decoration[3]);
      }
      continue;
    }
    const metadata = line.match(new RegExp(`^(${ID})@\\{(.*)\\}$`));
    if (metadata) {
      if (boundary !== null) throw new Error('Mermaid UseCase: metadata inside boundary');
      const id = getId(metadata[1]); const entity = nodes.get(id) ?? edges.find((edge) => edge.id === id);
      if (!entity) throw new Error('Mermaid UseCase: unknown metadata target');
      entity.data.properties = { ...entity.data.properties, ...getUseCaseProperties(metadata[2]) }; continue;
    }
    const declaration = line.match(new RegExp(`^(actor\\s+|systemBoundary\\s+)?(${ID})(?:\\(("[^"\\n]*"|[^()]*)\\)|\\[("[^"\\n]*"|[^\\[\\]]*)\\])?(?:@\\{(.*?)\\})?(?:\\s*<<([^<>]*)>>)?(?::::([A-Za-z0-9_,]+))?$`));
    if (!declaration) throw new Error(`Mermaid UseCase: unsupported statement ${line}`);
    const kind = declaration[1]?.startsWith('actor') ? 'actor' : declaration[1] ? 'boundary' : 'usecase';
    const id = getId(declaration[2]);
    if (edges.some((edge) => edge.data.explicitId && edge.id === id)) throw new Error('Mermaid UseCase: node conflicts with explicit edge ID');
    const node = getNode(id);
    if (kind === 'boundary' && boundary !== null || node.data.kind !== 'usecase' && node.data.kind !== kind) throw new Error('Mermaid UseCase: incompatible kind/nested boundary');
    if (node.parentId != null && node.parentId !== boundary) throw new Error('Mermaid UseCase: element has multiple boundaries');
    node.label = declaration[3] !== undefined || declaration[4] !== undefined ? getMermaidProfileText(declaration[3] ?? declaration[4]) : getMermaidIdDisplay(id);
    node.parentId = kind === 'boundary' ? null : boundary;
    node.data = { kind, ...(kind === 'usecase' && { shape: declaration[4] !== undefined ? 'rect' : 'ellipse' }), ...(declaration[5] && { properties: getUseCaseProperties(declaration[5]) }), ...(declaration[6] && { stereotype: declaration[6] }), ...(declaration[7] && { classes: declaration[7].split(',') }) };
    if (kind === 'boundary') boundary = id;
  }
  if (boundary !== null) throw new Error('Mermaid UseCase: unclosed boundary');
  const graph = getMermaidProfileGraph([...nodes.values()].sort((a, b) => Number(a.data.kind === 'note') - Number(b.data.kind === 'note')), [...edges].sort((a, b) => Number(a.data.relationship === 'note') - Number(b.data.relationship === 'note')), { diagramType: 'usecase' as const, ...(source && { source }), ...(classDefs.length && { classDefs }) });
  for (const edge of edges) {
    const a = nodes.get(edge.sourceId)!.data.kind; const b = nodes.get(edge.targetId)!.data.kind;
    if (edge.data.relationship === 'include' || edge.data.relationship === 'extend') { if (a !== 'usecase' || b !== 'usecase') throw new Error('Mermaid UseCase: include/extend require use cases'); }
    if (edge.data.relationship === 'generalization' && (a !== b || !['actor', 'usecase'].includes(a))) throw new Error('Mermaid UseCase: generalization requires matching kinds');
    if (edge.data.relationship === 'note' && !['actor', 'usecase'].includes(b)) throw new Error('Mermaid UseCase: invalid note target');
    if (a === 'boundary' || b === 'boundary') throw new Error('Mermaid UseCase: boundary cannot be relationship endpoint');
  }
  return { ...graph, ...(direction && { direction }) };
}
export function toMermaidUseCase(graph: MermaidUseCaseGraph): string {
  const lines = [...getMermaidPreamble(graph.data ?? {}), 'usecase-beta'];
  if (graph.direction) lines.push(`direction ${DIRECTION_TO_MERMAID[graph.direction]}`);
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]));
  function toDeclaration(node: GraphNode<UseCaseNodeData>): string {
    const kind = node.data?.kind ?? 'usecase'; const id = escapeMermaidId(node.id); const text = `"${toMermaidProfileText(node.label ?? getMermaidIdDisplay(node.id))}"`;
    if (kind === 'json') {
      if (node.label != null && node.label !== node.id || !node.data.value || typeof node.data.value !== 'object' || Array.isArray(node.data.value)) throw new Error('Mermaid UseCase: invalid JSON node value');
      return `json ${id}@${getMermaidProfileJSON(node.data.value)}`;
    }
    const suffix = `${node.data?.properties ? `@{ ${toMermaidProperties(node.data.properties)} }` : ''}${node.data?.stereotype ? ` <<${toMermaidProfileText(node.data.stereotype)}>>` : ''}${node.data?.classes?.length ? `:::${node.data.classes.join(',')}` : ''}`;
    return `${kind === 'actor' ? 'actor ' : kind === 'boundary' ? 'systemBoundary ' : ''}${id}${kind === 'boundary' || node.data?.shape === 'rect' ? `[${text}]` : `(${text})`}${suffix}`;
  }
  const emitted = new Set<string>();
  for (const node of graph.nodes) if (node.ports?.length) throw new Error('Mermaid UseCase: ports unsupported');
  const noteEdges = new Map<string, typeof graph.edges>();
  for (const edge of graph.edges) if (edge.data?.relationship === 'note') { const entries = noteEdges.get(edge.sourceId) ?? []; entries.push(edge); noteEdges.set(edge.sourceId, entries); }
  for (const node of graph.nodes.filter((node) => node.parentId == null)) {
    const kind = node.data?.kind ?? 'usecase';
    if (kind === 'note') continue;
    lines.push(toDeclaration(node)); emitted.add(node.id);
    if (kind === 'boundary') {
      for (const child of graph.nodes.filter((child) => child.parentId === node.id)) { if (!['actor', 'usecase'].includes(child.data?.kind ?? 'usecase')) throw new Error('Mermaid UseCase: boundary only contains actors/usecases'); lines.push(`  ${toDeclaration(child)}`); emitted.add(child.id); }
      lines.push('end');
    }
  }
  for (const node of graph.nodes) {
    if (node.data?.kind === 'note') {
      if (!node.data.noteTarget || !nodes.has(node.data.noteTarget) || noteEdges.get(node.id)?.length !== 1) throw new Error('Mermaid UseCase: stale note target');
      lines.push(`note for ${escapeMermaidId(node.data.noteTarget)} "${toMermaidProfileText(node.label ?? '')}"`); emitted.add(node.id);
    }
  }
  if (emitted.size !== graph.nodes.length) throw new Error('Mermaid UseCase: missing/cyclic/nested boundary');
  for (const edge of graph.edges) {
    if (edge.data?.relationship === 'note') { if (nodes.get(edge.sourceId)?.data.noteTarget !== edge.targetId || getEdgeMode(graph, edge) !== 'undirected') throw new Error('Mermaid UseCase: inconsistent note edge'); continue; }
    if (edge.sourcePort || edge.targetPort) throw new Error('Mermaid UseCase: ports unsupported');
    const mode = getEdgeMode(graph, edge); const relation = edge.data?.relationship ?? 'association';
    if (mode === 'bidirectional' || relation !== 'association' && mode !== 'directed') throw new Error('Mermaid UseCase: incompatible relationship mode');
    const id = edge.data?.explicitId ? `${escapeMermaidId(edge.id)}@` : '';
    const source = escapeMermaidId(edge.sourceId); const target = escapeMermaidId(edge.targetId);
    if (relation === 'include' || relation === 'extend') lines.push(`${source} ${id}..> : ${relation} ${target}`);
    else if (relation === 'generalization') lines.push(`${source} ${id}--|> ${target}`);
    else {
      const original = edge.data?.operator ?? '-->'; const reverse = /^[<ox]/.test(original); const marker = /[ox]/.test(original) ? original.includes('o') ? 'o' : 'x' : '';
      const minlen = edge.data?.minlen ?? 1;
      if (!Number.isSafeInteger(minlen) || minlen < 1 || minlen > 10000) throw new Error('Mermaid UseCase: invalid bounded edge length');
      const dashes = '-'.repeat(minlen + 1);
      const operator = mode === 'undirected' ? dashes : marker ? `${dashes}${marker}` : `${dashes}>`;
      const left = reverse && mode === 'directed' ? target : source; const right = reverse && mode === 'directed' ? source : target;
      const arrow = reverse && mode === 'directed' ? marker ? `${marker}${dashes}` : `<${dashes}` : operator;
      lines.push(`${left} ${id}${edge.label != null ? `-- "${toMermaidProfileText(edge.label)}" ${arrow}` : arrow} ${right}`);
    }
    if (edge.data?.properties) { if (!id) throw new Error('Mermaid UseCase: edge metadata requires explicit ID'); lines.push(`${escapeMermaidId(edge.id)}@{ ${toMermaidProperties(edge.data.properties)} }`); }
  }
  for (const definition of graph.data?.classDefs ?? []) lines.push(`classDef ${definition.name} ${definition.style}`);
  for (const entity of [...graph.nodes, ...graph.edges]) {
    if (entity.data?.classes?.length && entity.type === 'edge') lines.push(`class ${escapeMermaidId(entity.id)} ${entity.data.classes.join(',')}`);
    if (entity.style) lines.push(`style ${escapeMermaidId(entity.id)} ${Object.entries(entity.style).map(([key, value]) => `${key}:${value}`).join(',')}`);
  }
  const result = lines.join('\n'); fromMermaidUseCase(result); return result;
}
export const mermaidUseCaseConverter: GraphFormatConverter<string, UseCaseNodeData, UseCaseEdgeData, UseCaseGraphData> = createFormatConverter(toMermaidUseCase, fromMermaidUseCase);
