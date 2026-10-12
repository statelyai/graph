import type { Graph } from '../../types';
import type { GraphDocumentPatchContext, GraphDocumentPatchResult, GraphDocumentProjection } from '../document';
import { getEditedSource, getLabelChangeError, getUnsupported, type TextEdit } from '../xml-document';

interface Token { text: string; value: string; start: number; end: number; quoted: boolean }
interface Entry { key: string; value?: Token; block?: number }
interface Block { key: string; parent: number | null; entries: Entry[]; close: number }

/** Iterative lexical blocks retain quote positions and ignore comment contents. */
function getBlocks(source: string, decode: (value: string) => string): Block[] {
  const tokens: Token[] = [];
  let cursor = 0;
  while (cursor < source.length) {
    if (/\s/.test(source[cursor])) { cursor++; continue; }
    if (source[cursor] === '#') { const end = source.indexOf('\n', cursor); cursor = end < 0 ? source.length : end; continue; }
    const start = cursor;
    if (source[cursor] === '"') {
      cursor++;
      let value = '';
      while (cursor < source.length && source[cursor] !== '"') {
        if (source[cursor] === '\\' && ['\\', '"'].includes(source[cursor + 1])) cursor++;
        value += source[cursor++];
      }
      if (cursor === source.length) throw new Error('unsupported-native-edit: unterminated GML string');
      cursor++;
      tokens.push({ text: source.slice(start, cursor), value: decode(value), start, end: cursor, quoted: true }); continue;
    }
    if ('[]'.includes(source[cursor])) cursor++;
    else while (cursor < source.length && !/[\s\[\]"#]/.test(source[cursor])) cursor++;
    if (cursor === start) throw new Error('unsupported-native-edit: unknown GML token');
    const text = source.slice(start, cursor);
    tokens.push({ text, value: text, start, end: cursor, quoted: false });
  }
  const blocks: Block[] = [{ key: '', parent: null, entries: [], close: source.length }], stack = [0];
  cursor = 0;
  while (cursor < tokens.length) {
    const key = tokens[cursor++];
    if (key.text === ']') {
      if (stack.length === 1) throw new Error('unsupported-native-edit: unexpected GML close');
      blocks[stack.pop()!].close = key.start; continue;
    }
    if (key.quoted || !/^[A-Za-z][A-Za-z0-9]*$/.test(key.text)) throw new Error('unsupported-native-edit: malformed GML key');
    const value = tokens[cursor++];
    if (!value || value.text === ']') throw new Error('unsupported-native-edit: missing GML value');
    const parent = stack.at(-1)!;
    if (value.text === '[') {
      const index = blocks.length;
      blocks.push({ key: key.text, parent, entries: [], close: source.length });
      blocks[parent].entries.push({ key: key.text, block: index }); stack.push(index);
    } else blocks[parent].entries.push({ key: key.text, value });
  }
  if (stack.length !== 1) throw new Error('unsupported-native-edit: unclosed GML block');
  return blocks;
}

function getValues(block: Block, key: string): Token[] {
  return block.entries.filter((entry) => entry.key === key && entry.value).map((entry) => entry.value!);
}

function getId(block: Block): string | undefined {
  for (const token of getValues(block, 'stately')) {
    try {
      const value = JSON.parse(token.value);
      if (value?.format === 'stately' && value.version === 1 && typeof value.originalId === 'string') return value.originalId;
    } catch { /* Opaque native values never become an identity carrier. */ }
  }
  const ids = getValues(block, 'id');
  return ids.length === 1 ? ids[0].value : undefined;
}

export function getGMLDocumentProjection(source: string, from: (source: string) => Graph, decode: (value: string) => string): GraphDocumentProjection {
  const blocks = getBlocks(source, decode);
  const graphs = blocks[0].entries.filter((entry) => entry.key === 'graph' && entry.block !== undefined);
  if (graphs.length !== 1) return { graph: null, diagnostics: [{ code: 'projection-unavailable', message: 'GML document requires exactly one graph for a binary projection; all source graphs remain preserved', severity: 'warning' }] };
  return { graph: from(source), diagnostics: [{ code: 'projection-partial', message: 'The Graph view is partial; comments, ordering and extensions remain in the native source', severity: 'warning' }] };
}

/** Update literal labels within a unique native entity block; reject richer edits. */
export function getGMLDocumentPatch(context: GraphDocumentPatchContext<string>, decode: (value: string) => string, encode: (value: string) => string): GraphDocumentPatchResult<string> {
  const invalid = getLabelChangeError(context.changes);
  if (invalid) return invalid;
  const blocks = getBlocks(context.source, decode);
  const graphIndex = blocks[0].entries.find((entry) => entry.key === 'graph' && entry.block !== undefined)?.block;
  if (graphIndex === undefined) return getUnsupported(context.changes[0], 'Cannot locate the GML graph');
  const selected = new Set([graphIndex]);
  for (let index = graphIndex + 1; index < blocks.length; index++) if (blocks[index].parent !== null && selected.has(blocks[index].parent!) && blocks[index].key === 'node') selected.add(index);
  const edits: TextEdit[] = [];
  for (const change of context.changes) {
    const candidates = blocks.filter((block, index) => block.key === change.entity && getId(block) === change.id && (change.entity === 'node' ? selected.has(index) : block.parent === graphIndex));
    if (candidates.length !== 1) return getUnsupported(change, 'GML label editing requires a unique explicit native entity ID (or versioned originalId)');
    const block = candidates[0], labels = getValues(block, 'label');
    if (labels.length > 1 || (labels.length === 1 && !labels[0].quoted)) return getUnsupported(change, 'GML label must be a single quoted string');
    const label = change.after as string;
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(label)) return { ok: false, diagnostics: [{ code: 'invalid-native-label', message: 'GML label contains unsupported control characters', severity: 'error', path: change.path }] };
    const text = encode(label);
    edits.push(labels.length ? { start: labels[0].start, end: labels[0].end, text }
      : { start: block.close, end: block.close, text: ` label ${text} ` });
  }
  return { ok: true, source: getEditedSource(context.source, edits) };
}
