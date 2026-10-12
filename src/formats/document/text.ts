import type { Graph } from '../../types';
import type { GraphDocumentPatchContext, GraphDocumentPatchResult } from './index';

export interface GraphDocumentTextSpan { entity: 'node' | 'edge'; id: string; start: number; end: number; encode(value: string): string }

/** Lexical line offsets; delimiters inside strings never become comments. */
export function getGraphDocumentTextLines(source: string, comment: '#' | '%%'): Array<{ text: string; start: number }> {
  const lines: Array<{ text: string; start: number }> = [];
  let offset = 0;
  let frontmatter = false;
  let first = true;
  for (const full of source.match(/[^\n]*(?:\n|$)/g) ?? []) {
    if (!full) continue;
    const line = full.replace(/\r?\n$/, '');
    if (comment === '%%' && ((first && line.trim() === '---') || (frontmatter && line.trim() === '---'))) {
      frontmatter = !frontmatter;
      first = false;
      offset += full.length;
      continue;
    }
    first = false;
    if (frontmatter) { offset += full.length; continue; }
    let quote = '';
    let depth = 0;
    let end = line.length;
    for (let index = 0; index < line.length; index++) {
      const char = line[index];
      let slashes = 0;
      for (let at = index - 1; at >= 0 && line[at] === '\\'; at--) slashes++;
      if (quote) { if (char === quote && slashes % 2 === 0) quote = ''; continue; }
      if (char === '"' || char === "'" || char === '`') { quote = char; continue; }
      if ('[{('.includes(char)) depth++;
      if (']})'.includes(char)) depth--;
      if (depth === 0 && line.startsWith(comment, index)) { end = index; break; }
    }
    const trimmed = line.slice(0, end).trim();
    if (trimmed) lines.push({ text: trimmed, start: offset + line.indexOf(trimmed) });
    offset += full.length;
  }
  return lines;
}

/** Apply uniquely resolved lexical spans; unchanged bytes are copied verbatim. */
export function getGraphDocumentTextPatch<TGraph extends Graph>(context: GraphDocumentPatchContext<string, TGraph>, spans: GraphDocumentTextSpan[]): GraphDocumentPatchResult<string> {
  const byEntity = new Map<string, GraphDocumentTextSpan[]>();
  for (const span of spans) {
    const key = `${span.entity}\0${span.id}`;
    const entries = byEntity.get(key) ?? [];
    entries.push(span); byEntity.set(key, entries);
  }
  const replacements: Array<{ start: number; end: number; value: string }> = [];
  for (const change of context.changes) {
    if (change.entity === 'graph' || change.field !== 'label' || !change.afterPresent || typeof change.after !== 'string') return { ok: false, diagnostics: [{ code: 'unsupported-edit', message: 'This text adapter supports uniquely declared string labels only', path: change.path, severity: 'error' }] };
    const candidates = byEntity.get(`${change.entity}\0${change.id}`) ?? [];
    if (candidates.length !== 1) return { ok: false, diagnostics: [{ code: 'unsupported-edit', message: 'Label has no unique supported lexical span; edit document.source instead', path: change.path, severity: 'error' }] };
    const span = candidates[0];
    replacements.push({ start: span.start, end: span.end, value: span.encode(change.after) });
  }
  replacements.sort((a, b) => a.start - b.start);
  let output = '';
  let offset = 0;
  for (const replacement of replacements) {
    if (replacement.start < offset) return { ok: false, diagnostics: [{ code: 'unsupported-edit', message: 'Overlapping source spans prevent a safe edit', severity: 'error' }] };
    output += context.source.slice(offset, replacement.start) + replacement.value;
    offset = replacement.end;
  }
  return { ok: true, source: output + context.source.slice(offset) };
}
