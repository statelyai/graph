import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import {
  validateInput,
  prepareLines,
  escapeMermaidLabel,
  generateEdgeId,
} from './shared';

// --- Types ---

export interface IshikawaNodeData {
  kind: 'effect' | 'cause';
}

export interface IshikawaEdgeData {}

export interface IshikawaGraphData {
  diagramType: 'ishikawa';
}

export type MermaidIshikawaGraph = Graph<
  IshikawaNodeData,
  IshikawaEdgeData,
  IshikawaGraphData
>;
type IshikawaNode = GraphNode<IshikawaNodeData>;

// --- Parser ---

/**
 * Parses a Mermaid Ishikawa diagram string into a Graph.
 *
 * @example
 * const graph = fromMermaidIshikawa(`
 * ishikawa-beta
 * Problem
 *     Cause
 *         Sub-cause
 * `);
 */
export function fromMermaidIshikawa(input: string): MermaidIshikawaGraph {
  validateInput(input, 'Mermaid Ishikawa');
  const { lines } = prepareLines(input);

  const header = lines[0]?.trim();
  if (!header || !header.startsWith('ishikawa-beta')) {
    throw new Error('Mermaid Ishikawa: expected "ishikawa-beta" header');
  }

  const nodes: IshikawaNode[] = [];
  const edges: GraphEdge<IshikawaEdgeData>[] = [];
  const stack: { id: string; indent: number }[] = [];
  let nodeCounter = 0;
  let edgeCounter = 0;

  for (let i = 1; i < lines.length; i++) {
    const rawLine = lines[i];
    if (!rawLine.trim()) continue;

    const indent = rawLine.length - rawLine.trimStart().length;
    const label = rawLine.trim();
    const id = `ish_${nodeCounter++}`;

    while (stack.length > 0 && stack[stack.length - 1].indent >= indent) {
      stack.pop();
    }

    const parent = stack[stack.length - 1];
    const node: IshikawaNode = {
      type: 'node',
      id,
      parentId: parent?.id ?? null,
      initialNodeId: null,
      label,
      data: { kind: parent ? 'cause' : 'effect' },
    };

    if (parent) {
      edges.push({
        type: 'edge',
        id: generateEdgeId(parent.id, id, edgeCounter++),
        sourceId: parent.id,
        targetId: id,
        label: '',
        data: {},
      });
    }

    nodes.push(node);
    stack.push({ id, indent });
  }

  return {
    id: '',
    mode: 'directed',
    initialNodeId: null,
    nodes,
    edges,
    data: { diagramType: 'ishikawa' },
  };
}

// --- Serializer ---

/**
 * Converts an Ishikawa Graph to a Mermaid Ishikawa diagram string.
 *
 * @example
 * const mermaid = toMermaidIshikawa(graph);
 * // "ishikawa-beta\nProblem\n    Cause"
 */
export function toMermaidIshikawa(graph: MermaidIshikawaGraph): string {
  const lines: string[] = ['ishikawa-beta'];

  const childrenMap = new Map<string | null, IshikawaNode[]>();
  for (const node of graph.nodes) {
    const parentId = node.parentId ?? null;
    const children = childrenMap.get(parentId) ?? [];
    children.push(node);
    childrenMap.set(parentId, children);
  }

  const addIshikawaNodes = (parentId: string | null, depth: number) => {
    for (const node of childrenMap.get(parentId) ?? []) {
      const indent = '    '.repeat(depth);
      lines.push(`${indent}${escapeMermaidLabel(node.label ?? node.id)}`);
      addIshikawaNodes(node.id, depth + 1);
    }
  };

  addIshikawaNodes(null, 0);
  return lines.join('\n');
}

/**
 * Bidirectional converter for Mermaid Ishikawa diagram format.
 *
 * @example
 * const graph = mermaidIshikawaConverter.from(`
 * ishikawa-beta
 * Problem
 *     Cause
 * `);
 * const str = mermaidIshikawaConverter.to(graph);
 */
export const mermaidIshikawaConverter: GraphFormatConverter<
  string, IshikawaNodeData, IshikawaEdgeData, IshikawaGraphData
> = createFormatConverter(toMermaidIshikawa, fromMermaidIshikawa);
