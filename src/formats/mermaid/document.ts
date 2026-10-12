import { createGraphDocumentConverter } from '../document';
import { getGraphDocumentTextLines, getGraphDocumentTextPatch, type GraphDocumentTextSpan } from '../document/text';
import { fromMermaidFlowchart, toMermaidFlowchart } from './flowchart';
import { fromMermaidState, toMermaidState } from './state';
import { fromMermaidSequence, toMermaidSequence } from './sequence';
import { fromMermaidClass, toMermaidClass } from './class-diagram';
import { fromMermaidER, toMermaidER } from './er-diagram';
import { fromMermaidBlock, toMermaidBlock } from './block';
import { fromMermaidMindmap, toMermaidMindmap } from './mindmap';
import { fromMermaidIshikawa, toMermaidIshikawa } from './ishikawa';
import { escapeMermaidLabel } from './shared';

export const mermaidFlowchartDocumentConverter = createGraphDocumentConverter({
  format: 'mermaid/flowchart', codec: { from: fromMermaidFlowchart, to: toMermaidFlowchart },
  project(source) {
    const graph = fromMermaidFlowchart(source);
    // Expanded syntax repeats the native label; expose one editable label field.
    for (const node of graph.nodes) if (node.data.properties) delete node.data.properties.label;
    return { graph };
  },
  patch(context) {
    const spans: GraphDocumentTextSpan[] = [];
    const nodesById = new Map(context.sourceGraph.nodes.map((node) => [node.id, node]));
    for (const line of getGraphDocumentTextLines(context.source, '%%')) {
      const match = line.text.match(/^([A-Za-z_][\w-]*)\s*(\[|\{|\()(.*)(\]|\}|\))$/);
      if (!match || ({ '[': ']', '{': '}', '(': ')' } as Record<string, string>)[match[2]] !== match[4]) continue;
      const probe = fromMermaidFlowchart(`flowchart TD\n${line.text}`);
      const node = nodesById.get(match[1]);
      if (probe.nodes.length !== 1 || !node || probe.nodes[0].label !== node.label) continue;
      const relative = line.text.indexOf(match[2]) + 1;
      spans.push({ entity: 'node', id: node.id, start: line.start + relative, end: line.start + line.text.length - 1, encode: (value) => `"${escapeMermaidLabel(value)}"` });
    }
    return getGraphDocumentTextPatch(context, spans);
  },
});

export const mermaidStateDocumentConverter = createGraphDocumentConverter({
  format: 'mermaid/state', codec: { from: fromMermaidState, to: toMermaidState },
  project(source) {
    const graph = fromMermaidState(source);
    for (const node of graph.nodes) delete node.data.description;
    return { graph };
  },
  patch(context) {
    const spans: GraphDocumentTextSpan[] = [];
    const nodesById = new Map(context.sourceGraph.nodes.map((node) => [node.id, node]));
    for (const line of getGraphDocumentTextLines(context.source, '%%')) {
      const match = line.text.match(/^state\s+"([^"\n]*)"\s+as\s+([A-Za-z_][\w-]*)(?:\s*\{|\s+<<(?:choice|fork|join)>>)?$/);
      if (!match) continue;
      const node = nodesById.get(match[2]);
      const probe = fromMermaidState(`stateDiagram-v2\n${line.text}${line.text.endsWith('{') ? '\n}' : ''}`);
      if (!node || probe.nodes[0]?.label !== node.label) continue;
      const relative = line.text.indexOf('"') + 1;
      spans.push({ entity: 'node', id: node.id, start: line.start + relative, end: line.start + relative + match[1].length, encode: escapeMermaidLabel });
    }
    return getGraphDocumentTextPatch(context, spans);
  },
});

export const mermaidSequenceDocumentConverter = createGraphDocumentConverter({
  format: 'mermaid/sequence', codec: { from: fromMermaidSequence, to: toMermaidSequence },
  project(source) {
    const graph = fromMermaidSequence(source);
    for (const node of graph.nodes) {
      delete node.data.alias;
      if (node.data.configuration) delete node.data.configuration.alias;
    }
    return { graph };
  },
  patch(context) {
    const spans: GraphDocumentTextSpan[] = [];
    const nodesById = new Map(context.sourceGraph.nodes.map((node) => [node.id, node]));
    const edgesByTuple = new Map<string, typeof context.sourceGraph.edges>();
    for (const edge of context.sourceGraph.edges) {
      if (edge.data.kind !== 'message') continue;
      const key = JSON.stringify([edge.sourceId, edge.targetId, edge.label]);
      const entries = edgesByTuple.get(key) ?? [];
      entries.push(edge); edgesByTuple.set(key, entries);
    }
    for (const line of getGraphDocumentTextLines(context.source, '%%')) {
      const participant = line.text.match(/^(?:participant|actor)\s+([A-Za-z_][\w-]*)\s+as\s+(.+)$/);
      if (participant) {
        const node = nodesById.get(participant[1]);
        const probe = fromMermaidSequence(`sequenceDiagram\n${line.text}`);
        if (node && probe.nodes[0]?.label === node.label) {
          const relative = line.text.lastIndexOf(participant[2]);
          spans.push({ entity: 'node', id: node.id, start: line.start + relative, end: line.start + line.text.length, encode: escapeMermaidLabel });
        }
        continue;
      }
      const message = line.text.match(/^([A-Za-z_][\w-]*)(?:<<-->>|<<->>|-->>|->>|-->|->|--x|-x|--\)|-\))([A-Za-z_][\w-]*)\s*:\s*(.*)$/);
      if (!message) continue;
      const probe = fromMermaidSequence(`sequenceDiagram\n${line.text}`);
      const candidates = edgesByTuple.get(JSON.stringify([message[1], message[2], probe.edges[0]?.label])) ?? [];
      if (candidates.length !== 1) continue;
      const relative = line.text.indexOf(':') + 1;
      const whitespace = line.text.slice(relative).match(/^\s*/)![0].length;
      spans.push({ entity: 'edge', id: candidates[0].id, start: line.start + relative + whitespace, end: line.start + line.text.length, encode: escapeMermaidLabel });
    }
    return getGraphDocumentTextPatch(context, spans);
  },
});

// All source is retained even when the ordinary graph projection is partial.
// These formats currently have no verified Graph-to-source patch policy.
export const mermaidClassDocumentConverter = createGraphDocumentConverter({ format: 'mermaid/class', codec: { from: fromMermaidClass, to: toMermaidClass } });
export const mermaidERDocumentConverter = createGraphDocumentConverter({ format: 'mermaid/er', codec: { from: fromMermaidER, to: toMermaidER } });
export const mermaidBlockDocumentConverter = createGraphDocumentConverter({ format: 'mermaid/block', codec: { from: fromMermaidBlock, to: toMermaidBlock } });
export const mermaidMindmapDocumentConverter = createGraphDocumentConverter({ format: 'mermaid/mindmap', codec: { from: fromMermaidMindmap, to: toMermaidMindmap } });
export const mermaidIshikawaDocumentConverter = createGraphDocumentConverter({ format: 'mermaid/ishikawa', codec: { from: fromMermaidIshikawa, to: toMermaidIshikawa } });

import { fromMermaidArchitecture, toMermaidArchitecture } from './architecture';
import { fromMermaidRequirement, toMermaidRequirement } from './requirement';
import { fromMermaidSankey, toMermaidSankey } from './sankey';
import { fromMermaidGitGraph, toMermaidGitGraph } from './git-graph';
import { fromMermaidC4, toMermaidC4 } from './c4';
import { fromMermaidUseCase, toMermaidUseCase } from './use-case';
import { unescapeMermaidId } from './shared';
import { getMermaidProfileText, toMermaidProfileText } from './profile-shared';

export const mermaidArchitectureDocumentConverter = createGraphDocumentConverter({
  format: 'mermaid/architecture', codec: { from: fromMermaidArchitecture, to: toMermaidArchitecture },
  patch(context) {
    const spans: GraphDocumentTextSpan[] = [];
    for (const line of getGraphDocumentTextLines(context.source, '%%')) {
      const match = line.text.match(/^(?:group|service)\s+([A-Za-z0-9_]+)(?:\([^)]*\))?\[([^\]]*)\]/);
      if (!match) continue;
      const start = line.text.indexOf('[') + 1;
      spans.push({ entity: 'node', id: unescapeMermaidId(match[1]), start: line.start + start, end: line.start + start + match[2].length, encode: toMermaidProfileText });
    }
    return getGraphDocumentTextPatch(context, spans);
  },
});
export const mermaidRequirementDocumentConverter = createGraphDocumentConverter({
  format: 'mermaid/requirement', codec: { from: fromMermaidRequirement, to: toMermaidRequirement },
  patch(context) {
    const spans: GraphDocumentTextSpan[] = []; let id: string | undefined;
    for (const line of getGraphDocumentTextLines(context.source, '%%')) {
      const declaration = line.text.match(/^(?:requirement|functionalRequirement|interfaceRequirement|performanceRequirement|physicalRequirement|designConstraint)\s+("[^"\n]*"|[^\s{}]+)\s*\{$/);
      if (declaration) { id = getMermaidProfileText(declaration[1]); continue; }
      if (line.text === '}') { id = undefined; continue; }
      const field = line.text.match(/^text\s*:\s*(.*)$/);
      if (id !== undefined && field) {
        spans.push({ entity: 'node', id, start: line.start, end: line.start + line.text.length, encode: (value) => value ? `text: "${toMermaidProfileText(value)}"` : '' });
      }
    }
    return getGraphDocumentTextPatch(context, spans);
  },
});
export const mermaidC4DocumentConverter = createGraphDocumentConverter({
  format: 'mermaid/c4', codec: { from: fromMermaidC4, to: toMermaidC4 },
  patch(context) {
    const spans: GraphDocumentTextSpan[] = [];
    const ids = new Set(context.sourceGraph.nodes.map((node) => node.id));
    for (const line of getGraphDocumentTextLines(context.source, '%%')) {
      const match = line.text.match(/^([A-Za-z_]+)\(\s*([A-Za-z0-9_]+)\s*,\s*("[^"\n]*"|[^,)]*)/);
      if (!match || match[1].startsWith('Rel') || !ids.has(unescapeMermaidId(match[2]))) continue;
      const start = match[0].length - match[3].length;
      spans.push({ entity: 'node', id: unescapeMermaidId(match[2]), start: line.start + start, end: line.start + start + match[3].length, encode: (value) => `"${toMermaidProfileText(value)}"` });
    }
    return getGraphDocumentTextPatch(context, spans);
  },
});
export const mermaidUseCaseDocumentConverter = createGraphDocumentConverter({
  format: 'mermaid/usecase', codec: { from: fromMermaidUseCase, to: toMermaidUseCase },
  patch(context) {
    const spans: GraphDocumentTextSpan[] = [];
    for (const line of getGraphDocumentTextLines(context.source, '%%')) {
      const match = line.text.match(/^(?:actor\s+|systemBoundary\s+)?([A-Za-z0-9_]+)(?:\(("[^"\n]*"|[^()]*)\)|\[("[^"\n]*"|[^\[\]]*)\])/);
      if (!match) continue;
      const text = match[2] ?? match[3]; const start = match[0].length - text.length - 1;
      spans.push({ entity: 'node', id: unescapeMermaidId(match[1]), start: line.start + start, end: line.start + start + text.length, encode: (value) => `"${toMermaidProfileText(value)}"` });
    }
    return getGraphDocumentTextPatch(context, spans);
  },
});
export const mermaidSankeyDocumentConverter = createGraphDocumentConverter({ format: 'mermaid/sankey', codec: { from: fromMermaidSankey, to: toMermaidSankey } });
export const mermaidGitGraphDocumentConverter = createGraphDocumentConverter({ format: 'mermaid/gitgraph', codec: { from: fromMermaidGitGraph, to: toMermaidGitGraph } });
