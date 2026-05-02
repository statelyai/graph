import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import {
  validateInput,
  prepareLines,
  escapeMermaidLabel,
  unescapeMermaidLabel,
  generateEdgeId,
  MERMAID_TO_DIRECTION,
  DIRECTION_TO_MERMAID,
} from './shared';

// --- Types ---

export interface StateNodeData {
  description?: string;
  stateType?: 'choice' | 'fork' | 'join' | 'parallel';
  // TODO: notes are stored but not round-trippable as separate graph entities
  notes?: Array<{ position: 'left' | 'right'; text: string }>;
  isStart?: boolean;
  isEnd?: boolean;
  classes?: string[];
  direction?: 'up' | 'down' | 'left' | 'right';
}

export interface StateEdgeData {}

export interface StateGraphData {
  diagramType: 'stateDiagram';
  classDefs?: Record<string, Record<string, string>>;
}

export type MermaidStateGraph = Graph<StateNodeData, StateEdgeData, StateGraphData>;
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
export function fromMermaidState(input: string): MermaidStateGraph {
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

  let graphDirection: MermaidStateGraph['direction'] | undefined;
  const classDefs: Record<string, Record<string, string>> = {};
  const classAssignments: Record<string, string[]> = {};

  // Parent stack for composite states
  const parentStack: (string | null)[] = [null];

  // Track parallel region counters per composite parent
  const regionCounters = new Map<string, number>();

  function ensureNode(id: string): StateNode {
    const parentId = parentStack[parentStack.length - 1];
    const existing = nodeMap.get(id);
    if (existing) {
      if (parentId && existing.parentId === null && existing.id !== parentId) {
        existing.parentId = parentId;
      }
      return existing;
    }

    nodeMap.set(id, {
      type: 'node',
      id,
      parentId,
      initialNodeId: null,
      label: id, // stateId IS the label
      data: {},
    });
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

    // direction
    const dirMatch = line.match(/^direction\s+(TD|TB|BT|LR|RL)\s*$/);
    if (dirMatch) {
      const dir = MERMAID_TO_DIRECTION[dirMatch[1]];
      const currentParent = parentStack[parentStack.length - 1];
      if (currentParent) {
        // Inside composite state — store on the parent node
        const parentNode = nodeMap.get(currentParent);
        if (parentNode) parentNode.data.direction = dir;
      } else {
        // Top-level
        graphDirection = dir;
      }
      continue;
    }

    // Composite state: state stateId {
    const compositeMatch = line.match(/^state\s+(\S+)\s*\{?\s*$/);
    if (compositeMatch && line.includes('{')) {
      const stateId = compositeMatch[1];
      ensureNode(stateId);
      parentStack.push(stateId);
      continue;
    }

    // Composite state with description: state "description" as stateId {
    const compositeStateAsMatch = line.match(
      /^state\s+"([^"]+)"\s+as\s+(\S+)\s*\{\s*$/,
    );
    if (compositeStateAsMatch) {
      const description = compositeStateAsMatch[1];
      const stateId = compositeStateAsMatch[2];
      const node = ensureNode(stateId);
      node.data.description = description;
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
      if (parentStack.length > 1) {
        // If we're inside a region, pop the region first
        const top = parentStack[parentStack.length - 1];
        if (top && top.includes('_region_')) {
          parentStack.pop();
        }
        parentStack.pop();
      }
      continue;
    }

    // Concurrent region separator: -- or ---
    if (/^-{2,}$/.test(line)) {
      const compositeParent = (() => {
        // Find the composite parent (skip region nodes)
        for (let s = parentStack.length - 1; s >= 0; s--) {
          const id = parentStack[s];
          if (id && !id.includes('_region_')) return id;
        }
        return null;
      })();

      if (compositeParent) {
        const parentNode = nodeMap.get(compositeParent)!;
        parentNode.data.stateType = 'parallel';

        const regionIndex = regionCounters.get(compositeParent) ?? 0;

        if (regionIndex === 0) {
          // First `--`: retroactively create region_0 and reparent existing children
          const region0Id = `${compositeParent}_region_0`;
          const region0: StateNode = {
            type: 'node',
            id: region0Id,
            parentId: compositeParent,
            initialNodeId: null,
            label: region0Id,
            data: {},
          };
          nodeMap.set(region0Id, region0);

          // Reparent all existing children of compositeParent to region_0
          for (const node of nodeMap.values()) {
            if (node.parentId === compositeParent && node.id !== region0Id) {
              node.parentId = region0Id;
            }
          }

          // Pop the composite parent from stack, push region_1
          // (region_0 is already closed by the separator)
          const region1Id = `${compositeParent}_region_1`;
          const region1: StateNode = {
            type: 'node',
            id: region1Id,
            parentId: compositeParent,
            initialNodeId: null,
            label: region1Id,
            data: {},
          };
          nodeMap.set(region1Id, region1);

          // If top of stack is compositeParent, replace with region1
          if (parentStack[parentStack.length - 1] === compositeParent) {
            parentStack.push(region1Id);
          }

          regionCounters.set(compositeParent, 2);
        } else {
          // Subsequent `--`: pop current region, create next
          const top = parentStack[parentStack.length - 1];
          if (top && top.includes('_region_')) {
            parentStack.pop();
          }

          const nextRegionId = `${compositeParent}_region_${regionIndex}`;
          const nextRegion: StateNode = {
            type: 'node',
            id: nextRegionId,
            parentId: compositeParent,
            initialNodeId: null,
            label: nextRegionId,
            data: {},
          };
          nodeMap.set(nextRegionId, nextRegion);
          parentStack.push(nextRegionId);

          regionCounters.set(compositeParent, regionIndex + 1);
        }
      }
      continue;
    }

    // Note
    // TODO: notes stored on nodeData but not fully round-trippable
    const noteMatch = line.match(
      /^note\s+(left|right)\s+of\s+(\S+)\s*(?::\s*(.*))?$/i,
    );
    if (noteMatch) {
      const position = noteMatch[1].toLowerCase() as 'left' | 'right';
      const stateId = noteMatch[2];
      const inlineText = noteMatch[3]?.trim();
      const text =
        inlineText && inlineText.length > 0
          ? inlineText
          : (() => {
              const content: string[] = [];
              while (i + 1 < lines.length) {
                i++;
                const noteLine = lines[i].trim();
                if (/^end\s+note$/i.test(noteLine)) {
                  break;
                }
                content.push(noteLine);
              }
              return content.join('\n').trim();
            })();
      const node = ensureNode(stateId);
      if (!node.data.notes) node.data.notes = [];
      node.data.notes.push({ position, text });
      continue;
    }

    // Transition: A --> B or A --> B : label or [*] --> A or A:::cls --> B
    const transMatch = line.match(
      /^(\S+?)(?::::([\w]+))?\s*-->\s*(\S+?)(?::::([\w]+))?\s*(?::\s*(.+))?$/,
    );
    if (transMatch) {
      let sourceId = transMatch[1];
      const sourceClass = transMatch[2];
      let targetId = transMatch[3];
      const targetClass = transMatch[4];
      const label = transMatch[5]?.trim() ?? '';

      // Handle [*]
      if (sourceId === '[*]') {
        sourceId = resolveStarNode('source');
      } else {
        ensureNode(sourceId);
        if (sourceClass) {
          if (!classAssignments[sourceId]) classAssignments[sourceId] = [];
          classAssignments[sourceId].push(sourceClass);
        }
      }

      if (targetId === '[*]') {
        targetId = resolveStarNode('target');
      } else {
        ensureNode(targetId);
        if (targetClass) {
          if (!classAssignments[targetId]) classAssignments[targetId] = [];
          classAssignments[targetId].push(targetClass);
        }
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
    // Use [^:] after first colon to avoid matching ::: syntax
    const descMatch = line.match(/^([a-zA-Z_][\w]*)\s*:\s*([^:].*)$/);
    if (descMatch) {
      const stateId = descMatch[1];
      const description = descMatch[2].trim();
      const node = ensureNode(stateId);
      node.data.description = description;
      continue;
    }

    // classDef: classDef className fill:#f00,stroke:#333
    const classDefMatch = line.match(/^classDef\s+(\S+)\s+(.+)$/);
    if (classDefMatch) {
      const className = classDefMatch[1];
      const propsStr = classDefMatch[2];
      const props: Record<string, string> = {};
      for (const pair of propsStr.split(',')) {
        const [k, v] = pair.split(':').map((s) => s.trim());
        if (k && v) props[k] = v;
      }
      classDefs[className] = props;
      continue;
    }

    // class assignment: class s1,s2 className
    const classAssignMatch = line.match(/^class\s+(.+)\s+(\S+)\s*$/);
    if (classAssignMatch) {
      const nodeIds = classAssignMatch[1].split(',').map((s) => s.trim());
      const className = classAssignMatch[2];
      for (const nid of nodeIds) {
        if (!classAssignments[nid]) classAssignments[nid] = [];
        classAssignments[nid].push(className);
      }
      continue;
    }

    // Bare state name (with optional :::className)
    const bareMatch = line.match(/^([a-zA-Z_][\w]*)(?::::([\w]+))?$/);
    if (bareMatch) {
      const node = ensureNode(bareMatch[1]);
      if (bareMatch[2]) {
        if (!classAssignments[node.id]) classAssignments[node.id] = [];
        classAssignments[node.id].push(bareMatch[2]);
      }
      continue;
    }
  }

  // Apply class assignments to node data
  for (const [nodeId, classes] of Object.entries(classAssignments)) {
    const node = nodeMap.get(nodeId);
    if (node) {
      node.data.classes = classes;
      for (const cls of classes) {
        const def = classDefs[cls];
        if (def) {
          if (def.fill) (node as any).color = def.fill;
          const style: Record<string, string | number> = {};
          for (const [k, v] of Object.entries(def)) {
            style[k] = v;
          }
          if (Object.keys(style).length > 0) {
            (node as any).style = { ...((node as any).style ?? {}), ...style };
          }
        }
      }
    }
  }

  return {
    id: '',
    type: 'directed',
    initialNodeId: null,
    nodes: Array.from(nodeMap.values()),
    edges,
    data: {
      diagramType: 'stateDiagram',
      ...(Object.keys(classDefs).length > 0 && { classDefs }),
    },
    direction: graphDirection,
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
export function toMermaidState(graph: MermaidStateGraph): string {
  const lines: string[] = ['stateDiagram-v2'];

  // Top-level direction
  if (graph.direction) {
    const mDir = DIRECTION_TO_MERMAID[graph.direction];
    if (mDir) lines.push(`    direction ${mDir}`);
  }

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

      // Skip region nodes (emitted by their parallel parent)
      if (node.id.includes('_region_')) continue;

      if (node.data?.stateType && node.data.stateType !== 'parallel') {
        lines.push(`${indent}state ${node.id} <<${node.data.stateType}>>`);
      }

      if (node.data?.description) {
        lines.push(
          `${indent}state "${escapeMermaidLabel(node.data.description)}" as ${node.id}`,
        );
      }

      if (isParent.has(node.id)) {
        lines.push(`${indent}state ${node.id} {`);
        if (node.data?.direction) {
          const mDir = DIRECTION_TO_MERMAID[node.data.direction];
          if (mDir) lines.push(`${indent}    direction ${mDir}`);
        }
        if (node.data?.stateType === 'parallel') {
          // Emit region children separated by --
          const regions = (childrenMap.get(node.id) ?? []).filter(
            (r) => r.id.includes('_region_'),
          );
          for (let ri = 0; ri < regions.length; ri++) {
            if (ri > 0) lines.push(`${indent}    --`);
            writeNodes(regions[ri].id, indent + '    ');
          }
        } else {
          writeNodes(node.id, indent + '    ');
        }
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

  // Emit classDefs
  const gd = graph.data;
  if (gd?.classDefs) {
    for (const [name, props] of Object.entries(gd.classDefs)) {
      const propsStr = Object.entries(props)
        .map(([k, v]) => `${k}:${v}`)
        .join(',');
      lines.push(`    classDef ${name} ${propsStr}`);
    }
  }

  // Emit class assignments
  const classMap = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (node.data?.classes?.length) {
      for (const cls of node.data.classes) {
        if (!classMap.has(cls)) classMap.set(cls, []);
        classMap.get(cls)!.push(node.id);
      }
    }
  }
  for (const [cls, nodeIds] of classMap) {
    lines.push(`    class ${nodeIds.join(',')} ${cls}`);
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
export const mermaidStateConverter: GraphFormatConverter<
  string, StateNodeData, StateEdgeData, StateGraphData
> = createFormatConverter(toMermaidState, fromMermaidState);
