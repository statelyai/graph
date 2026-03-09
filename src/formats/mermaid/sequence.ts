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

export interface SequenceNodeData {
  actorType: 'participant' | 'actor' | 'boundary' | 'control' | 'entity' | 'database' | 'collections' | 'queue';
  alias?: string;
  created?: boolean;
  destroyed?: boolean;
  notes?: Array<{ position: 'left' | 'right' | 'over'; text: string; over?: string[] }>;
  box?: { title?: string; color?: string };
}

export interface SequenceEdgeData {
  kind: 'message' | 'activation' | 'deactivation';
  stroke?: 'solid' | 'dotted';
  arrowType?: 'filled' | 'open' | 'cross' | 'async';
  bidirectional?: boolean;
  sequenceNumber?: number;
}

/**
 * Control-flow blocks (loop/alt/par/opt/critical/break/rect).
 * Not graph topology — they describe ordering constraints.
 * Stored in `graphData.blocks` for round-trip fidelity.
 */
export type SequenceBlock =
  | { type: 'loop'; label: string; edgeIds: string[] }
  | {
      type: 'alt';
      label: string;
      branches: { label?: string; edgeIds: string[] }[];
    }
  | { type: 'opt'; label: string; edgeIds: string[] }
  | {
      type: 'par';
      branches: { label: string; edgeIds: string[] }[];
    }
  | {
      type: 'critical';
      label: string;
      edgeIds: string[];
      options?: { label: string; edgeIds: string[] }[];
    }
  | { type: 'break'; label: string; edgeIds: string[] }
  | { type: 'rect'; color: string; edgeIds: string[] };

export interface SequenceGraphData {
  diagramType: 'sequence';
  autonumber?: boolean;
  blocks?: SequenceBlock[];
  // TODO: actor links/menus (link Alice: Dashboard @ url) not yet supported
  // TODO: rect background highlighting partially supported via blocks
}

export type MermaidSequenceGraph = Graph<SequenceNodeData, SequenceEdgeData, SequenceGraphData>;
type SequenceNode = GraphNode<SequenceNodeData>;
type SequenceEdge = GraphEdge<SequenceEdgeData>;

// --- Arrow parsing ---

interface ArrowInfo {
  stroke: 'solid' | 'dotted';
  arrowType: 'filled' | 'open' | 'cross' | 'async';
  bidirectional: boolean;
}

// Ordered longest-first so greedy match works
const ARROW_PATTERNS: [string, ArrowInfo][] = [
  ['<<-->>', { stroke: 'dotted', arrowType: 'filled', bidirectional: true }],
  ['<<->>', { stroke: 'solid', arrowType: 'filled', bidirectional: true }],
  ['-->>', { stroke: 'dotted', arrowType: 'filled', bidirectional: false }],
  ['-->', { stroke: 'dotted', arrowType: 'open', bidirectional: false }],
  ['--x', { stroke: 'dotted', arrowType: 'cross', bidirectional: false }],
  ['--)', { stroke: 'dotted', arrowType: 'async', bidirectional: false }],
  ['->>', { stroke: 'solid', arrowType: 'filled', bidirectional: false }],
  ['->', { stroke: 'solid', arrowType: 'open', bidirectional: false }],
  ['-x', { stroke: 'solid', arrowType: 'cross', bidirectional: false }],
  ['-)', { stroke: 'solid', arrowType: 'async', bidirectional: false }],
];

function parseArrow(arrow: string): ArrowInfo | undefined {
  for (const [pattern, info] of ARROW_PATTERNS) {
    if (arrow === pattern) return info;
  }
  return undefined;
}

// Regex to match a message line: Actor arrow Actor: message
// Captures: [1] source (may end with +/-), [2] arrow, [3] target (may start with +/-), [4] message
const MESSAGE_RE =
  /^(\S+?)\s*(<<-->>|<<->>|-->>|-->|--x|--\)|->>|->|-x|-\))\s*(\S+?)\s*:\s*(.*)$/;

// --- Parser ---

/**
 * Parses a Mermaid sequence diagram string into a Graph.
 *
 * @example
 * const graph = fromMermaidSequence(`
 * sequenceDiagram
 *     participant Alice
 *     participant Bob
 *     Alice->>Bob: Hello
 *     Bob-->>Alice: Hi back
 * `);
 */
export function fromMermaidSequence(input: string): MermaidSequenceGraph {
  validateInput(input, 'Mermaid sequence');
  const { lines } = prepareLines(input);

  // Validate header
  const header = lines[0]?.trim();
  if (!header || !header.startsWith('sequenceDiagram')) {
    throw new Error('Mermaid sequence: expected "sequenceDiagram" header');
  }

  const nodeMap = new Map<string, SequenceNode>();
  const edges: SequenceEdge[] = [];
  const blocks: SequenceBlock[] = [];
  let autonumber = false;
  let edgeCounter = 0;
  let seqNum = 0;
  let currentBox: { title?: string; color?: string } | null = null;

  // Block nesting stack
  const blockStack: {
    type: string;
    label: string;
    edgeIds: string[];
    branches?: { label?: string; edgeIds: string[] }[];
    options?: { label: string; edgeIds: string[] }[];
    color?: string;
  }[] = [];

  function ensureNode(
    id: string,
    actorType: SequenceNodeData['actorType'] = 'participant',
  ): void {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        type: 'node',
        id,
        parentId: null,
        initialNodeId: null,
        label: id,
        data: { actorType },
      });
    }
  }

  function addEdge(edge: SequenceEdge): void {
    edges.push(edge);
    // Add to current block if inside one
    if (blockStack.length > 0) {
      const top = blockStack[blockStack.length - 1];
      if (top.branches && top.branches.length > 0) {
        top.branches[top.branches.length - 1].edgeIds.push(edge.id);
      } else if (top.options && top.options.length > 0) {
        top.options[top.options.length - 1].edgeIds.push(edge.id);
      } else {
        top.edgeIds.push(edge.id);
      }
    }
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // autonumber
    if (line === 'autonumber') {
      autonumber = true;
      continue;
    }

    // participant / actor / boundary / control / entity / database / collections / queue declaration
    const participantMatch = line.match(
      /^(participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+?)(?:\s+as\s+(.+))?$/,
    );
    if (participantMatch) {
      const actorType = participantMatch[1] as SequenceNodeData['actorType'];
      const id = participantMatch[2];
      const alias = participantMatch[3]?.trim();
      ensureNode(id, actorType);
      const node = nodeMap.get(id)!;
      node.data.actorType = actorType;
      if (alias) {
        node.data.alias = alias;
        node.label = alias;
      }
      // Apply current box if inside one
      if (currentBox) {
        node.data.box = { ...currentBox };
      }
      continue;
    }

    const createMatch = line.match(/^create\s+(participant|actor|boundary|control|entity|database|collections|queue)\s+(\S+?)(?:\s+as\s+(.+))?$/);
    if (createMatch) {
      const actorType = createMatch[1] as SequenceNodeData['actorType'];
      const id = createMatch[2];
      const alias = createMatch[3]?.trim();
      ensureNode(id, actorType);
      const node = nodeMap.get(id)!;
      node.data.created = true;
      if (alias) {
        node.data.alias = alias;
        node.label = alias;
      }
      continue;
    }

    const destroyMatch = line.match(/^destroy\s+(\S+)$/);
    if (destroyMatch) {
      const id = destroyMatch[1];
      ensureNode(id);
      nodeMap.get(id)!.data.destroyed = true;
      continue;
    }

    // activate / deactivate → self-edge
    const activateMatch = line.match(/^(activate|deactivate)\s+(\S+)$/);
    if (activateMatch) {
      const kind = activateMatch[1] === 'activate' ? 'activation' : 'deactivation';
      const actorId = activateMatch[2];
      ensureNode(actorId);
      const edgeId = generateEdgeId(actorId, actorId, edgeCounter++);
      addEdge({
        type: 'edge',
        id: edgeId,
        sourceId: actorId,
        targetId: actorId,
        label: '',
        data: {
          kind: kind as 'activation' | 'deactivation',
          ...(autonumber && { sequenceNumber: ++seqNum }),
        },
      });
      continue;
    }

    // Box grouping: box [color] [title] ... end
    const boxMatch = line.match(/^box\s*(.*)?$/);
    if (boxMatch) {
      const rest = (boxMatch[1] ?? '').trim();
      // Parse optional color (e.g. "rgb(200,200,200)" or "#hex" or named color) and title
      let color: string | undefined;
      let title: string | undefined;
      // Color can be: rgb(...), #hex, or a known CSS color name
      const colorTitleMatch = rest.match(/^(rgb\([^)]*\)|#[a-fA-F0-9]+|[a-zA-Z]+)?\s*(.*)$/);
      if (colorTitleMatch) {
        color = colorTitleMatch[1]?.trim() || undefined;
        title = colorTitleMatch[2]?.trim() || undefined;
      }
      currentBox = { ...(color && { color }), ...(title && { title }) };
      continue;
    }

    // Block keywords: loop, alt, else, opt, par, and, critical, option, break, rect, end
    if (/^(loop|alt|opt|par|critical|break)\s+/.test(line) || line.startsWith('rect ')) {
      const spaceIdx = line.indexOf(' ');
      const keyword = line.slice(0, spaceIdx);
      const label = line.slice(spaceIdx + 1).trim();
      if (keyword === 'alt' || keyword === 'par' || keyword === 'critical') {
        blockStack.push({
          type: keyword,
          label,
          edgeIds: [],
          branches:
            keyword === 'par'
              ? [{ label, edgeIds: [] }]
              : keyword === 'alt'
                ? [{ label, edgeIds: [] }]
                : undefined,
          options: keyword === 'critical' ? [] : undefined,
        });
      } else if (keyword === 'rect') {
        blockStack.push({ type: 'rect', label: '', edgeIds: [], color: label });
      } else {
        blockStack.push({ type: keyword, label, edgeIds: [] });
      }
      continue;
    }

    if (line.startsWith('else') || line === 'else') {
      if (blockStack.length > 0) {
        const top = blockStack[blockStack.length - 1];
        if (top.branches) {
          const elseLabel = line.length > 4 ? line.slice(5).trim() : undefined;
          top.branches.push({ label: elseLabel, edgeIds: [] });
        }
      }
      continue;
    }

    if (line.startsWith('and ')) {
      if (blockStack.length > 0) {
        const top = blockStack[blockStack.length - 1];
        if (top.branches) {
          top.branches.push({ label: line.slice(4).trim(), edgeIds: [] });
        }
      }
      continue;
    }

    if (line.startsWith('option ')) {
      if (blockStack.length > 0) {
        const top = blockStack[blockStack.length - 1];
        if (top.options) {
          top.options.push({ label: line.slice(7).trim(), edgeIds: [] });
        }
      }
      continue;
    }

    if (line === 'end') {
      // Close box if inside one and no block is open
      if (currentBox && blockStack.length === 0) {
        currentBox = null;
        continue;
      }
      if (blockStack.length > 0) {
        const finished = blockStack.pop()!;
        const block = buildBlock(finished);
        if (block) {
          // If nested, add to parent; otherwise add to top-level
          if (blockStack.length > 0) {
            // Merge edge IDs into parent
            const parent = blockStack[blockStack.length - 1];
            parent.edgeIds.push(
              ...finished.edgeIds,
              ...(finished.branches?.flatMap((b) => b.edgeIds) ?? []),
              ...(finished.options?.flatMap((o) => o.edgeIds) ?? []),
            );
          }
          blocks.push(block);
        }
      }
      continue;
    }

    // Note → store on actor node data
    const noteMatch = line.match(/^Note\s+(left of|right of|over)\s+([^:]+):\s*(.*)$/i);
    if (noteMatch) {
      const posRaw = noteMatch[1].toLowerCase();
      const position: 'left' | 'right' | 'over' = posRaw === 'left of' ? 'left' : posRaw === 'right of' ? 'right' : 'over';
      const actorsPart = noteMatch[2].trim();
      const text = noteMatch[3].trim();
      const actorIds = actorsPart.split(',').map((s) => s.trim());

      // Store note on each referenced actor
      for (const actorId of actorIds) {
        ensureNode(actorId);
        const node = nodeMap.get(actorId)!;
        if (!node.data.notes) node.data.notes = [];
        node.data.notes.push({
          position,
          text,
          ...(position === 'over' && actorIds.length > 1 ? { over: actorIds } : {}),
        });
      }
      continue;
    }
    // Also handle Note without colon (skip, no inline text)
    if (/^Note\s+(left|right|over)\s+/i.test(line)) {
      continue;
    }

    // Message line
    const msgMatch = line.match(MESSAGE_RE);
    if (msgMatch) {
      let sourceId = msgMatch[1];
      const arrowStr = msgMatch[2];
      let targetId = msgMatch[3];
      const messageText = msgMatch[4].trim();

      // Handle activation shorthand: +/- suffix on target
      let activationOnTarget: 'activation' | 'deactivation' | null = null;
      if (targetId.startsWith('+')) {
        activationOnTarget = 'activation';
        targetId = targetId.slice(1);
      } else if (targetId.startsWith('-')) {
        activationOnTarget = 'deactivation';
        targetId = targetId.slice(1);
      }
      // Also check source suffix (less common but valid)
      let activationOnSource: 'activation' | 'deactivation' | null = null;
      if (sourceId.endsWith('+')) {
        activationOnSource = 'activation';
        sourceId = sourceId.slice(0, -1);
      } else if (sourceId.endsWith('-')) {
        activationOnSource = 'deactivation';
        sourceId = sourceId.slice(0, -1);
      }

      ensureNode(sourceId);
      ensureNode(targetId);

      const arrowInfo = parseArrow(arrowStr);
      if (!arrowInfo) continue; // skip unparseable arrows

      const edgeId = generateEdgeId(sourceId, targetId, edgeCounter++);
      const data: SequenceEdgeData = {
        kind: 'message',
        stroke: arrowInfo.stroke,
        arrowType: arrowInfo.arrowType,
        ...(arrowInfo.bidirectional && { bidirectional: true }),
        ...(autonumber && { sequenceNumber: ++seqNum }),
      };

      addEdge({
        type: 'edge',
        id: edgeId,
        sourceId,
        targetId,
        label: unescapeMermaidLabel(messageText),
        data,
      });

      // Emit activation self-edges from shorthand
      if (activationOnTarget) {
        const actEdgeId = generateEdgeId(targetId, targetId, edgeCounter++);
        addEdge({
          type: 'edge',
          id: actEdgeId,
          sourceId: targetId,
          targetId: targetId,
          label: '',
          data: { kind: activationOnTarget },
        });
      }
      if (activationOnSource) {
        const actEdgeId = generateEdgeId(sourceId, sourceId, edgeCounter++);
        addEdge({
          type: 'edge',
          id: actEdgeId,
          sourceId: sourceId,
          targetId: sourceId,
          label: '',
          data: { kind: activationOnSource },
        });
      }
      continue;
    }

    // Ignore unrecognized lines (title, etc.)
  }

  return {
    id: '',
    type: 'directed',
    initialNodeId: null,
    nodes: Array.from(nodeMap.values()),
    edges,
    data: {
      diagramType: 'sequence',
      ...(autonumber && { autonumber: true }),
      ...(blocks.length > 0 && { blocks }),
    },
  };
}

interface RawBlock {
  type: string;
  label: string;
  edgeIds: string[];
  branches?: { label?: string; edgeIds: string[] }[];
  options?: { label: string; edgeIds: string[] }[];
  color?: string;
}

function buildBlock(raw: RawBlock): SequenceBlock | null {
  switch (raw.type) {
    case 'loop':
      return { type: 'loop', label: raw.label, edgeIds: raw.edgeIds };
    case 'alt':
      return {
        type: 'alt',
        label: raw.label,
        branches: raw.branches ?? [{ edgeIds: raw.edgeIds }],
      };
    case 'opt':
      return { type: 'opt', label: raw.label, edgeIds: raw.edgeIds };
    case 'par':
      return {
        type: 'par',
        branches: (raw.branches ?? []).map((b) => ({
          label: b.label ?? '',
          edgeIds: b.edgeIds,
        })),
      };
    case 'critical':
      return {
        type: 'critical',
        label: raw.label,
        edgeIds: raw.edgeIds,
        ...(raw.options &&
          raw.options.length > 0 && { options: raw.options }),
      };
    case 'break':
      return { type: 'break', label: raw.label, edgeIds: raw.edgeIds };
    case 'rect':
      return {
        type: 'rect',
        color: raw.color ?? '',
        edgeIds: raw.edgeIds,
      };
    default:
      return null;
  }
}

// --- Serializer ---

const ARROW_MAP: Record<string, Record<string, string>> = {
  solid: {
    open: '->',
    filled: '->>',
    cross: '-x',
    async: '-)',
  },
  dotted: {
    open: '-->',
    filled: '-->>',
    cross: '--x',
    async: '--)',
  },
};

/**
 * Converts a sequence diagram Graph to a Mermaid sequence diagram string.
 *
 * @example
 * const mermaid = toMermaidSequence(graph);
 * // "sequenceDiagram\n    participant Alice\n    ..."
 */
export function toMermaidSequence(graph: MermaidSequenceGraph): string {
  const lines: string[] = ['sequenceDiagram'];
  const gd = graph.data;

  if (gd?.autonumber) {
    lines.push('    autonumber');
  }

  // Group nodes by box for emission
  const boxGroups = new Map<string, { box: NonNullable<SequenceNodeData['box']>; nodes: typeof graph.nodes }>();
  const noBoxNodes: typeof graph.nodes = [];
  for (const node of graph.nodes) {
    const box = node.data?.box;
    if (box) {
      const key = JSON.stringify(box);
      if (!boxGroups.has(key)) boxGroups.set(key, { box, nodes: [] });
      boxGroups.get(key)!.nodes.push(node);
    } else {
      noBoxNodes.push(node);
    }
  }

  function emitParticipant(node: typeof graph.nodes[0], indent: string) {
    const d = node.data;
    const keyword = d?.actorType ?? 'participant';
    const alias = d?.alias ? ` as ${escapeMermaidLabel(d.alias)}` : '';
    if (d?.created) {
      lines.push(`${indent}create ${keyword} ${node.id}${alias}`);
    } else {
      lines.push(`${indent}${keyword} ${node.id}${alias}`);
    }
  }

  // Emit boxed participants first, then unboxed
  for (const { box, nodes: boxNodes } of boxGroups.values()) {
    const colorStr = box.color ? ` ${box.color}` : '';
    const titleStr = box.title ? ` ${box.title}` : '';
    lines.push(`    box${colorStr}${titleStr}`);
    for (const node of boxNodes) {
      emitParticipant(node, '        ');
    }
    lines.push('    end');
  }
  for (const node of noBoxNodes) {
    emitParticipant(node, '    ');
  }

  // Emit notes after participant declarations
  for (const node of graph.nodes) {
    if (node.data?.notes) {
      for (const note of node.data.notes) {
        if (note.position === 'over' && note.over && note.over.length > 1) {
          lines.push(`    Note over ${note.over.join(',')}: ${escapeMermaidLabel(note.text)}`);
        } else {
          const posStr = note.position === 'left' ? 'left of' : note.position === 'right' ? 'right of' : 'over';
          lines.push(`    Note ${posStr} ${node.id}: ${escapeMermaidLabel(note.text)}`);
        }
      }
    }
  }

  // Build edge-to-block index for reconstructing block nesting
  const blocks = gd?.blocks ?? [];
  // Collect all edgeIds claimed by blocks (in order) so we can interleave
  // block open/close markers with edge emission.
  const edgeIdSet = new Set(graph.edges.map((e) => e.id));

  // Build an ordered schedule: for each edge, track which blocks open before
  // it and which blocks close after it.
  interface BlockEvent {
    type: 'open' | 'close' | 'branch';
    block: SequenceBlock;
    branchIndex?: number;
    label?: string;
  }
  // Map edgeId → events that fire *before* that edge is emitted
  const beforeEdge = new Map<string, BlockEvent[]>();
  // Map edgeId → events that fire *after* that edge is emitted
  const afterEdge = new Map<string, BlockEvent[]>();

  for (const block of blocks) {
    if (block.type === 'alt') {
      // First branch opens the alt
      const firstEdge = block.branches[0]?.edgeIds[0];
      if (firstEdge && edgeIdSet.has(firstEdge)) {
        const events = beforeEdge.get(firstEdge) ?? [];
        events.push({ type: 'open', block });
        beforeEdge.set(firstEdge, events);
      }
      // Subsequent branches emit "else"
      for (let bi = 1; bi < block.branches.length; bi++) {
        const branchFirstEdge = block.branches[bi]?.edgeIds[0];
        if (branchFirstEdge && edgeIdSet.has(branchFirstEdge)) {
          const events = beforeEdge.get(branchFirstEdge) ?? [];
          events.push({ type: 'branch', block, branchIndex: bi, label: block.branches[bi].label });
          beforeEdge.set(branchFirstEdge, events);
        }
      }
      // Close after last edge of last branch
      const lastBranch = block.branches[block.branches.length - 1];
      const lastEdge = lastBranch?.edgeIds[lastBranch.edgeIds.length - 1];
      if (lastEdge && edgeIdSet.has(lastEdge)) {
        const events = afterEdge.get(lastEdge) ?? [];
        events.push({ type: 'close', block });
        afterEdge.set(lastEdge, events);
      }
    } else if (block.type === 'par') {
      // First branch opens the par
      const firstEdge = block.branches[0]?.edgeIds[0];
      if (firstEdge && edgeIdSet.has(firstEdge)) {
        const events = beforeEdge.get(firstEdge) ?? [];
        events.push({ type: 'open', block });
        beforeEdge.set(firstEdge, events);
      }
      // Subsequent branches emit "and"
      for (let bi = 1; bi < block.branches.length; bi++) {
        const branchFirstEdge = block.branches[bi]?.edgeIds[0];
        if (branchFirstEdge && edgeIdSet.has(branchFirstEdge)) {
          const events = beforeEdge.get(branchFirstEdge) ?? [];
          events.push({ type: 'branch', block, branchIndex: bi, label: block.branches[bi].label });
          beforeEdge.set(branchFirstEdge, events);
        }
      }
      // Close after last edge of last branch
      const lastBranch = block.branches[block.branches.length - 1];
      const lastEdge = lastBranch?.edgeIds[lastBranch.edgeIds.length - 1];
      if (lastEdge && edgeIdSet.has(lastEdge)) {
        const events = afterEdge.get(lastEdge) ?? [];
        events.push({ type: 'close', block });
        afterEdge.set(lastEdge, events);
      }
    } else if (block.type === 'critical') {
      // Open before first edge
      const firstEdge = block.edgeIds[0];
      if (firstEdge && edgeIdSet.has(firstEdge)) {
        const events = beforeEdge.get(firstEdge) ?? [];
        events.push({ type: 'open', block });
        beforeEdge.set(firstEdge, events);
      }
      // Options emit "option" before their first edge
      if (block.options) {
        for (const opt of block.options) {
          const optFirstEdge = opt.edgeIds[0];
          if (optFirstEdge && edgeIdSet.has(optFirstEdge)) {
            const events = beforeEdge.get(optFirstEdge) ?? [];
            events.push({ type: 'branch', block, label: opt.label });
            beforeEdge.set(optFirstEdge, events);
          }
        }
      }
      // Close after last edge (of options if present, else of main edgeIds)
      const allEdgeIds = [
        ...block.edgeIds,
        ...(block.options?.flatMap((o) => o.edgeIds) ?? []),
      ];
      const lastEdge = allEdgeIds[allEdgeIds.length - 1];
      if (lastEdge && edgeIdSet.has(lastEdge)) {
        const events = afterEdge.get(lastEdge) ?? [];
        events.push({ type: 'close', block });
        afterEdge.set(lastEdge, events);
      }
    } else {
      // Simple blocks: loop, opt, break, rect
      const edgeIds = block.edgeIds;
      const firstEdge = edgeIds[0];
      const lastEdge = edgeIds[edgeIds.length - 1];
      if (firstEdge && edgeIdSet.has(firstEdge)) {
        const events = beforeEdge.get(firstEdge) ?? [];
        events.push({ type: 'open', block });
        beforeEdge.set(firstEdge, events);
      }
      if (lastEdge && edgeIdSet.has(lastEdge)) {
        const events = afterEdge.get(lastEdge) ?? [];
        events.push({ type: 'close', block });
        afterEdge.set(lastEdge, events);
      }
    }
  }

  // Track indent depth for nested blocks
  let depth = 1;
  const indent = () => '    '.repeat(depth);

  for (const edge of graph.edges) {
    // Emit block-open / branch events before this edge
    const befores = beforeEdge.get(edge.id);
    if (befores) {
      for (const ev of befores) {
        if (ev.type === 'open') {
          const b = ev.block;
          if (b.type === 'alt') {
            lines.push(`${indent()}alt ${b.label}`);
          } else if (b.type === 'par') {
            lines.push(`${indent()}par ${b.branches[0].label}`);
          } else if (b.type === 'critical') {
            lines.push(`${indent()}critical ${b.label}`);
          } else if (b.type === 'rect') {
            lines.push(`${indent()}rect ${b.color}`);
          } else if (b.type === 'loop' || b.type === 'opt' || b.type === 'break') {
            lines.push(`${indent()}${b.type} ${b.label}`);
          }
          depth++;
        } else if (ev.type === 'branch') {
          depth--;
          const b = ev.block;
          if (b.type === 'alt') {
            lines.push(`${indent()}else${ev.label ? ` ${ev.label}` : ''}`);
          } else if (b.type === 'par') {
            lines.push(`${indent()}and ${ev.label ?? ''}`);
          } else if (b.type === 'critical') {
            lines.push(`${indent()}option ${ev.label ?? ''}`);
          }
          depth++;
        }
      }
    }

    const d = edge.data;
    if (!d) continue;

    if (d.kind === 'activation') {
      lines.push(`${indent()}activate ${edge.sourceId}`);
    } else if (d.kind === 'deactivation') {
      lines.push(`${indent()}deactivate ${edge.sourceId}`);
    } else {
      // Message
      const stroke = d.stroke ?? 'solid';
      const arrowType = d.arrowType ?? 'filled';
      let arrow: string;
      if (d.bidirectional) {
        arrow = stroke === 'dotted' ? '<<-->>' : '<<->>';
      } else {
        arrow = ARROW_MAP[stroke]?.[arrowType] ?? '->>';
      }

      const label = edge.label ? `: ${escapeMermaidLabel(edge.label)}` : ':';
      lines.push(
        `${indent()}${edge.sourceId}${arrow}${edge.targetId}${label}`,
      );
    }

    // Emit block-close events after this edge
    const afters = afterEdge.get(edge.id);
    if (afters) {
      for (const _ev of afters) {
        depth--;
        lines.push(`${indent()}end`);
      }
    }
  }

  return lines.join('\n');
}

/**
 * Bidirectional converter for Mermaid sequence diagram format.
 *
 * @example
 * const graph = mermaidSequenceConverter.from(`
 * sequenceDiagram
 *     Alice->>Bob: Hello
 * `);
 * const str = mermaidSequenceConverter.to(graph);
 */
export const mermaidSequenceConverter: GraphFormatConverter<
  string, SequenceNodeData, SequenceEdgeData, SequenceGraphData
> = createFormatConverter(toMermaidSequence, fromMermaidSequence);
