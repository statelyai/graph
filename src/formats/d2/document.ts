import { createGraphDocumentConverter } from '../document';
import { getGraphDocumentTextLines, getGraphDocumentTextPatch, type GraphDocumentTextSpan } from '../document/text';
import { fromD2 } from './parser';
import { toD2 } from './emitter';
import { getD2ScalarString } from './shared';

/** Exact source retention; bounded flat declaration labels can be patched safely. */
export const d2DocumentConverter = createGraphDocumentConverter({
  format: 'd2', codec: { from: fromD2, to: toD2 },
  project(source) {
    const graph = fromD2(source);
    // These are importer-created quote caches; the native source owns their bytes.
    for (const entity of [...graph.nodes, ...graph.edges]) {
      delete entity.data.labelSource;
      delete entity.data.sourceLabel;
    }
    return { graph };
  },
  patch(context) {
    const spans: GraphDocumentTextSpan[] = [];
    const nodesById = new Map(context.sourceGraph.nodes.map((node) => [node.id, node]));
    let depth = 0;
    for (const line of getGraphDocumentTextLines(context.source, '#')) {
      if (depth === 0) {
        const match = line.text.match(/^([A-Za-z_][\w-]*)\s*:\s*("(?:[^"\\]|\\.)*"|'[^']*'|[^{};]+)$/);
        if (match) {
          const probe = fromD2(line.text);
          const node = nodesById.get(match[1]);
          if (probe.nodes.length === 1 && node && probe.nodes[0].label === node.label) {
            const relative = line.text.lastIndexOf(match[2]);
            spans.push({ entity: 'node', id: node.id, start: line.start + relative, end: line.start + relative + match[2].length, encode: (value) => JSON.stringify(getD2ScalarString(value)) });
          }
        }
      }
      // Brace count is bounded to map syntax outside quoted literals.
      let quote = '';
      for (let i = 0; i < line.text.length; i++) {
        const char = line.text[i];
        let slashes = 0; for (let at = i - 1; at >= 0 && line.text[at] === '\\'; at--) slashes++;
        if (quote) { if (char === quote && slashes % 2 === 0) quote = ''; continue; }
        if (char === '"' || char === "'") { quote = char; continue; }
        if (char === '{') depth++; else if (char === '}') depth--;
      }
    }
    return getGraphDocumentTextPatch(context, spans);
  },
});
