import type { Graph } from '../../types';
import { createFormatConverter } from '../converter';
import { createGraphDocumentConverter, type GraphDocumentPatchContext, type GraphDocumentPatchResult } from '../document';
import { createNativeCarrier, getNativeCarrier, getCarrierData, getNativeDocumentGraph, getClonedJSON, isJSONEqual, getEditedData, type FormatImportOptions, type FormatExportOptions } from '../preservation';
import { getValidatedGraph, isNativeMetadataRecord } from '../structured-json';

export type PlantUMLDialect = 'component' | 'class';
export interface PlantUMLImportOptions extends FormatImportOptions { dialect?: PlantUMLDialect }
export interface PlantUMLExportOptions extends FormatExportOptions { dialect?: PlantUMLDialect }
interface PlantUMLSidecar { kind: '@statelyai/graph/plantuml'; version: 1; dialect: PlantUMLDialect; graph: Graph; baseline: Graph; aliases: Array<{ alias: string; id: string }> }
interface PlantUMLNodeSource { alias: string; node: Graph['nodes'][number]; line: number; token: string; tokenStart: number; hasAlias: boolean; members: number[] }
interface PlantUMLEdgeSource { edge: Graph['edges'][number]; line: number; labelStart?: number }
interface PlantUMLSource { lines: string[]; endings: string[]; graph: Graph; nodes: PlantUMLNodeSource[]; edges: PlantUMLEdgeSource[]; sidecar?: PlantUMLSidecar; sidecarLine?: number; dialect: PlantUMLDialect }
const SIDECAR = "' @statelyai/graph/plantuml ";
const ARROWS = ['-->', '<--', '--', '<-->', '..>', '<..', '..', '--|>', '<|--', '*--', 'o--', '--*', '--o'];

function getVisibleLine(line: string): string {
  let quoted = false, escaped = false;
  for (let index = 0; index < line.length; index++) {
    const char = line[index]; if (escaped) { escaped = false; continue; }
    if (char === '\\' && quoted) { escaped = true; continue; } if (char === '"') quoted = !quoted;
    if (char === "'" && !quoted) return line.slice(0, index);
  }
  return line;
}
function getLabel(token: string, quoted = token.startsWith('"') && token.endsWith('"')): string {
  const body = quoted ? token.slice(1, -1) : token; let decoded = '';
  for (let index = 0; index < body.length; index++) {
    if (body[index] !== '\\' || index + 1 === body.length) { decoded += body[index]; continue; }
    const next = body[++index]; decoded += next === 'n' ? '\n' : next === '\\' ? '\\' : `\\${next}`;
  }
  return decoded.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, (entity) => {
    const named: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'" };
    if (named[entity]) return named[entity]; const number = entity.startsWith('&#x') ? Number.parseInt(entity.slice(3, -1), 16) : Number(entity.slice(2, -1));
    return Number.isInteger(number) && number >= 0 && number <= 0x10ffff ? String.fromCodePoint(number) : entity;
  });
}
function getEncodedLabel(label: string): string {
  if (/[\u0000-\u0009\u000b-\u001f\u007f]|[\ud800-\udfff]/u.test(label)) throw new Error('PlantUML: C0/control/non-scalar display labels are outside this profile');
  return JSON.stringify(label.replace(/[&<>"\\*~_^{}\[\]#=]/g, (character) => `&#${character.codePointAt(0)};`));
}
function getArrowMode(arrow: string): { mode: Graph['mode']; reverse: boolean } {
  const left = arrow.startsWith('<'), right = arrow.endsWith('>');
  return { mode: left && right ? 'bidirectional' : left || right ? 'directed' : 'undirected', reverse: left && !right };
}
function isPlantUMLSidecar(value: any): value is PlantUMLSidecar {
  if (value?.kind !== '@statelyai/graph/plantuml' || value.version !== 1 || !['component', 'class'].includes(value.dialect) || !Array.isArray(value.aliases)) return false;
  return [value.graph, value.baseline].every((graph) => graph && Array.isArray(graph.nodes) && Array.isArray(graph.edges) && isNativeMetadataRecord(graph, 'graph') && graph.nodes.every((node: any) => isNativeMetadataRecord(node, 'node')) && graph.edges.every((edge: any) => isNativeMetadataRecord(edge, 'edge'))) && value.aliases.every((item: any) => item && typeof item.alias === 'string' && typeof item.id === 'string');
}
function getParsedPlantUML(text: string, options: PlantUMLImportOptions = {}): PlantUMLSource {
  if (typeof text !== 'string') throw new Error('PlantUML: expected text');
  const lines: string[] = [], endings: string[] = []; const regex = /([^\r\n]*)(\r\n|\r|\n|$)/g; let match: RegExpExecArray | null;
  while ((match = regex.exec(text)) && (match[0].length || match.index < text.length)) { lines.push(match[1]); endings.push(match[2]); if (!match[2]) break; }
  const nodes: PlantUMLNodeSource[] = [], edges: PlantUMLEdgeSource[] = []; const byAlias = new Map<string, Graph['nodes'][number]>(), parents: string[] = [];
  let active: PlantUMLNodeSource | undefined, blockComment = false, opaqueDepth = 0, started = false, ended = false, inferred: PlantUMLDialect | undefined, sidecar: PlantUMLSidecar | undefined, sidecarLine: number | undefined, direction: Graph['direction'];
  for (let index = 0; index < lines.length; index++) {
    const original = lines[index], trimmed = original.trim();
    if (blockComment) { if (trimmed.includes("'/")) blockComment = false; continue; }
    if (trimmed.startsWith("/'")) { if (!trimmed.slice(2).includes("'/")) blockComment = true; continue; }
    if (trimmed.startsWith("'")) {
      if (options.metadata !== 'native' && trimmed.startsWith(SIDECAR)) { let value: any; try { value = JSON.parse(trimmed.slice(SIDECAR.length)); } catch { continue; } if (isPlantUMLSidecar(value)) { sidecar = value; sidecarLine = index; } }
      continue;
    }
    const line = getVisibleLine(original).trim(); if (!line) continue;
    if (opaqueDepth) { opaqueDepth += (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0); continue; }
    if (/^@startuml(?:\s+\S+)?$/.test(line)) { if (started) throw new Error('PlantUML: multiple diagrams are outside this profile'); started = true; continue; }
    if (line === '@enduml') { if (active || parents.length) throw new Error('PlantUML: unclosed declaration'); ended = true; continue; }
    if (!started || ended) throw new Error('PlantUML: source outside one @startuml/@enduml diagram');
    if (active) {
      if (line === '}') { active = undefined; continue; }
      if (/[{}]/.test(line) || /^[!@]/.test(line)) throw new Error('PlantUML: executable/nested class body is outside the class member profile');
      (active.node.data.members as string[]).push(line); active.members.push(index); continue;
    }
    if (line === '}') { if (!parents.length) throw new Error('PlantUML: unmatched group close'); parents.pop(); continue; }
    if (line === '!pragma layout smetana') continue;
    if (/^(?:skinparam|hide|show|title|caption|header|footer|scale)\b/.test(line)) { opaqueDepth = (line.match(/\{/g)?.length ?? 0) - (line.match(/\}/g)?.length ?? 0); continue; }
    if (line === 'left to right direction') { direction = 'right'; continue; } if (line === 'top to bottom direction') { direction = 'down'; continue; }
    const declaration = /^(component|class|interface|enum|abstract\s+class|package|namespace)\s+("(?:\\.|[^"\\])*"|[A-Za-z_$][\w.$]*)(?:\s+as\s+([A-Za-z_$][\w.$]*))?(?:\s+<<([^>]*)>>)?(?:\s+(#[A-Za-z0-9]+))?\s*(\{)?\s*$/.exec(line);
    const bracket = /^\[(.*?)\](?:\s+as\s+([A-Za-z_$][\w.$]*))?(?:\s+<<([^>]*)>>)?(?:\s+(#[A-Za-z0-9]+))?$/.exec(line);
    if (declaration || bracket) {
      if (declaration?.[3] && ['class', 'enum', 'abstract class'].includes(declaration[1].replace(/\s+/, ' ')) && !declaration[2].startsWith('"')) throw new Error('PlantUML: aliased declarations require a quoted native display name');
      if (bracket && /[\\&<>"~*]/.test(bracket[1])) throw new Error('PlantUML: rich/escaped bracket labels are outside this profile; quoted aliased declarations are supported');
      const kind = bracket ? 'component' : declaration![1].replace(/\s+/, ' '), label = bracket ? bracket[1] : getLabel(declaration![2]);
      if (!label) throw new Error('PlantUML: empty native display names are outside this profile');
      const alias = bracket ? bracket[2] ?? label : declaration![3] ?? label; const stereotypes = bracket ? bracket[3] : declaration![4]; const color = bracket ? bracket[4] : declaration![5];
      const group = kind === 'package' || kind === 'namespace'; const dialect = kind === 'component' ? 'component' : group ? undefined : 'class';
      if (dialect && inferred && inferred !== dialect) throw new Error('PlantUML: mixed component/class declarations are outside the selected dialect'); if (dialect) inferred = dialect;
      if (byAlias.has(alias)) throw new Error('PlantUML: duplicate native alias');
      const node: Graph['nodes'][number] = { type: 'node', id: alias, label, data: { kind, ...(stereotypes !== undefined && { stereotypes }), ...(!group && kind !== 'component' && { members: [] }) }, ...(parents.length && { parentId: parents.at(-1)! }), ...(color && { color }) };
      const token = bracket ? `[${label}]` : declaration![2], indent = original.length - original.trimStart().length;
      const record = { alias, node, line: index, token, tokenStart: original.indexOf(token, indent + (bracket ? 0 : declaration![1].length)), hasAlias: Boolean(bracket ? bracket[2] : declaration![3]), members: [] as number[] }; nodes.push(record); byAlias.set(alias, node);
      if (group) { if (!declaration![6]) throw new Error('PlantUML: groups require an explicit block'); parents.push(alias); }
      else if (declaration?.[6]) { if (kind === 'component') throw new Error('PlantUML: nested component blocks are outside this profile'); active = record; }
      continue;
    }
    const relationship = /^([A-Za-z_$][\w.$]*)(?:\s+"([^"]*)")?\s+(<\|--|--\|>|<\.\.|\.\.>|<-->|<--|-->|--|\.\.|\*--|o--|--\*|--o)(?:\s+"([^"]*)")?\s+([A-Za-z_$][\w.$]*)(?:\s*:\s*(.*))?$/.exec(line);
    if (relationship) {
      const arrow = getArrowMode(relationship[3]); const sourceId = arrow.reverse ? relationship[5] : relationship[1], targetId = arrow.reverse ? relationship[1] : relationship[5];
      const sourceMultiplicity = arrow.reverse ? relationship[4] : relationship[2], targetMultiplicity = arrow.reverse ? relationship[2] : relationship[4];
      const edge: Graph['edges'][number] = { type: 'edge', id: `e${edges.length}`, sourceId, targetId, mode: arrow.mode, label: relationship[6] === undefined ? null : getLabel(relationship[6]), data: { relationship: relationship[3], ...(sourceMultiplicity !== undefined && { sourceMultiplicity }), ...(targetMultiplicity !== undefined && { targetMultiplicity }) } };
      edges.push({ edge, line: index, ...(relationship[6] !== undefined && { labelStart: original.indexOf(':') + 1 }) }); continue;
    }
    throw new Error(`PlantUML: unsupported component/class statement on line ${index + 1}`);
  }
  if (!started || !ended || active || parents.length || blockComment || opaqueDepth) throw new Error('PlantUML: incomplete scoped diagram');
  const dialect = options.dialect ?? sidecar?.dialect ?? inferred ?? 'component'; if (!['component', 'class'].includes(dialect) || (inferred && inferred !== dialect)) throw new Error('PlantUML: selected dialect does not match declarations');
  const graph: Graph = { id: '', mode: 'directed', data: { dialect }, nodes: nodes.map((record) => record.node), edges: edges.map((record) => record.edge), ...(direction && { direction }) }; getValidatedGraph(graph, 'PlantUML');
  return { lines, endings, graph, nodes, edges, sidecar, sidecarLine, dialect };
}

function getPlantUMLGraph(parsed: PlantUMLSource): Graph {
  const metadata = parsed.sidecar; if (!metadata) return getClonedJSON(parsed.graph);
  const aliases = new Map(metadata.aliases.map((item) => [item.alias, item.id])); if (aliases.size !== metadata.aliases.length) throw new Error('PlantUML: duplicate sidecar alias');
  const originalNodes = new Map(metadata.graph.nodes.map((node) => [node.id, node])), beforeNodes = new Map(metadata.baseline.nodes.map((node) => [node.id, node]));
  const { nodes: _nodes, edges: _edges, ...root } = getClonedJSON(metadata.graph); const graph: Graph = { ...root, nodes: [], edges: [] };
  if (parsed.graph.direction !== metadata.baseline.direction) { if (parsed.graph.direction) graph.direction = parsed.graph.direction; else delete graph.direction; }
  for (const native of parsed.graph.nodes) {
    const id = aliases.get(native.id) ?? native.id, before = beforeNodes.get(native.id), original = originalNodes.get(id);
    if (!before || !original) { graph.nodes.push({ ...getClonedJSON(native), id, ...(native.parentId && { parentId: aliases.get(native.parentId) ?? native.parentId }) }); continue; }
    const node = getClonedJSON(original); if (native.label !== before.label) node.label = native.label;
    if (native.parentId !== before.parentId) { if (native.parentId === undefined) delete node.parentId; else node.parentId = native.parentId === null ? null : aliases.get(native.parentId) ?? native.parentId; }
    if (native.color !== before.color) { if (native.color === undefined) delete node.color; else node.color = native.color; }
    if (!isJSONEqual(native.data, before.data) && original.data && typeof original.data === 'object' && !Array.isArray(original.data)) node.data = getEditedData(original.data, before.data, native.data);
    graph.nodes.push(node);
  }
  if (isJSONEqual(parsed.graph.nodes.map((node) => node.id), metadata.baseline.nodes.map((node) => node.id))) {
    const projected = new Map(graph.nodes.map((node) => [node.id, node])); graph.nodes = metadata.graph.nodes.map((node) => projected.get(node.id)!);
  }
  const keys = new Set<string>();
  for (let index = 0; index < parsed.graph.edges.length; index++) {
    const native = parsed.graph.edges[index], before = metadata.baseline.edges[index], original = metadata.graph.edges[index];
    if (!before || !original || native.sourceId !== before.sourceId || native.targetId !== before.targetId || native.data.relationship !== before.data.relationship) throw new Error('PlantUML: changed/inserted native relationships have ambiguous source identity');
    const edge = getClonedJSON(original); if (native.label !== before.label) edge.label = native.label;
    if (native.mode !== before.mode) edge.mode = native.mode; if (!isJSONEqual(native.data, before.data) && original.data && typeof original.data === 'object' && !Array.isArray(original.data)) edge.data = getEditedData(original.data, before.data, native.data);
    graph.edges.push(edge); keys.add(edge.id);
  }
  if (parsed.graph.edges.length !== metadata.graph.edges.length || keys.size !== graph.edges.length) throw new Error('PlantUML: changed native relationship structure is unsupported');
  getValidatedGraph(graph, 'PlantUML'); return graph;
}

/** Honest component/class binary graph projection; executable diagram dialects throw. */
export function fromPlantUML(text: string, options: PlantUMLImportOptions = {}): Graph {
  const parsed = getParsedPlantUML(text, options), graph = getPlantUMLGraph(parsed); graph.data = createNativeCarrier(graph.data, 'plantuml', text, graph); return graph;
}

function getDisplayLabel(node: Graph['nodes'][number]): string {
  const label = node.label ?? node.id; if (!label) throw new Error('PlantUML: empty display names are unsupported by the native class/component grammar'); return label;
}
function toRawPlantUML(graph: Graph, options: PlantUMLExportOptions): string {
  getValidatedGraph(graph, 'PlantUML'); const dialect = options.dialect ?? 'component'; if (!['component', 'class'].includes(dialect)) throw new Error('PlantUML: unsupported dialect');
  const aliases = new Map(graph.nodes.map((node, index) => [node.id, `g${index}`])); const byParent = new Map<string | null, Graph['nodes']>(); const ids = new Set(graph.nodes.map((node) => node.id));
  for (const node of graph.nodes) { const parent = node.parentId ?? null; if (parent !== null && !ids.has(parent)) throw new Error('PlantUML: missing parent'); const siblings = byParent.get(parent) ?? []; siblings.push(node); byParent.set(parent, siblings); }
  const lines = ['@startuml', '!pragma layout smetana', ...(graph.direction === 'right' ? ['left to right direction'] : [])];
  const stack: Array<{ node?: Graph['nodes'][number]; close?: boolean }> = [...(byParent.get(null) ?? [])].reverse().map((node) => ({ node })); const seen = new Set<string>();
  while (stack.length) {
    const item = stack.pop()!; if (item.close) { lines.push('}'); continue; } const node = item.node!; if (seen.has(node.id)) throw new Error('PlantUML: cyclic hierarchy'); seen.add(node.id);
    const children = byParent.get(node.id) ?? [], kind = children.length ? 'package' : dialect === 'class' && ['class', 'interface', 'enum', 'abstract class'].includes(node.data?.kind) ? node.data.kind : dialect;
    const stereotypes = typeof node.data?.stereotypes === 'string' && !/[<>\r\n]/.test(node.data.stereotypes) ? ` <<${node.data.stereotypes}>>` : '';
    const color = node.color && /^(?:#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?|red|blue|green|black|white|gray|yellow|orange|purple)$/.test(node.color) ? ` ${node.color.startsWith('#') ? node.color : `#${node.color}`}` : '';
    const declaration = `${kind} ${getEncodedLabel(getDisplayLabel(node))} as ${aliases.get(node.id)}${stereotypes}${color}`;
    if (children.length) { lines.push(`${declaration} {`); stack.push({ close: true }, ...children.slice().reverse().map((child) => ({ node: child }))); }
    else if (dialect === 'class' && Array.isArray(node.data?.members) && node.data.members.length) { lines.push(`${declaration} {`); for (const member of node.data.members) { if (typeof member !== 'string' || /[\r\n{}]/.test(member) || /^[!@']/.test(member.trim())) throw new Error('PlantUML: unsupported class member'); lines.push(`  ${member}`); } lines.push('}'); }
    else lines.push(declaration);
  }
  if (seen.size !== graph.nodes.length) throw new Error('PlantUML: cyclic hierarchy');
  for (const edge of graph.edges) {
    const mode = edge.mode ?? graph.mode; let arrow = mode === 'directed' ? '-->' : mode === 'undirected' ? '--' : mode === 'bidirectional' ? '<-->' : undefined; if (!arrow) throw new Error('PlantUML: invalid edge mode');
    if (typeof edge.data?.relationship === 'string' && ARROWS.includes(edge.data.relationship) && getArrowMode(edge.data.relationship).mode === mode) arrow = String(edge.data.relationship);
    const reverse = getArrowMode(arrow).reverse, left = reverse ? edge.targetId : edge.sourceId, right = reverse ? edge.sourceId : edge.targetId;
    const sourceMultiplicity = reverse ? edge.data?.targetMultiplicity : edge.data?.sourceMultiplicity, targetMultiplicity = reverse ? edge.data?.sourceMultiplicity : edge.data?.targetMultiplicity;
    if ([sourceMultiplicity, targetMultiplicity].some((value) => value !== undefined && (typeof value !== 'string' || /["\r\n]/.test(value)))) throw new Error('PlantUML: invalid relationship multiplicity');
    if (edge.label !== undefined && edge.label !== null) getEncodedLabel(edge.label);
    if (edge.label !== undefined && edge.label !== null && /[\r\n']/.test(edge.label)) throw new Error('PlantUML: multiline/comment-starting link labels are outside this profile');
    lines.push(`${aliases.get(left)}${sourceMultiplicity === undefined ? '' : ` "${sourceMultiplicity}"`} ${arrow}${targetMultiplicity === undefined ? '' : ` "${targetMultiplicity}"`} ${aliases.get(right)}${edge.label ? ` : ${JSON.parse(getEncodedLabel(edge.label))}` : ''}`);
  }
  lines.push('@enduml'); const body = `${lines.join('\n')}\n`, baseline = getParsedPlantUML(body, { dialect, metadata: 'native' }).graph;
  const sidecar: PlantUMLSidecar = { kind: '@statelyai/graph/plantuml', version: 1, dialect, graph: getClonedJSON(graph), baseline, aliases: [...aliases].map(([id, alias]) => ({ alias, id })) };
  lines.splice(1, 0, `${SIDECAR}${JSON.stringify(sidecar)}`); return `${lines.join('\n')}\n`;
}

function getPlantUMLPatch(context: GraphDocumentPatchContext<string>, dialect: PlantUMLDialect): GraphDocumentPatchResult<string> {
  const parsed = getParsedPlantUML(context.source, { dialect });
  const aliases = new Map(parsed.sidecar?.aliases.map((item) => [item.id, item.alias]));
  const nodes = new Map(context.graph.nodes.map((node) => [node.id, node])), nodeSources = new Map(parsed.nodes.map((record) => [record.alias, record]));
  const edges = new Map(context.graph.edges.map((edge) => [edge.id, edge])), positions = new Map(context.sourceGraph.edges.map((edge, index) => [edge.id, index]));
  for (const change of context.changes) {
    if (change.entity === 'node' && change.field === 'label') {
      const node = nodes.get(change.id!)!, alias = aliases.get(node.id) ?? node.id, record = nodeSources.get(alias);
      if (!record || !node.label || /[\r\n]/.test(node.label)) return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', message: 'A node label edit requires one nonempty single-line declaration' }] };
      if (record.token.startsWith('[') && /[\\&<>"\]~*]/.test(node.label)) return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', message: 'Rich bracket labels require explicit regeneration with a quoted alias' }] };
      if (!record.hasAlias && !/^[A-Za-z_$][\w.$]*$/.test(record.alias)) return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', message: 'An implicit non-identifier display name has no stable editable native alias' }] };
      const offset = record.tokenStart;
      const replacement = `${record.token.startsWith('[') ? `[${node.label}]` : getEncodedLabel(node.label)}${record.hasAlias ? '' : ` as ${record.alias}`}`;
      parsed.lines[record.line] = parsed.lines[record.line].slice(0, offset) + replacement + parsed.lines[record.line].slice(offset + record.token.length);
    } else if (change.entity === 'edge' && change.field === 'label') {
      const index = positions.get(change.id!)!, record = parsed.edges[index], edge = edges.get(change.id!)!;
      if (!record || edge.label === undefined || edge.label === null || /[\r\n']/.test(edge.label)) return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', message: 'A relationship label edit requires single-line native text' }] };
      const original = parsed.lines[record.line], visible = getVisibleLine(original), suffix = original.slice(visible.length);
      if (record.labelStart === undefined) parsed.lines[record.line] = `${visible.trimEnd()} : ${JSON.parse(getEncodedLabel(edge.label))}${visible.match(/\s*$/)![0]}${suffix}`;
      else { const section = visible.slice(record.labelStart); parsed.lines[record.line] = `${original.slice(0, record.labelStart)}${section.match(/^\s*/)![0]}${JSON.parse(getEncodedLabel(edge.label))}${section.match(/\s*$/)![0]}${suffix}`; }
    } else return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', severity: 'error', path: change.path, message: 'Only native node/relationship label edits are supported; members, styles and structural changes require explicit regeneration' }] };
  }
  return { ok: true, source: parsed.lines.map((line, index) => line + parsed.endings[index]).join('') };
}

export function createPlantUMLDocumentConverter(options: { dialect?: PlantUMLDialect } = {}) {
  const dialect = options.dialect ?? 'component';
  return createGraphDocumentConverter({ format: `plantuml:${dialect}`, codec: { from: (source: string) => fromPlantUML(source, { dialect }), to: (graph: Graph) => toRawPlantUML(graph, { dialect }) }, project: (source: string) => ({ graph: getNativeDocumentGraph(fromPlantUML(source, { dialect }), 'plantuml', source) }), patch: (context) => getPlantUMLPatch(context, dialect) });
}

/** New output uses component by default; native-source exports apply strict verified patches. */
export function toPlantUML(graph: Graph, options: PlantUMLExportOptions = {}): string {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, 'plantuml');
  if (!carrier) return toRawPlantUML(graph, options);
  const dialect = options.dialect ?? getParsedPlantUML(carrier.native).dialect; const converter = createPlantUMLDocumentConverter({ dialect }); const document = converter.from(carrier.native);
  document.graph = { ...getClonedJSON(graph), data: getCarrierData(graph.data, 'plantuml') }; return converter.to(document);
}
export const plantumlConverter = createFormatConverter(toPlantUML, fromPlantUML);
export const plantumlDocumentConverter = createPlantUMLDocumentConverter();
