import type { Graph } from '../../types';
import type { GraphDocumentPatchContext, GraphDocumentPatchResult, GraphDocumentProjection } from '../document';
import { getEditedSource, getLabelChangeError, getUnsupported, type TextEdit } from '../xml-document';

/** Native DOT wire strings require Unicode scalar values and cannot contain NUL. */
export function getValidatedDOTString(value: string): string {
  for (const character of value) { const code = character.codePointAt(0)!; if (code === 0 || code >= 0xd800 && code <= 0xdfff) throw new Error('invalid-native-label: DOT strings/IDs require Unicode scalar values without NUL'); }
  return value;
}

interface Token { start: number; end: number; text: string; kind: 'id' | 'quoted' | 'html' | 'punctuation' }
interface Statement { kind: 'node' | 'edge'; private: boolean; id?: string; sourceId?: string; targetId?: string; labels: Token[]; end: number }

function getTokens(source: string): Token[] {
  const tokens: Token[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) { cursor++; continue; }
    if (source.startsWith('//', cursor) || source[cursor] === '#') { const end = source.indexOf('\n', cursor); cursor = end < 0 ? source.length : end; continue; }
    if (source.startsWith('/*', cursor)) { const end = source.indexOf('*/', cursor + 2); if (end < 0) throw new Error('unsupported-native-edit: unterminated DOT comment'); cursor = end + 2; continue; }
    const start = cursor;
    if (source[cursor] === '"') {
      cursor++;
      while (cursor < source.length && source[cursor] !== '"') { if (source[cursor] === '\\') cursor++; cursor++; }
      if (cursor === source.length) throw new Error('unsupported-native-edit: unterminated DOT string');
      cursor++;
      tokens.push({ start, end: cursor, text: source.slice(start, cursor), kind: 'quoted' }); continue;
    }
    if (source[cursor] === '<') {
      let depth = 0, quote = '';
      while (cursor < source.length) {
        if (source.startsWith('<!--', cursor) && !quote) { const end = source.indexOf('-->', cursor + 4); if (end < 0) throw new Error('unsupported-native-edit: unterminated HTML comment'); cursor = end + 3; continue; }
        const character = source[cursor++];
        if (quote) { if (character === quote) quote = ''; }
        else if (character === '"' || character === "'") quote = character;
        else if (character === '<') depth++;
        else if (character === '>' && --depth === 0) break;
      }
      if (depth) throw new Error('unsupported-native-edit: unterminated HTML token');
      tokens.push({ start, end: cursor, text: source.slice(start, cursor), kind: 'html' }); continue;
    }
    if (source.startsWith('->', cursor) || source.startsWith('--', cursor)) cursor += 2;
    else if ('{}[];,=: +'.includes(source[cursor])) cursor++;
    else {
      while (cursor < source.length && !/[\s{}\[\];,=:+"<>]/.test(source[cursor]) && !source.startsWith('->', cursor) && !source.startsWith('--', cursor) && !source.startsWith('//', cursor) && !source.startsWith('/*', cursor)) cursor++;
      if (cursor === start) throw new Error('unsupported-native-edit: unknown DOT token');
    }
    const text = source.slice(start, cursor);
    tokens.push({ start, end: cursor, text, kind: '{}[];,=:+'.includes(text) || text === '->' || text === '--' ? 'punctuation' : 'id' });
  }
  return tokens;
}

function getId(token: Token): string {
  return token.kind === 'quoted' ? token.text.slice(1, -1).replace(/\\"/g, '"').replace(/\\\r?\n/g, '') : token.text;
}

function getStatements(tokens: Token[]): Statement[] {
  const statements: Statement[] = [];
  let cursor = tokens.findIndex((token) => token.text === '{') + 1;
  while (cursor > 0 && cursor < tokens.length) {
    const first = tokens[cursor], previous = tokens[cursor - 1];
    if (!['id', 'quoted'].includes(first.kind) || !['{', '}', ';', ']'].includes(previous.text)) { cursor++; continue; }
    if (first.kind === 'id' && ['graph', 'node', 'edge', 'subgraph', 'strict', 'digraph'].includes(first.text)) { cursor++; continue; }
    let next = cursor + 1;
    while (tokens[next]?.text === ':' && ['id', 'quoted'].includes(tokens[next + 1]?.kind)) next += 2;
    let kind: 'node' | 'edge' = 'node', target: Token | undefined;
    if (['->', '--'].includes(tokens[next]?.text)) {
      kind = 'edge'; target = tokens[next + 1];
      if (!target || !['id', 'quoted'].includes(target.kind)) { cursor++; continue; }
      next += 2;
      while (tokens[next]?.text === ':' && ['id', 'quoted'].includes(tokens[next + 1]?.kind)) next += 2;
      // Chained/Cartesian/subgraph edges need a richer projection identity contract.
      if (['->', '--', ',', '+'].includes(tokens[next]?.text)) { cursor++; continue; }
    } else if (['=', ',', '+'].includes(tokens[next]?.text)) { cursor++; continue; }
    const labels: Token[] = [];
    let hasPrivate = false;
    while (tokens[next]?.text === '[') {
      next++;
      while (next < tokens.length && tokens[next].text !== ']') {
        if (tokens[next + 1]?.text === '=' && tokens[next + 2]) {
          if (getId(tokens[next]) === '_stately') {
            try {
              const value = JSON.parse(getId(tokens[next + 2]).replace(/\\(\\|n)/g, (_, character) => character === 'n' ? '\n' : '\\'));
              hasPrivate ||= value?.format === 'stately' && value.version === 1;
            } catch { /* Invalid reserved strings remain native source, not a private carrier. */ }
          }
          if (getId(tokens[next]) === 'label') {
            // Concatenated quoted strings are retained, never patched as one token.
            if (tokens[next + 3]?.text === '+') labels.push({ ...tokens[next + 2], kind: 'html' });
            else labels.push(tokens[next + 2]);
          }
          next += 3;
        } else next++;
      }
      if (next === tokens.length) throw new Error('unsupported-native-edit: unterminated DOT attribute list');
      next++;
    }
    if (!tokens[next] || ![';', '}', ']'].includes(tokens[next].text) && !['id', 'quoted'].includes(tokens[next].kind)) { cursor++; continue; }
    const end = tokens[next - 1].end;
    statements.push(kind === 'node' ? { kind, id: getId(first), labels, end, private: hasPrivate }
      : { kind, sourceId: getId(first), targetId: getId(target!), labels, end, private: hasPrivate });
    cursor = next;
  }
  return statements;
}

/** Conservative native token patching: explicit labels, repeated nodes, simple edges. */
export function getDOTDocumentPatch(context: GraphDocumentPatchContext<string>): GraphDocumentPatchResult<string> {
  const invalid = getLabelChangeError(context.changes);
  if (invalid) return invalid;
  const statements = getStatements(getTokens(context.source));
  const nodeStatements = new Map<string, Statement[]>();
  const edges = statements.filter((statement) => statement.kind === 'edge');
  for (const statement of statements) if (statement.kind === 'node') {
    const group = nodeStatements.get(statement.id!) ?? []; group.push(statement); nodeStatements.set(statement.id!, group);
  }
  const edits: TextEdit[] = [];
  for (const change of context.changes) {
    let candidates: Statement[];
    if (change.entity === 'node') candidates = nodeStatements.get(change.id!) ?? [];
    else {
      const index = context.sourceGraph.edges.findIndex((edge) => edge.id === change.id);
      if (edges.length !== context.sourceGraph.edges.length || index < 0 || edges.some((statement, offset) => statement.sourceId !== context.sourceGraph.edges[offset].sourceId || statement.targetId !== context.sourceGraph.edges[offset].targetId)) return getUnsupported(change, 'DOT edge labels require one simple statement per projected edge; chains, strict merging and subgraph endpoints are unsupported');
      candidates = [edges[index]];
    }
    if (!candidates.length) return getUnsupported(change, 'DOT label editing requires an explicit entity statement; implicit nodes and clusters are unsupported');
    const explicit = candidates.filter((statement) => statement.labels.length);
    const label = explicit.at(-1)?.labels.at(-1);
    if (label && label.kind !== 'quoted') return getUnsupported(change, 'DOT HTML, bare and concatenated labels are retained but cannot be safely edited');
    const value = getValidatedDOTString(change.after as string).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
    if (label) edits.push({ start: label.start + 1, end: label.end - 1, text: value });
    else {
      // An inherited HTML label changes interpretation if replaced with plain text.
      const entity = change.entity === 'node' ? context.sourceGraph.nodes.find((node) => node.id === change.id) : context.sourceGraph.edges.find((edge) => edge.id === change.id);
      const preserve = (entity?.data as any)?._dot?.native ?? (entity?.data as any)?.dot;
      if (change.entity === 'node' && preserve?.implicitLabel && candidates.every((candidate) => !candidate.private)) return getUnsupported(change, 'Missing native DOT labels use Graphviz defaults rather than a literal label; edit source explicitly');
      if ((entity?.data as any)?.dot?.labelHtml || (entity?.data as any)?._dot?.labelHtml) return getUnsupported(change, 'Inherited HTML label editing requires an explicit HTML-aware update');
      const statement = candidates.at(-1)!;
      edits.push({ start: statement.end, end: statement.end, text: ` [label="${value}"]` });
    }
  }
  return { ok: true, source: getEditedSource(context.source, edits) };
}

/** DOT graph streams retain all bytes while the legacy Graph view selects the first. */
export function getDOTDocumentProjection(source: string, from: (source: string) => Graph): GraphDocumentProjection {
  const tokens = getTokens(source);
  let depth = 0, graphs = 0;
  for (const token of tokens) {
    if (!depth && token.kind === 'id' && ['graph', 'digraph'].includes(token.text)) graphs++;
    if (token.text === '{') depth++;
    else if (token.text === '}') depth--;
  }
  const graph = from(source);
  const privateNodes = new Set(getStatements(tokens).filter((statement) => statement.kind === 'node' && statement.private).map((statement) => statement.id));
  for (const node of graph.nodes) {
    const preserve = (node.data as any)?._dot?.native ?? (node.data as any)?.dot;
    // The document view distinguishes absent native labels from explicit empty;
    // bare fromDOT keeps its historical empty-string projection.
    if (node.label === '' && preserve?.implicitLabel && !privateNodes.has(node.id)) node.label = null;
  }
  return { graph, diagnostics: [{ code: graphs > 1 ? 'projection-multiple-graphs' : 'projection-partial', message: graphs > 1 ? 'Only the first DOT graph is projected; the complete native graph stream remains preserved' : 'The Graph view is partial; comments, statement syntax and unmodeled attributes remain in native source', severity: 'warning' }] };
}
