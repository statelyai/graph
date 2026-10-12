import type { Graph, GraphNode } from '../../types';
import { prepareLines, validateInput, escapeMermaidLabel, unescapeMermaidLabel, type MermaidSourceData } from './shared';

export function getMermaidProfile(input: string, header: RegExp, name: string) {
  validateInput(input, `Mermaid ${name}`);
  const prepared = prepareLines(input);
  if (!header.test(prepared.lines[0]?.trim() ?? '')) throw new Error(`Mermaid ${name}: invalid header`);
  return prepared;
}
export function getMermaidProfileText(value: string): string {
  const text = value.trim();
  return unescapeMermaidLabel(text.startsWith('"') && text.endsWith('"') ? text.slice(1, -1) : text);
}
export function toMermaidProfileText(value: string): string {
  return escapeMermaidLabel(value).replace(/[()[\]{}%]/g, (char) => `#${char.charCodeAt(0)};`).replace(/^ +| +$/g, (spaces) => '#32;'.repeat(spaces.length));
}
export function getMermaidProfileArguments(value: string): string[] {
  const parts: string[] = [];
  let start = 0; let quote = false; let depth = 0;
  for (let index = 0; index < value.length; index++) {
    if (value[index] === '"') quote = !quote;
    if (quote) continue;
    if ('([{'.includes(value[index])) depth++;
    if (')]}'.includes(value[index])) depth--;
    if (value[index] === ',' && depth === 0) { parts.push(value.slice(start, index).trim()); start = index + 1; }
  }
  if (quote || depth) throw new Error('Mermaid: unbalanced argument syntax');
  parts.push(value.slice(start).trim());
  return parts;
}
export function getMermaidProfileGraph<N, E, G extends MermaidSourceData>(nodes: Graph<N, E, G>['nodes'], edges: Graph<N, E, G>['edges'], data: G): Graph<N, E, G> {
  const ids = new Set<string>();
  for (const node of nodes) {
    if (ids.has(node.id)) throw new Error(`Mermaid: duplicate node ${node.id}`);
    ids.add(node.id);
  }
  for (const node of nodes) if (node.parentId != null && !ids.has(node.parentId)) throw new Error(`Mermaid: missing parent ${node.parentId}`);
  for (const edge of edges) if (!ids.has(edge.sourceId) || !ids.has(edge.targetId)) throw new Error(`Mermaid: missing relationship endpoint ${edge.id}`);
  return { id: '', mode: 'directed', initialNodeId: null, nodes, edges, data };
}
export function getMermaidProfileOrderedNodes<N>(nodes: GraphNode<N>[]): GraphNode<N>[] {
  const ids = new Map(nodes.map((node) => [node.id, node]));
  if (ids.size !== nodes.length) throw new Error('Mermaid: duplicate node IDs');
  const children = new Map<string | null, GraphNode<N>[]>();
  for (const node of nodes) {
    const parent = node.parentId ?? null;
    if (parent !== null && !ids.has(parent)) throw new Error(`Mermaid: missing parent ${parent}`);
    const siblings = children.get(parent) ?? []; siblings.push(node); children.set(parent, siblings);
  }
  const result: GraphNode<N>[] = [];
  const stack = [...(children.get(null) ?? [])].reverse();
  while (stack.length) { const node = stack.pop()!; result.push(node); stack.push(...[...(children.get(node.id) ?? [])].reverse()); }
  if (result.length !== nodes.length) throw new Error('Mermaid: cyclic hierarchy');
  return result;
}

/** Reject non-JSON cell contents rather than letting JSON.stringify drop fields. */
export function getMermaidProfileJSON(value: unknown): string {
  const active = new Set<object>(); const stack: Array<{ value: any; exit?: boolean }> = [{ value }];
  while (stack.length) {
    const item = stack.pop()!; const entry = item.value;
    if (item.exit) { active.delete(entry); continue; }
    if (entry === null || typeof entry === 'string' || typeof entry === 'boolean' || typeof entry === 'number' && Number.isFinite(entry)) continue;
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry) && ![Object.prototype, null].includes(Object.getPrototypeOf(entry)) || Object.getOwnPropertySymbols(entry).length) throw new Error('Mermaid: JSON node requires plain finite JSON');
    if (active.has(entry)) throw new Error('Mermaid: cyclic JSON node');
    const keys = Object.keys(Object.getOwnPropertyDescriptors(entry)).filter((key) => !(Array.isArray(entry) && key === 'length'));
    if (Array.isArray(entry) && keys.length !== entry.length) throw new Error('Mermaid: sparse JSON array');
    active.add(entry); stack.push({ value: entry, exit: true });
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(entry, key)!;
      if (!descriptor.enumerable || !('value' in descriptor) || Array.isArray(entry) && !/^(?:0|[1-9]\d*)$/.test(key)) throw new Error('Mermaid: non-JSON property');
      stack.push({ value: descriptor.value });
    }
  }
  return JSON.stringify(value);
}
