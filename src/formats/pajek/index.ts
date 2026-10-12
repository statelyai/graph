import { createFormatData } from '../xml-preservation';
import type { Graph } from '../../types';
import { createFormatConverter } from '../converter';
import { createGraphDocumentConverter, type GraphDocumentPatchContext, type GraphDocumentPatchResult } from '../document';
import { createMetadata, getMetadata, getRestoredRecord, createNativeCarrier, getNativeCarrier, getCarrierData, getClonedJSON, getNativeDocumentGraph, isJSONEqual, type FormatImportOptions, type FormatExportOptions } from '../preservation';
import { getValidatedGraph, getUniformMode } from '../structured-json';
import { getEditedSource, getLabelChangeError, getUnsupported, type TextEdit } from '../xml-document';

export interface PajekImportOptions extends FormatImportOptions {}
export interface PajekExportOptions extends FormatExportOptions {}
interface Token { value: string; start: number; end: number; quoted: boolean }
interface Row { tokens: Token[]; start: number; end: number; metadata?: ReturnType<typeof getMetadata> }
interface Parsed { count: number; mode: 'directed' | 'undirected'; name: string; nodes: Map<number, Row>; edges: Row[]; rootMetadata?: ReturnType<typeof getMetadata>; insertion: number }
const FORMAT = 'pajek', PREFIX = '% @statelyai/graph/pajek ';
function getRecord(mapped: any, metadata?: ReturnType<typeof getMetadata>): any {
  const record = getRestoredRecord(mapped, metadata);
  if (metadata && !isJSONEqual(mapped.data, metadata.mapped.data)) record.data = createFormatData(metadata.original.data, FORMAT, { native: mapped.data });
  return record;
}

function getInput(source: string, options: PajekImportOptions) { return { source, options: getClonedJSON(options) }; }
function getTokens(line: string, start: number): Token[] {
  const tokens: Token[] = []; let cursor = 0;
  while (cursor < line.length) {
    if (/\s/.test(line[cursor])) { cursor++; continue; }
    const begin = cursor, quoted = line[cursor] === '"';
    if (quoted) {
      cursor++; const valueStart = cursor;
      while (cursor < line.length && line[cursor] !== '"') cursor++;
      if (cursor === line.length) throw new Error('Pajek: unterminated quoted token');
      tokens.push({ value: line.slice(valueStart, cursor), start: start + begin, end: start + ++cursor, quoted });
      if (cursor < line.length && !/\s/.test(line[cursor])) throw new Error('Pajek: quoted token must have an unambiguous boundary');
    } else {
      while (cursor < line.length && !/\s/.test(line[cursor])) cursor++;
      const value = line.slice(begin, cursor);
      if (value.includes('"')) throw new Error('Pajek: quotes inside native labels are unsupported');
      tokens.push({ value, start: start + begin, end: start + cursor, quoted });
    }
  }
  return tokens;
}
function getInteger(token: Token | undefined, count: number): number {
  if (!token || token.quoted || !/^\d+$/.test(token.value)) throw new Error('Pajek: integer identity required');
  const id = Number(token.value);
  if (!Number.isSafeInteger(id) || id < 1 || id > count) throw new Error('Pajek: vertex reference outside declared range');
  return id;
}
function getParsed(source: string, native: boolean): Parsed {
  if (source.length > 16 * 1024 * 1024) throw new Error('Pajek: input exceeds 16MiB');
  const result: Parsed = { count: -1, mode: 'undirected', name: '', nodes: new Map(), edges: [], insertion: source.length };
  let position = 0, section = '', edgeMode = '', pending: ReturnType<typeof getMetadata>;
  let capsule: any;
  const nodeMetadata = new Map<number, ReturnType<typeof getMetadata>>(), edgeMetadata = new Map<string, ReturnType<typeof getMetadata>>();
  for (const line of source.split(/\r\n|\r|\n/)) {
    const start = position, end = start + line.length;
    position = end + (source.slice(end, end + 2) === '\r\n' ? 2 : 1);
    if (!line.trim()) continue;
    if (line.trimStart().startsWith('%')) {
      if (!native && line.startsWith(PREFIX + 'document ')) {
        let value: any; try { value = JSON.parse(line.slice((PREFIX + 'document ').length)); } catch { /* Opaque comment. */ }
        if (value?.kind === '@statelyai/graph/pajek' && value.version === 1 && Array.isArray(value.nodes) && Array.isArray(value.edges)) {
          if (capsule || result.rootMetadata) throw new Error('Pajek: ambiguous root metadata');
          capsule = value; result.rootMetadata = getMetadata(value.graph, `${FORMAT}.graph`);
          for (const entry of value.nodes) { const metadata = getMetadata(entry.metadata, `${FORMAT}.node`); if (metadata && Number.isSafeInteger(entry.id) && entry.id > 0) { if (nodeMetadata.has(entry.id)) throw new Error('Pajek: ambiguous vertex metadata'); nodeMetadata.set(entry.id, metadata); } }
          for (const entry of value.edges) { const metadata = getMetadata(entry.metadata, `${FORMAT}.edge`); if (metadata && typeof entry.key === 'string') { if (edgeMetadata.has(entry.key)) throw new Error('Pajek: ambiguous edge metadata'); edgeMetadata.set(entry.key, metadata); } }
        }
        continue;
      }
      if (!native && line.startsWith(PREFIX)) {
        const index = line.indexOf(' ', PREFIX.length), kind = line.slice(PREFIX.length, index);
        if (index > 0 && ['graph', 'node', 'edge'].includes(kind)) {
          try {
            const metadata = getMetadata(JSON.parse(line.slice(index + 1)), `${FORMAT}.${kind}`);
            if (metadata) {
              if (kind === 'graph') { if (result.rootMetadata) throw new Error('Pajek: ambiguous root metadata'); result.rootMetadata = metadata; }
              else { if (pending) throw new Error('Pajek: ambiguous entity metadata'); pending = metadata; }
            }
          } catch (error) { if (String(error).includes('Pajek:')) throw error; }
        }
      }
      continue;
    }
    const tokens = getTokens(line, start);
    if (tokens[0].value.startsWith('*')) {
      if (pending) throw new Error('Pajek: metadata has no adjacent entity');
      section = tokens[0].value.toLowerCase();
      if (section === '*network') { result.name = tokens.slice(1).map((token) => token.value).join(' '); continue; }
      if (section === '*vertices') {
        if (result.count >= 0 || tokens.length !== 2 || !/^\d+$/.test(tokens[1].value)) throw new Error('Pajek: only one ordinary vertex set is supported');
        result.count = Number(tokens[1].value);
        if (!Number.isSafeInteger(result.count) || result.count > 1_000_000) throw new Error('Pajek: invalid or oversized vertex count');
      } else if (section === '*arcs' || section === '*edges') {
        if (tokens.length !== 1 || result.count < 0 || edgeMode && edgeMode !== section) throw new Error('Pajek: mixed directed/undirected sections are unsupported');
        if (!edgeMode) result.insertion = start;
        edgeMode = section; result.mode = section === '*arcs' ? 'directed' : 'undirected';
      } else throw new Error(`Pajek: unsupported section ${section}; matrix/list/project/temporal profiles require native source operations`);
      continue;
    }
    if (tokens.some((token) => !token.quoted && /[\[\]]/.test(token.value))) throw new Error('Pajek: temporal annotations are unsupported');
    const row: Row = { tokens, start, end, ...(pending && { metadata: pending }) }; pending = undefined;
    if (section === '*vertices') {
      const id = getInteger(tokens[0], result.count);
      if (result.nodes.has(id)) throw new Error('Pajek: duplicate vertex definition');
      if (tokens[1] && !tokens[1].quoted && Number.isFinite(Number(tokens[1].value))) throw new Error('Pajek: ambiguous numeric vertex label/geometry');
      if (row.metadata && row.metadata.format !== `${FORMAT}.node`) throw new Error('Pajek: metadata entity mismatch');
      result.nodes.set(id, row);
    } else if (section === '*arcs' || section === '*edges') {
      getInteger(tokens[0], result.count); getInteger(tokens[1], result.count);
      if (row.metadata && row.metadata.format !== `${FORMAT}.edge`) throw new Error('Pajek: metadata entity mismatch');
      result.edges.push(row);
    } else throw new Error('Pajek: unexpected content outside a supported section');
  }
  if (result.count < 0 || pending) throw new Error('Pajek: missing vertices or unbound metadata');
  for (const [id, row] of result.nodes) if (nodeMetadata.has(id)) { if (row.metadata) throw new Error('Pajek: ambiguous vertex metadata'); row.metadata = nodeMetadata.get(id); }
  const occurrences = new Map<string, number>();
  for (const row of result.edges) { const key = getEdgeKey(row, result.mode, occurrences); if (edgeMetadata.has(key)) { if (row.metadata) throw new Error('Pajek: ambiguous edge metadata'); row.metadata = edgeMetadata.get(key); } }
  return result;
}
function getEdgeKey(row: Row, mode: string, occurrences: Map<string, number>): string {
  const ends = mode === 'undirected' ? [row.tokens[0].value, row.tokens[1].value].sort() : [row.tokens[0].value, row.tokens[1].value];
  const pair = JSON.stringify(ends), occurrence = occurrences.get(pair) ?? 0; occurrences.set(pair, occurrence + 1);
  return JSON.stringify([pair, occurrence]);
}
function getEdgeFields(row: Row) {
  let cursor = 2, weight: number | undefined;
  if (row.tokens[cursor] && !row.tokens[cursor].quoted && Number.isFinite(Number(row.tokens[cursor].value))) weight = Number(row.tokens[cursor++].value);
  const attrs = row.tokens.slice(cursor), labels: Token[] = [];
  for (let index = 0; index < attrs.length; index += 2) { if (!attrs[index + 1]) throw new Error('Pajek: native edge attributes require key/value pairs'); if (attrs[index].value.toLowerCase() === 'l') labels.push(attrs[index + 1]); }
  if (labels.length > 1) throw new Error('Pajek: repeated native edge label is ambiguous');
  return { weight, label: labels[0], attributes: attrs.filter((_, index) => attrs[index - index % 2].value.toLowerCase() !== 'l').map((token) => token.value) };
}
/** Integer vertex identity is independent of optional, possibly repeated labels. */
export function fromPajek(source: string, options: PajekImportOptions = {}): Graph {
  const parsed = getParsed(source, options.metadata === 'native'), nodes: Graph['nodes'] = [];
  for (let id = 1; id <= parsed.count; id++) {
    const row = parsed.nodes.get(id);
    nodes.push(getRecord({ type: 'node', id: String(id), parentId: null, initialNodeId: null, label: row?.tokens[1]?.value ?? null, data: { attributes: row?.tokens.slice(2).map((token) => token.value) ?? [] } }, row?.metadata) as Graph['nodes'][number]);
  }
  const reserved = new Set(parsed.edges.flatMap((row) => typeof row.metadata?.original.id === 'string' ? [row.metadata.original.id] : []));
  const occurrences = new Map<string, number>();
  const edges = parsed.edges.map((row) => {
    const sourceId = nodes[getInteger(row.tokens[0], parsed.count) - 1].id, targetId = nodes[getInteger(row.tokens[1], parsed.count) - 1].id;
    const ends = parsed.mode === 'undirected' ? [row.tokens[0].value, row.tokens[1].value].sort() : [row.tokens[0].value, row.tokens[1].value];
    const pair = JSON.stringify([parsed.mode, ...ends]), occurrence = occurrences.get(pair) ?? 0; occurrences.set(pair, occurrence + 1);
    let id = typeof row.metadata?.mapped.id === 'string' ? row.metadata.mapped.id : `pajek:edge:${JSON.stringify([pair, occurrence])}`;
    if (!row.metadata) { while (reserved.has(id)) id += '_'; reserved.add(id); }
    const fields = getEdgeFields(row);
    return getRecord({ type: 'edge', id, sourceId, targetId, mode: parsed.mode, label: fields.label?.value ?? null, ...(fields.weight !== undefined && { weight: fields.weight }), data: { attributes: fields.attributes } }, row.metadata) as Graph['edges'][number];
  });
  const root = getRecord({ id: parsed.name, mode: parsed.mode, initialNodeId: null, data: undefined }, parsed.rootMetadata);
  const graph = { ...root, nodes, edges } as Graph; getValidatedGraph(graph, FORMAT);
  graph.data = createNativeCarrier(graph.data, FORMAT, getInput(source, options), graph); return graph;
}
function getQuoted(value: string): string {
  for (const character of value) { const code = character.codePointAt(0)!; if (character === '"' || code < 32 && code !== 9 || code === 127 || code >= 0xd800 && code <= 0xdfff) throw new Error('Pajek: label must be a Unicode scalar single-line string without embedded quotes/control characters'); }
  return `"${value}"`;
}
function toRawPajek(graph: Graph): string {
  getValidatedGraph(graph, FORMAT); const mode = getUniformMode(graph, FORMAT), ids = new Map(graph.nodes.map((node, index) => [node.id, index + 1]));
  const nodeLines = graph.nodes.map((node, index) => `${index + 1}${node.label == null ? '' : ` ${getQuoted(node.label)}`}`);
  const edgeLines = graph.edges.map((edge) => { const weight = edge.weight ?? 1; if (!Number.isFinite(weight)) throw new Error('Pajek: finite edge weights required'); return `${ids.get(edge.sourceId)} ${ids.get(edge.targetId)} ${weight}${edge.label == null ? '' : ` l ${getQuoted(edge.label)}`}`; });
  const name = graph.id ? `*Network ${getQuoted(graph.id)}\n` : '';
  const bare = `${name}*Vertices ${graph.nodes.length}\n${nodeLines.join('\n')}${nodeLines.length ? '\n' : ''}${mode === 'directed' ? '*Arcs' : '*Edges'}\n${edgeLines.join('\n')}${edgeLines.length ? '\n' : ''}`;
  const mapped = fromPajek(bare, { metadata: 'native' }), { nodes: _nodes, edges: _edges, ...root } = graph;
  const { nodes: _mn, edges: _me, ...mappedRoot } = mapped; mappedRoot.data = getCarrierData(mapped.data, FORMAT);
  const parsed = getParsed(bare, true), occurrences = new Map<string, number>();
  const capsule = { kind: '@statelyai/graph/pajek', version: 1, graph: createMetadata(`${FORMAT}.graph`, root, mappedRoot),
    nodes: graph.nodes.map((node, index) => ({ id: index + 1, metadata: createMetadata(`${FORMAT}.node`, node, mapped.nodes[index]) })),
    edges: graph.edges.map((edge, index) => ({ key: getEdgeKey(parsed.edges[index], mode, occurrences), metadata: createMetadata(`${FORMAT}.edge`, edge, mapped.edges[index]) })) };
  const lines = [PREFIX + 'document ' + JSON.stringify(capsule), ...(name ? [name.trimEnd()] : []), `*Vertices ${graph.nodes.length}`, ...nodeLines, mode === 'directed' ? '*Arcs' : '*Edges', ...edgeLines];
  return lines.join('\n') + '\n';
}
/** Include comments/capsules: occurrence metadata does not establish stable identity. */
function getRelationshipSequence(source: string): string[] {
  const tokens = source.split(/(\r\n|\n|\r)/), records: string[] = [];
  let relationships = false;
  for (let index = 0; index < tokens.length; index += 2) {
    const line = tokens[index], trimmed = line.trimStart();
    if (trimmed.startsWith('*')) relationships = /^\*(?:arcs|edges)(?:\s|$)/i.test(trimmed);
    if (relationships || trimmed.startsWith('%')) records.push(line + (tokens[index + 1] ?? ''));
  }
  return records;
}

function getPajekPatch(context: GraphDocumentPatchContext<string>, options: PajekImportOptions): GraphDocumentPatchResult<string> {
  const invalid = getLabelChangeError(context.changes); if (invalid) return invalid;
  const edgeChange = context.changes.find((change) => change.entity === 'edge');
  if (edgeChange && !isJSONEqual(getRelationshipSequence(context.baselineSource), getRelationshipSequence(context.source))) {
    return { ok: false, diagnostics: [{ code: 'ambiguous-native-identity', severity: 'error', path: edgeChange.path,
      message: 'Pajek relationship identity is ambiguous after native relationship/comment sequence changes, including occurrence-indexed capsules' }] };
  }
  const parsed = getParsed(context.source, options.metadata === 'native'), graph = fromPajek(context.source, options);
  const nodes = new Map(graph.nodes.map((node, index) => [node.id, index + 1])), edges = new Map(graph.edges.map((edge, index) => [edge.id, parsed.edges[index]]));
  const edits: TextEdit[] = [];
  for (const change of context.changes) {
    const text = getQuoted(change.after as string);
    if (change.entity === 'node') {
      const id = nodes.get(change.id!); if (id === undefined) return getUnsupported(change, 'Pajek: vertex identity unavailable');
      const row = parsed.nodes.get(id), token = row?.tokens[1];
      edits.push(token ? { start: token.start, end: token.end, text } : row ? { start: row.tokens[0].end, end: row.tokens[0].end, text: ` ${text}` } : { start: parsed.insertion, end: parsed.insertion, text: `${id} ${text}\n` });
    } else {
      const row = edges.get(change.id!); if (!row) return getUnsupported(change, 'Pajek: edge row unavailable');
      const token = getEdgeFields(row).label;
      edits.push(token ? { start: token.start, end: token.end, text } : { start: row.end, end: row.end, text: ` l ${text}` });
    }
  }
  return { ok: true, source: getEditedSource(context.source, edits) };
}
/** Imported source is exact; regeneration is explicit via nativeCarrier:false. */
export function toPajek(graph: Graph, options: PajekExportOptions = {}): string {
  const carrier = options.nativeCarrier === false ? undefined : getNativeCarrier(graph.data, FORMAT);
  if (!carrier) return toRawPajek(graph);
  const input = carrier.native as ReturnType<typeof getInput>, converter = createPajekDocumentConverter(input.options), document = converter.from(input.source);
  document.graph = { ...graph, data: getCarrierData(graph.data, FORMAT) }; return converter.to(document);
}
export function createPajekDocumentConverter(options: PajekImportOptions = {}) {
  return createGraphDocumentConverter({ format: FORMAT, codec: { from: (source: string) => fromPajek(source, options), to: (graph: Graph) => toPajek(graph, { nativeCarrier: false }) },
    project: (source: string) => ({ graph: getNativeDocumentGraph(fromPajek(source, options), FORMAT, getInput(source, options)), diagnostics: [{ code: 'projection-partial' as const, severity: 'warning' as const, message: 'Uniform Pajek .net profile; native attributes/comments remain source state, mixed/temporal/matrix/project sections are unavailable' }] }),
    patch: (context) => getPajekPatch(context, options) });
}
export const pajekConverter = createFormatConverter(toPajek, fromPajek);
export const pajekDocumentConverter = createPajekDocumentConverter();
