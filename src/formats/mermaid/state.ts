import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import {
  validateInput,
  prepareLines,
  escapeMermaidLabel,
  unescapeMermaidLabel,
  generateEdgeId,
} from './shared';

// --- Types ---

export interface StateNodeData {
  description?: string;
  stateType?: 'choice' | 'fork' | 'join';
  // TODO: notes are stored but not round-trippable as separate graph entities
  notes?: Array<{ position: 'left' | 'right'; text: string }>;
  isStart?: boolean;
  isEnd?: boolean;
}

export interface StateEdgeData {}

export interface StateGraphData {
  diagramType: 'stateDiagram';
}

type StateGraph = Graph<StateNodeData, StateEdgeData, StateGraphData>;
type StateNode = GraphNode<StateNodeData>;
type StateEdge = GraphEdge<StateEdgeData>;

// --- Parser ---

/**
 * Parses a Mermaid state diagram string into a Graph.
 *
 * @example
 * const graph = fromMermaidState(`
 * stateDiagram-v2
 *     [*] --> Idle
 *     Idle --> Running : start
 *     Running --> [*]
 * `);
 */
export function fromMermaidState(input: string): StateGraph {
  validateInput(input, 'Mermaid state');
  const { lines } = prepareLines(input);

  const header = lines[0]?.trim();
  if (
    !header ||
    (!header.startsWith('stateDiagram-v2') && !header.startsWith('stateDiagram'))
  ) {
    throw new Error(
      'Mermaid state: expected "stateDiagram" or "stateDiagram-v2" header',
    );
  }

  const nodeMap = new Map<string, StateNode>();
  const edges: StateEdge[] = [];
  let edgeCounter = 0;
  let startCounter = 0;
  let endCounter = 0;

  // Parent stack for composite states
  const parentStack: (string | null)[] = [null];

  function ensureNode(id: string): StateNode {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        type: 'node',
        id,
        parentId: parentStack[parentStack.length - 1],
        initialNodeId: null,
        label: id, // stateId IS the label
        data: {},
      });
    }
    return nodeMap.get(id)!;
  }

  // Resolve [*] to a start or end pseudo-node depending on position
  function resolveStarNode(position: 'source' | 'target'): string {
    if (position === 'source') {
      const id = `[*]_start_${startCounter++}`;
      const node = ensureNode(id);
      node.label = '[*]';
      node.data.isStart = true;
      (node as any).shape = 'start';
      return id;
    } else {
      const id = `[*]_end_${endCounter++}`;
      const node = ensureNode(id);
      node.label = '[*]';
      node.data.isEnd = true;
      (node as any).shape = 'end';
      return id;
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // direction inside composite state — skip
    if (/^direction\s+(TD|TB|BT|LR|RL)\s*$/.test(line)) continue;

    // Composite state: state stateId {
    const compositeMatch = line.match(/^state\s+(\S+)\s*\{?\s*$/);
    if (compositeMatch && line.includes('{')) {
      const stateId = compositeMatch[1];
      ensureNode(stateId);
      parentStack.push(stateId);
      continue;
    }

    // State with stereotype: state stateId <<choice>>
    const stereotypeMatch = line.match(
      /^state\s+(\S+)\s+<<(choice|fork|join)>>\s*$/,
    );
    if (stereotypeMatch) {
      const stateId = stereotypeMatch[1];
      const stateType = stereotypeMatch[2] as 'choice' | 'fork' | 'join';
      const node = ensureNode(stateId);
      node.data.stateType = stateType;
      (node as any).shape = stateType;
      continue;
    }

    // State with description: state "description" as stateId
    const stateAsMatch = line.match(/^state\s+"([^"]+)"\s+as\s+(\S+)\s*$/);
    if (stateAsMatch) {
      const description = stateAsMatch[1];
      const stateId = stateAsMatch[2];
      const node = ensureNode(stateId);
      node.data.description = description;
      continue;
    }

    // End of composite state
    if (line === '}' || line === 'end') {
      if (parentStack.length > 1) parentStack.pop();
      continue;
    }

    // Note
    // TODO: notes stored on nodeData but not fully round-trippable
    const noteMatch = line.match(
      /^note\s+(left|right)\s+of\s+(\S+)\s*:\s*(.+)$/i,
    );
    if (noteMatch) {
      const position = noteMatch[1].toLowerCase() as 'left' | 'right';
      const stateId = noteMatch[2];
      const text = noteMatch[3].trim();
      const node = ensureNode(stateId);
      if (!node.data.notes) node.data.notes = [];
      node.data.notes.push({ position, text });
      continue;
    }

    // Transition: A --> B or A --> B : label or [*] --> A
    const transMatch = line.match(
      /^(\S+)\s*-->\s*(\S+)\s*(?::\s*(.+))?$/,
    );
    if (transMatch) {
      let sourceId = transMatch[1];
      let targetId = transMatch[2];
      const label = transMatch[3]?.trim() ?? '';

      // Handle [*]
      if (sourceId === '[*]') {
        sourceId = resolveStarNode('source');
      } else {
        ensureNode(sourceId);
      }

      if (targetId === '[*]') {
        targetId = resolveStarNode('target');
      } else {
        ensureNode(targetId);
      }

      const edgeId = generateEdgeId(sourceId, targetId, edgeCounter++);
      edges.push({
        type: 'edge',
        id: edgeId,
        sourceId,
        targetId,
        label: label ? unescapeMermaidLabel(label) : '',
        data: {},
      });
      continue;
    }

    // Simple state with description: stateId : description
    const descMatch = line.match(/^(\S+)\s*:\s*(.+)$/);
    if (descMatch) {
      const stateId = descMatch[1];
      const description = descMatch[2].trim();
      const node = ensureNode(stateId);
      node.data.description = description;
      continue;
    }

    // Bare state name
    if (/^[a-zA-Z_][\w]*$/.test(line)) {
      ensureNode(line);
      continue;
    }
  }

  return {
    id: '',
    type: 'directed',
    initialNodeId: null,
    nodes: Array.from(nodeMap.values()),
    edges,
    data: { diagramType: 'stateDiagram' },
  };
}

// --- Serializer ---

/**
 * Converts a state diagram Graph to a Mermaid state diagram string.
 *
 * @example
 * const mermaid = toMermaidState(graph);
 * // "stateDiagram-v2\n    [*] --> Idle\n    ..."
 */
export function toMermaidState(graph: StateGraph): string {
  const lines: string[] = ['stateDiagram-v2'];

  // Build children map
  const childrenMap = new Map<string | null, StateNode[]>();
  for (const node of graph.nodes) {
    const pid = node.parentId ?? null;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(node);
  }

  const isParent = new Set<string>();
  for (const node of graph.nodes) {
    if (childrenMap.has(node.id)) isParent.add(node.id);
  }

  function writeNodes(parentId: string | null, indent: string) {
    const children = childrenMap.get(parentId) ?? [];
    for (const node of children) {
      // Skip start/end pseudo-nodes (emitted inline in transitions)
      if (node.data?.isStart || node.data?.isEnd) continue;

      if (node.data?.stateType) {
        lines.push(`${indent}state ${node.id} <<${node.data.stateType}>>`);
      }

      if (node.data?.description) {
        lines.push(
          `${indent}state "${escapeMermaidLabel(node.data.description)}" as ${node.id}`,
        );
      }

      if (isParent.has(node.id)) {
        lines.push(`${indent}state ${node.id} {`);
        writeNodes(node.id, indent + '    ');
        lines.push(`${indent}}`);
      }

      // Emit notes
      if (node.data?.notes) {
        for (const note of node.data.notes) {
          lines.push(
            `${indent}note ${note.position} of ${node.id} : ${escapeMermaidLabel(note.text)}`,
          );
        }
      }
    }
  }

  writeNodes(null, '    ');

  // Emit transitions
  for (const edge of graph.edges) {
    let sourceId = edge.sourceId;
    let targetId = edge.targetId;

    // Map start/end pseudo-nodes back to [*]
    const sourceNode = graph.nodes.find((n) => n.id === sourceId);
    const targetNode = graph.nodes.find((n) => n.id === targetId);
    if (sourceNode?.data?.isStart) sourceId = '[*]';
    if (targetNode?.data?.isEnd) targetId = '[*]';

    const label = edge.label
      ? ` : ${escapeMermaidLabel(edge.label)}`
      : '';
    lines.push(`    ${sourceId} --> ${targetId}${label}`);
  }

  return lines.join('\n');
}

/**
 * Bidirectional converter for Mermaid state diagram format.
 *
 * @example
 * const graph = mermaidStateConverter.from(`
 * stateDiagram-v2
 *     [*] --> Active
 * `);
 * const str = mermaidStateConverter.to(graph);
 */
export const mermaidStateConverter: GraphFormatConverter<string> =
  createFormatConverter(
    toMermaidState as (graph: Graph) => string,
    fromMermaidState,
  );
