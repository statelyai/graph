import type { Graph } from '../types';
import type { GraphDocumentChange, GraphDocumentPatchContext, GraphDocumentPatchResult, GraphDocumentProjection } from './document';

interface TextEdit { start: number; end: number; text: string }
interface XMLAttribute { name: string; value: string; start: number; end: number; quote: string }
interface XMLElement {
  name: string; local: string; uri: string; start: number; openEnd: number;
  closeStart: number; end: number; empty: boolean; parent: number | null;
  attributes: XMLAttribute[]; children: number[];
}

function getDecodedXML(value: string): string {
  return value.replace(/&(?:#x([0-9a-f]+)|#(\d+)|(amp|lt|gt|quot|apos));/gi, (match, hex, decimal, name) => {
    if (hex || decimal) {
      const code = Number.parseInt(hex ?? decimal, hex ? 16 : 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" } as Record<string, string>)[name] ?? match;
  });
}

/** Lexical spans only: declarations/comments/CDATA never become element identities. */
function getXMLElements(source: string): XMLElement[] {
  const elements: XMLElement[] = [];
  const stack: Array<{ index: number; namespaces: Map<string, string> }> = [];
  let position = 0;
  while (position < source.length) {
    const start = source.indexOf('<', position);
    if (start === -1) break;
    if (source.startsWith('<!--', start) || source.startsWith('<![CDATA[', start) || source.startsWith('<?', start)) {
      const delimiter = source.startsWith('<!--', start) ? '-->' : source.startsWith('<![CDATA[', start) ? ']]>' : '?>';
      const end = source.indexOf(delimiter, start + 2);
      if (end < 0) throw new Error('unsupported-xml-syntax: unterminated XML token');
      position = end + delimiter.length; continue;
    }
    if (source.startsWith('<!', start)) {
      let cursor = start + 2, quote = '', brackets = 0;
      for (; cursor < source.length; cursor++) {
        if (!quote && source.startsWith('<!--', cursor)) {
          const end = source.indexOf('-->', cursor + 4);
          if (end < 0) throw new Error('unsupported-xml-syntax: unterminated declaration comment');
          cursor = end + 2; continue;
        }
        const character = source[cursor];
        if (quote) { if (character === quote) quote = ''; }
        else if (character === '"' || character === "'") quote = character;
        else if (character === '[') brackets++;
        else if (character === ']') brackets--;
        else if (character === '>' && brackets === 0) break;
      }
      if (cursor === source.length) throw new Error('unsupported-xml-syntax: unterminated declaration');
      position = cursor + 1; continue;
    }
    if (source.startsWith('</', start)) {
      const end = source.indexOf('>', start + 2);
      const frame = stack.pop();
      if (!frame || end < 0 || source.slice(start + 2, end).trim() !== elements[frame.index].name) throw new Error('unsupported-xml-syntax: mismatched tag');
      elements[frame.index].closeStart = start; elements[frame.index].end = end + 1;
      position = end + 1; continue;
    }
    let cursor = start + 1;
    while (cursor < source.length && !/[\s/>]/.test(source[cursor])) cursor++;
    const name = source.slice(start + 1, cursor);
    const attributes: XMLAttribute[] = [];
    while (cursor < source.length) {
      while (/\s/.test(source[cursor] ?? '') && cursor < source.length) cursor++;
      if (source[cursor] === '>' || source.startsWith('/>', cursor)) break;
      const attrStart = cursor;
      while (cursor < source.length && !/[\s=/>]/.test(source[cursor])) cursor++;
      const attrName = source.slice(attrStart, cursor);
      while (/\s/.test(source[cursor] ?? '') && cursor < source.length) cursor++;
      if (!attrName || source[cursor++] !== '=') throw new Error('unsupported-xml-syntax: expected quoted attribute');
      while (/\s/.test(source[cursor] ?? '') && cursor < source.length) cursor++;
      const quote = source[cursor++];
      if (quote !== '"' && quote !== "'") throw new Error('unsupported-xml-syntax: expected quoted attribute');
      const valueStart = cursor;
      cursor = source.indexOf(quote, cursor);
      if (cursor < 0) throw new Error('unsupported-xml-syntax: unterminated attribute');
      attributes.push({ name: attrName, value: getDecodedXML(source.slice(valueStart, cursor)), start: valueStart, end: cursor, quote });
      cursor++;
    }
    const empty = source.startsWith('/>', cursor), openEnd = cursor + (empty ? 2 : 1);
    if (openEnd > source.length || (!empty && source[cursor] !== '>')) throw new Error('unsupported-xml-syntax: unterminated tag');
    const namespaces = new Map(stack.at(-1)?.namespaces);
    for (const attr of attributes) {
      if (attr.name === 'xmlns') namespaces.set('', attr.value);
      else if (attr.name.startsWith('xmlns:')) namespaces.set(attr.name.slice(6), attr.value);
    }
    const colon = name.indexOf(':'), prefix = colon < 0 ? '' : name.slice(0, colon), local = colon < 0 ? name : name.slice(colon + 1);
    const parent = stack.at(-1)?.index ?? null;
    const element: XMLElement = { name, local, uri: namespaces.get(prefix) ?? (prefix ? `unbound:${prefix}` : ''), start, openEnd, closeStart: cursor, end: openEnd, empty, parent, attributes, children: [] };
    const index = elements.length;
    elements.push(element);
    if (parent !== null) elements[parent].children.push(index);
    if (!empty) stack.push({ index, namespaces });
    position = openEnd;
  }
  if (stack.length) throw new Error('unsupported-xml-syntax: unclosed tag');
  return elements;
}

function getXMLAttribute(element: XMLElement, name: string): XMLAttribute | undefined {
  return element.attributes.find((attribute) => attribute.name === name);
}

function isCoreXML(element: XMLElement, format: 'graphml' | 'gexf'): boolean {
  return !element.uri || (format === 'graphml' ? element.uri === 'http://graphml.graphdrawing.org/xmlns'
    : ['http://gexf.net/1.3', 'http://gexf.net/1.2draft', 'http://www.gexf.net/1.2draft'].includes(element.uri));
}

function getEncodedXML(value: string, quote?: string): string {
  // XML 1.0 characters, including rejection of lone UTF-16 surrogates.
  for (const character of value) {
    const code = character.codePointAt(0)!;
    if (!(code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 0xd7ff) || (code >= 0xe000 && code <= 0xfffd) || (code >= 0x10000 && code <= 0x10ffff))) throw new Error('invalid-native-label: label contains a character outside XML 1.0');
  }
  const escaped = value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\r/g, '&#13;').replace(quote === "'" ? /'/g : /"/g, quote === "'" ? '&apos;' : '&quot;');
  return quote ? escaped.replace(/[\t\n]/g, (character) => character === '\t' ? '&#9;' : '&#10;') : escaped;
}

function getUnsupported(change: GraphDocumentChange, message: string): GraphDocumentPatchResult<string> {
  return { ok: false, diagnostics: [{ code: 'unsupported-native-edit', message, path: change.path, severity: 'error' }] };
}

function getLabelChangeError(changes: GraphDocumentChange[]): GraphDocumentPatchResult<string> | undefined {
  for (const change of changes) {
    if ((change.entity !== 'node' && change.entity !== 'edge') || change.field !== 'label' || !change.afterPresent || typeof change.after !== 'string') {
      return getUnsupported(change, 'Only string node/edge label edits have verified native spans; structure, data, geometry and nullable labels require explicit regeneration');
    }
  }
  return undefined;
}

function getEditedSource(source: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((left, right) => right.start - left.start || right.end - left.end);
  let boundary = source.length;
  const chunks: string[] = [];
  for (const edit of sorted) {
    if (edit.start < 0 || edit.end < edit.start || edit.end > boundary) throw new Error('unsupported-native-edit: overlapping or invalid native spans');
    chunks.push(source.slice(edit.end, boundary), edit.text);
    boundary = edit.start;
  }
  chunks.push(source.slice(0, boundary));
  return chunks.reverse().join('');
}

/** Preserve native source separately from the explicitly partial binary projection. */
export function getXMLDocumentProjection(source: string, format: 'graphml' | 'gexf', from: (source: string) => Graph): GraphDocumentProjection {
  const elements = getXMLElements(source);
  const roots = elements.filter((element) => element.parent === null && isCoreXML(element, format));
  const root = roots.find((element) => element.local === (format === 'graphml' ? 'graphml' : 'gexf'));
  const count = root?.children.filter((index) => elements[index].local === 'graph' && isCoreXML(elements[index], format)).length ?? 0;
  if (count > 1 && format === 'gexf') return { graph: null, diagnostics: [{ code: 'projection-unavailable', message: 'Multiple GEXF graphs have no single binary projection; every native graph remains preserved', severity: 'warning' }] };
  const graph = from(source);
  return { graph, diagnostics: [{ code: count > 1 ? 'projection-multiple-graphs' : 'projection-partial', message: count > 1 ? 'Only the first graph is projected; every native graph remains in the preserved source' : 'The Graph view is partial; comments, extensions and unmodeled semantics remain in native source', severity: 'warning' }] };
}

/** Patch only unambiguous native literal labels; the document core proves reparsed semantics. */
export function getXMLDocumentPatch(context: GraphDocumentPatchContext<string>, format: 'graphml' | 'gexf'): GraphDocumentPatchResult<string> {
  const invalid = getLabelChangeError(context.changes);
  if (invalid) return invalid;
  const elements = getXMLElements(context.source);
  const rootIndex = elements.findIndex((element) => element.parent === null && element.local === (format === 'graphml' ? 'graphml' : 'gexf') && isCoreXML(element, format));
  if (rootIndex < 0) return getUnsupported(context.changes[0], 'Cannot locate the native root');
  const graphIndex = elements[rootIndex].children.find((index) => elements[index].local === 'graph' && isCoreXML(elements[index], format));
  if (graphIndex === undefined) return getUnsupported(context.changes[0], 'Cannot locate the projected graph');
  const selected = new Set<number>();
  if (format === 'graphml') {
    const pending = [graphIndex];
    while (pending.length) {
      const index = pending.pop()!;
      for (const childIndex of elements[index].children) {
        const child = elements[childIndex];
        if (!isCoreXML(child, format) || !['node', 'edge'].includes(child.local)) continue;
        selected.add(childIndex);
        if (child.local === 'node') for (const nested of child.children) {
          if (elements[nested].local === 'graph' && isCoreXML(elements[nested], format)) pending.push(nested);
        }
      }
    }
  } else {
    const pending = [graphIndex];
    while (pending.length) {
      const owner = pending.pop()!;
      const wrappers = elements[owner].children.filter((index) => elements[index].local === 'nodes' && isCoreXML(elements[index], format));
      const wrapped = wrappers.length === 1 ? elements[wrappers[0]].children.filter((index) => elements[index].local === 'node' && isCoreXML(elements[index], format)) : [];
      const nodes = wrapped.length ? wrapped : elements[owner].children.filter((index) => elements[index].local === 'node' && isCoreXML(elements[index], format));
      for (const index of nodes) { selected.add(index); pending.push(index); }
    }
    const wrappers = elements[graphIndex].children.filter((index) => elements[index].local === 'edges' && isCoreXML(elements[index], format));
    const wrapped = wrappers.length === 1 ? elements[wrappers[0]].children.filter((index) => elements[index].local === 'edge' && isCoreXML(elements[index], format)) : [];
    for (const index of wrapped.length ? wrapped : elements[graphIndex].children.filter((index) => elements[index].local === 'edge' && isCoreXML(elements[index], format))) selected.add(index);
  }
  const keys = elements[rootIndex].children.map((index) => elements[index]).filter((element) => element.local === 'key' && isCoreXML(element, format));
  const edits: TextEdit[] = [];
  for (const change of context.changes) {
    const matches = [...selected].map((index) => elements[index]).filter((element) => element.local === change.entity && isCoreXML(element, format) && getXMLAttribute(element, 'id')?.value === change.id);
    if (matches.length !== 1) return getUnsupported(change, 'A unique explicit native entity ID is required for label edits');
    const element = matches[0], label = change.after as string;
    try { getEncodedXML(label); }
    catch (error) { return { ok: false, diagnostics: [{ code: 'invalid-native-label', message: error instanceof Error ? error.message : String(error), path: change.path, severity: 'error' }] }; }
    if (format === 'gexf') {
      const attribute = getXMLAttribute(element, 'label');
      const text = getEncodedXML(label, attribute?.quote ?? '"');
      edits.push(attribute ? { start: attribute.start, end: attribute.end, text }
        : { start: element.openEnd - (element.empty ? 2 : 1), end: element.openEnd - (element.empty ? 2 : 1), text: ` label="${text}"` });
      continue;
    }
    const definitions = keys.filter((key) => (getXMLAttribute(key, 'attr.name')?.value ?? getXMLAttribute(key, 'id')?.value) === 'label' && ['all', change.entity].includes(getXMLAttribute(key, 'for')?.value ?? 'all'));
    const labelKeys = new Set(definitions.map((key) => getXMLAttribute(key, 'id')?.value));
    // Legacy key="label" without a declaration remains accepted by the bare importer.
    if (!keys.some((key) => getXMLAttribute(key, 'id')?.value === 'label')) labelKeys.add('label');
    const data = element.children.map((index) => elements[index]).filter((child) => child.local === 'data' && isCoreXML(child, format) && labelKeys.has(getXMLAttribute(child, 'key')?.value));
    if (!data.length) {
      const compatible = definitions.filter((key) => ['string', undefined].includes(getXMLAttribute(key, 'attr.type')?.value));
      if (compatible.length !== 1 || !getXMLAttribute(compatible[0], 'id')) return getUnsupported(change, 'A missing GraphML label requires one existing scoped string label key');
      const prefix = element.name.includes(':') ? element.name.slice(0, element.name.indexOf(':') + 1) : '';
      const text = `<${prefix}data key="${getEncodedXML(getXMLAttribute(compatible[0], 'id')!.value, '"')}">${getEncodedXML(label)}</${prefix}data>`;
      if (element.empty) edits.push({ start: element.openEnd - 2, end: element.openEnd, text: `>${text}</${element.name}>` });
      else {
        const afterData = element.children.map((index) => elements[index]).find((child) => ['port', 'graph'].includes(child.local) && isCoreXML(child, format));
        const position = afterData?.start ?? element.closeStart;
        edits.push({ start: position, end: position, text });
      }
      continue;
    }
    if (data.length !== 1) return getUnsupported(change, 'Duplicate GraphML label data cannot be safely patched');
    const definition = keys.find((key) => getXMLAttribute(key, 'id')?.value === getXMLAttribute(data[0], 'key')?.value);
    if (definition && !['string', undefined].includes(getXMLAttribute(definition, 'attr.type')?.value)) return getUnsupported(change, 'GraphML label key must have string type');
    const item = data[0], content = context.source.slice(item.openEnd, item.closeStart);
    if (item.empty) {
      edits.push({ start: item.openEnd - 2, end: item.openEnd, text: `>${getEncodedXML(label)}</${item.name}>` });
      continue;
    }
    if (item.children.length || content.includes('<')) return getUnsupported(change, 'GraphML label content must be plain text; CDATA/mixed XML labels are retained but cannot be safely edited');
    edits.push({ start: item.openEnd, end: item.closeStart, text: getEncodedXML(label) });
  }
  return { ok: true, source: getEditedSource(context.source, edits) };
}

export type { TextEdit };
export { getLabelChangeError, getUnsupported, getEditedSource };
export { getXMLElements, getDecodedXML, getXMLAttribute, getEncodedXML };
export type { XMLElement, XMLAttribute };
