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
  directiveToString,
} from './shared';

// --- Types ---

/**
 * Structured form of a Mermaid `click` interaction.
 * Mermaid supports two kinds: a hyperlink (`click X href "url" "tip" _target`)
 * and a callback (`click X call fn() "tip"` / `click X fn "tip"`). Both forms
 * are captured losslessly so emit reproduces the original.
 */
export interface FlowchartClick {
  kind: 'href' | 'callback';
  /** URL for `href` clicks, or callback function name/expression for `call` clicks. */
  target: string;
  tooltip?: string;
  /** Link target attribute for `href` clicks (e.g. `_blank`). */
  linkTarget?: string;
  /** True when the callback form used the explicit `call` keyword. */
  explicitCall?: boolean;
}

export interface FlowchartNodeData {
  classes?: string[];
  /** @deprecated Legacy hyperlink field. New parses populate `click` instead. */
  link?: string;
  tooltip?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Structured `click` interaction, preserved round-trip. */
  click?: FlowchartClick;
}

export interface FlowchartEdgeData {
  stroke: 'normal' | 'dotted' | 'thick' | 'invisible';
  arrowType: 'arrow' | 'none';
  endMarker?: 'arrow' | 'circle' | 'cross';
  startMarker?: 'arrow' | 'circle' | 'cross';
  bidirectional?: boolean;
  /**
   * Inline `linkStyle` properties resolved onto this edge at parse time.
   * Storing the style on the edge (rather than a positional index) keeps it
   * attached across graph mutation; emit recomputes the `linkStyle N` index
   * from the edge's current position.
   */
  linkStyle?: Record<string, string>;
}

export interface FlowchartGraphData {
  diagramType: 'flowchart';
  classDefs?: Record<string, Record<string, string>>;
  /** Default `linkStyle default ...` applied to all edges, preserved verbatim. */
  defaultLinkStyle?: Record<string, string>;
  /**
   * Preserved `%%{init: ...}%%` directives, re-emitted at the top of the output.
   * JSON-serializable; parsed by {@link stripDirectives}.
   */
  init?: Record<string, any>;
}

export type MermaidFlowchartGraph = Graph<FlowchartNodeData, FlowchartEdgeData, FlowchartGraphData>;
type FlowchartNode = GraphNode<FlowchartNodeData>;
type FlowchartEdge = GraphEdge<FlowchartEdgeData>;

// --- Shape parsing ---

// Shape: opening bracket pattern → shape name
// Order matters: try longest/most-specific first
const SHAPE_OPENERS: [string, string, string][] = [
  // [opener, closer, shapeName]
  ['(((', ')))', 'double-circle'],
  ['((', '))', 'circle'],
  ['([', '])', 'stadium'],
  ['[(', ')]', 'cylinder'],
  ['[[', ']]', 'subroutine'],
  ['{{', '}}', 'hexagon'],
  ['[/', '/]', 'parallelogram'],
  ['[\\', '\\]', 'parallelogram-alt'],
  ['[/', '\\]', 'trapezoid'],
  ['[\\', '/]', 'trapezoid-alt'],
  ['(', ')', 'rounded'],
  ['{', '}', 'diamond'],
  ['>', ']', 'asymmetric'],
  ['[', ']', 'rectangle'],
];

const SHAPE_TO_BRACKETS: Record<string, [string, string]> = {};
for (const [opener, closer, name] of SHAPE_OPENERS) {
  SHAPE_TO_BRACKETS[name] = [opener, closer];
}

function parseNodeDecl(text: string): {
  id: string;
  label: string;
  shape: string;
  className?: string;
} | null {
  // Strip :::className suffix
  let className: string | undefined;
  const classIdx = text.indexOf(':::');
  if (classIdx >= 0) {
    className = text.slice(classIdx + 3).trim();
    text = text.slice(0, classIdx);
  }

  // Try @{ shape: ..., label: ... } expanded syntax
  const atMatch = text.match(/^([a-zA-Z_][\w]*)@\{(.+)\}$/s);
  if (atMatch) {
    const id = atMatch[1];
    const body = atMatch[2].trim();
    let shape = 'rectangle';
    let label = '';
    // Parse key: value pairs (simple, no nested objects)
    for (const line of body.split(',')) {
      const kv = line.match(/^\s*(\w+)\s*:\s*"?([^"]*)"?\s*$/);
      if (kv) {
        if (kv[1] === 'shape') shape = kv[2].trim();
        else if (kv[1] === 'label') label = kv[2].trim();
      }
    }
    return { id, label, shape, ...(className && { className }) };
  }

  // Try each shape pattern
  for (const [opener, closer, shapeName] of SHAPE_OPENERS) {
    const opIdx = text.indexOf(opener);
    if (opIdx < 0) continue;
    const id = text.slice(0, opIdx);
    if (!id) continue;
    // Find matching closer from end
    if (!text.endsWith(closer)) continue;
    const label = text.slice(opIdx + opener.length, text.length - closer.length);
    return { id, label: label.trim(), shape: shapeName, ...(className && { className }) };
  }
  // Bare node ID (no brackets)
  if (/^[a-zA-Z_][\w]*$/.test(text)) {
    return { id: text, label: '', shape: 'rectangle', ...(className && { className }) };
  }
  return null;
}

// --- Edge parsing ---

interface EdgeArrowInfo {
  stroke: 'normal' | 'dotted' | 'thick' | 'invisible';
  arrowType: 'arrow' | 'none';
  endMarker: 'arrow' | 'circle' | 'cross';
  startMarker?: 'arrow' | 'circle' | 'cross';
  bidirectional: boolean;
  label: string;
}

// Arrow patterns ordered longest-first for greedy match
const EDGE_ARROWS: [RegExp, Omit<EdgeArrowInfo, 'label'>][] = [
  // Bidirectional
  [/^<===>$/, { stroke: 'thick', arrowType: 'arrow', endMarker: 'arrow', startMarker: 'arrow', bidirectional: true }],
  [/^<==>$/, { stroke: 'thick', arrowType: 'arrow', endMarker: 'arrow', startMarker: 'arrow', bidirectional: true }],
  [/^<-.->$/, { stroke: 'dotted', arrowType: 'arrow', endMarker: 'arrow', startMarker: 'arrow', bidirectional: true }],
  [/^<-->$/, { stroke: 'normal', arrowType: 'arrow', endMarker: 'arrow', startMarker: 'arrow', bidirectional: true }],
  // Thick
  [/^===>$/, { stroke: 'thick', arrowType: 'arrow', endMarker: 'arrow', bidirectional: false }],
  [/^==>$/, { stroke: 'thick', arrowType: 'arrow', endMarker: 'arrow', bidirectional: false }],
  [/^===$/,  { stroke: 'thick', arrowType: 'none', endMarker: 'arrow', bidirectional: false }],
  // Dotted
  [/^-\.->$/, { stroke: 'dotted', arrowType: 'arrow', endMarker: 'arrow', bidirectional: false }],
  [/^\.-\.>$/, { stroke: 'dotted', arrowType: 'arrow', endMarker: 'arrow', bidirectional: false }],
  [/^-\.-$/, { stroke: 'dotted', arrowType: 'none', endMarker: 'arrow', bidirectional: false }],
  // Normal with markers
  [/^---o$/, { stroke: 'normal', arrowType: 'arrow', endMarker: 'circle', bidirectional: false }],
  [/^--o$/,  { stroke: 'normal', arrowType: 'arrow', endMarker: 'circle', bidirectional: false }],
  [/^---x$/, { stroke: 'normal', arrowType: 'arrow', endMarker: 'cross', bidirectional: false }],
  [/^--x$/,  { stroke: 'normal', arrowType: 'arrow', endMarker: 'cross', bidirectional: false }],
  // Normal
  [/^--->$/, { stroke: 'normal', arrowType: 'arrow', endMarker: 'arrow', bidirectional: false }],
  [/^-->$/,  { stroke: 'normal', arrowType: 'arrow', endMarker: 'arrow', bidirectional: false }],
  [/^---$/,  { stroke: 'normal', arrowType: 'none', endMarker: 'arrow', bidirectional: false }],
  [/^--$/,   { stroke: 'normal', arrowType: 'none', endMarker: 'arrow', bidirectional: false }],
  // Invisible
  [/^~~~$/, { stroke: 'invisible', arrowType: 'none', endMarker: 'arrow', bidirectional: false }],
];

// Match an edge expression from a line and return the parsed components.
// Handles: A --> B, A -->|label| B, A -- text --> B
// Returns null if no edge found.
function findEdge(line: string): {
  sourceText: string;
  targetText: string;
  info: EdgeArrowInfo;
  rest: string;
} | null {
  // Strategy: scan for arrow patterns in the line
  // First try the pipe-label form: A -->|label| B
  const pipeMatch = line.match(
    /^(.+?)\s*([-=.<>ox]+)\|([^|]*)\|\s*(.+)$/,
  );
  if (pipeMatch) {
    const arrowStr = pipeMatch[2];
    for (const [re, info] of EDGE_ARROWS) {
      if (re.test(arrowStr)) {
        return {
          sourceText: pipeMatch[1].trim(),
          targetText: pipeMatch[4].trim(),
          info: { ...info, label: pipeMatch[3].trim() },
          rest: '',
        };
      }
    }
  }

  // Try inline label form: A -- text --> B
  // Pattern: source (dashOrEquals)+ text (dashOrEquals)+arrowhead target
  const inlineMatch = line.match(
    /^(.+?)\s*(--)\s+([^-][^>]*?)\s*(-->)\s*(.+)$/,
  );
  if (inlineMatch) {
    return {
      sourceText: inlineMatch[1].trim(),
      targetText: inlineMatch[5].trim(),
      info: {
        stroke: 'normal',
        arrowType: 'arrow',
        endMarker: 'arrow',
        bidirectional: false,
        label: inlineMatch[3].trim(),
      },
      rest: '',
    };
  }

  // Try simple form: A --> B (possibly chained: A --> B --> C)
  // Find longest matching arrow
  for (const [re, info] of EDGE_ARROWS) {
    // Build pattern to find arrow in line
    const arrowSource = re.source.replace(/^\^/, '').replace(/\$$/, '');
    const fullRe = new RegExp(`^(.+?)\\s*(${arrowSource})\\s*(.+)$`);
    const m = line.match(fullRe);
    if (m) {
      return {
        sourceText: m[1].trim(),
        targetText: m[3].trim(),
        info: { ...info, label: '' },
        rest: '',
      };
    }
  }

  return null;
}

// --- Click parsing ---

/**
 * Parse the tail of a `click` statement (everything after the node id) into a
 * structured {@link FlowchartClick}. Handles:
 *   - `href "url" "tip" _blank`
 *   - `"url" "tip" _blank`   (implicit href)
 *   - `call fn() "tip"`
 *   - `fn "tip"`             (implicit callback)
 */
function parseClick(rest: string): FlowchartClick | undefined {
  // href form (explicit or implicit via leading quote)
  let m = rest.match(/^href\s+"([^"]*)"(?:\s+"([^"]*)")?(?:\s+(\S+))?\s*$/);
  if (!m) m = rest.match(/^"([^"]*)"(?:\s+"([^"]*)")?(?:\s+(\S+))?\s*$/);
  if (m) {
    return {
      kind: 'href',
      target: m[1],
      ...(m[2] && { tooltip: m[2] }),
      ...(m[3] && { linkTarget: m[3] }),
    };
  }
  // callback form: `call fn(args)` or bare `fn`
  const callMatch = rest.match(/^call\s+(.+?)(?:\s+"([^"]*)")?\s*$/);
  if (callMatch) {
    return {
      kind: 'callback',
      target: callMatch[1].trim(),
      explicitCall: true,
      ...(callMatch[2] && { tooltip: callMatch[2] }),
    };
  }
  const bareMatch = rest.match(/^(\S+)(?:\s+"([^"]*)")?\s*$/);
  if (bareMatch) {
    return {
      kind: 'callback',
      target: bareMatch[1],
      ...(bareMatch[2] && { tooltip: bareMatch[2] }),
    };
  }
  return undefined;
}

// --- Parser ---

/**
 * Parses a Mermaid flowchart string into a Graph.
 *
 * @example
 * const graph = fromMermaidFlowchart(`
 * flowchart TD
 *     A[Start] --> B{Decision}
 *     B -->|Yes| C[End]
 * `);
 */
export function fromMermaidFlowchart(input: string): MermaidFlowchartGraph {
  validateInput(input, 'Mermaid flowchart');
  const { lines, directives } = prepareLines(input);

  // Parse header
  const header = lines[0]?.trim();
  const headerMatch = header?.match(/^(graph|flowchart)\s+(TD|TB|BT|LR|RL)\s*$/);
  if (!headerMatch) {
    throw new Error(
      'Mermaid flowchart: expected "graph <direction>" or "flowchart <direction>" header',
    );
  }
  const direction = MERMAID_TO_DIRECTION[headerMatch[2]] ?? 'down';

  const nodeMap = new Map<string, FlowchartNode>();
  const edges: FlowchartEdge[] = [];
  const classDefs: Record<string, Record<string, string>> = {};
  const classAssignments: Record<string, string[]> = {};
  // linkStyle lines collected during the pass, resolved against edges afterwards
  // (a linkStyle may reference an edge index declared later in the source).
  const linkStyles: { indices: number[] | 'default'; props: Record<string, string> }[] = [];
  let defaultLinkStyle: Record<string, string> | undefined;
  let edgeCounter = 0;

  // Subgraph stack for tracking parentId
  const parentStack: (string | null)[] = [null];

  function ensureNode(id: string, label?: string, shape?: string, className?: string): FlowchartNode {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        type: 'node',
        id,
        parentId: parentStack[parentStack.length - 1],
        initialNodeId: null,
        label: label ?? '',
        data: {},
        ...(shape && shape !== 'rectangle' && { shape }),
      });
    }
    const node = nodeMap.get(id)!;
    // Update label/shape if provided and node was auto-created
    if (label && !node.label) node.label = label;
    if (shape && shape !== 'rectangle' && !node.shape) (node as any).shape = shape;
    // Apply ::: inline class
    if (className) {
      if (!classAssignments[id]) classAssignments[id] = [];
      if (!classAssignments[id].includes(className)) classAssignments[id].push(className);
    }
    return node;
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // subgraph
    const subgraphMatch = line.match(/^subgraph\s+(\S+?)(?:\s*\[(.+)\])?\s*$/);
    if (subgraphMatch) {
      const subId = subgraphMatch[1];
      const subLabel = subgraphMatch[2]?.trim() ?? subId;
      ensureNode(subId, subLabel);
      parentStack.push(subId);
      continue;
    }

    // direction inside subgraph — store on parent node
    const dirMatch = line.match(/^direction\s+(TD|TB|BT|LR|RL)\s*$/);
    if (dirMatch) {
      const parentId = parentStack[parentStack.length - 1];
      if (parentId) {
        const parentNode = nodeMap.get(parentId);
        if (parentNode) {
          parentNode.data.direction = MERMAID_TO_DIRECTION[dirMatch[1]];
        }
      }
      continue;
    }

    if (line === 'end') {
      if (parentStack.length > 1) parentStack.pop();
      continue;
    }

    // classDef
    const classDefMatch = line.match(
      /^classDef\s+(\S+)\s+(.+)$/,
    );
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

    // class assignment: class A,B className
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

    // style directive
    const styleMatch = line.match(/^style\s+(\S+)\s+(.+)$/);
    if (styleMatch) {
      const nodeId = styleMatch[1];
      const propsStr = styleMatch[2];
      ensureNode(nodeId);
      const node = nodeMap.get(nodeId)!;
      const style: Record<string, string | number> = {};
      for (const pair of propsStr.split(',')) {
        const [k, v] = pair.split(':').map((s) => s.trim());
        if (k && v) {
          if (k === 'fill') {
            (node as any).color = v;
          }
          style[k] = v;
        }
      }
      if (Object.keys(style).length > 0) {
        (node as any).style = { ...((node as any).style ?? {}), ...style };
      }
      continue;
    }

    // linkStyle <indices|default> prop:val,prop:val
    // Resolved onto edges after the full pass so recomputed indices stay
    // correct across later graph mutation.
    const linkStyleMatch = line.match(/^linkStyle\s+(default|[\d,\s]+)\s+(.+)$/);
    if (linkStyleMatch) {
      const props: Record<string, string> = {};
      for (const pair of linkStyleMatch[2].split(',')) {
        const [k, v] = pair.split(':').map((s) => s.trim());
        if (k && v) props[k] = v;
      }
      if (linkStyleMatch[1].trim() === 'default') {
        linkStyles.push({ indices: 'default', props });
      } else {
        const indices = linkStyleMatch[1]
          .split(',')
          .map((s) => parseInt(s.trim(), 10))
          .filter((n) => !Number.isNaN(n));
        linkStyles.push({ indices, props });
      }
      continue;
    }

    // click <nodeId> ["url"|call fn()|fn] ["tooltip"] [_target]
    // Two Mermaid forms: hyperlink and callback. Both captured structurally.
    const clickMatch = line.match(/^click\s+(\S+)\s+(.+)$/);
    if (clickMatch) {
      const nodeId = clickMatch[1];
      const rest = clickMatch[2].trim();
      const click = parseClick(rest);
      if (click) {
        ensureNode(nodeId);
        const node = nodeMap.get(nodeId)!;
        node.data.click = click;
        if (click.tooltip) node.data.tooltip = click.tooltip;
        // Populate legacy `link` field for href clicks (backward compatible).
        if (click.kind === 'href') node.data.link = click.target;
        continue;
      }
    }

    // Try parsing as edge chain (A --> B --> C)
    let remaining = line;
    let foundEdge = false;
    while (remaining) {
      const edgeResult = findEdge(remaining);
      if (!edgeResult) break;
      foundEdge = true;

      // Parse source node
      const sourceDecl = parseNodeDecl(edgeResult.sourceText);
      if (sourceDecl) {
        ensureNode(sourceDecl.id, sourceDecl.label, sourceDecl.shape, sourceDecl.className);
      }

      // Parse target — might have more edges chained
      const targetDecl = parseNodeDecl(edgeResult.targetText);
      let targetId: string;
      if (targetDecl) {
        ensureNode(targetDecl.id, targetDecl.label, targetDecl.shape, targetDecl.className);
        targetId = targetDecl.id;
        remaining = ''; // consumed
      } else {
        // Target might be chained: B --> C. Take first word as target ID.
        const nextEdge = findEdge(edgeResult.targetText);
        if (nextEdge) {
          const tDecl = parseNodeDecl(nextEdge.sourceText);
          if (tDecl) {
            ensureNode(tDecl.id, tDecl.label, tDecl.shape, tDecl.className);
            targetId = tDecl.id;
          } else {
            targetId = nextEdge.sourceText;
            ensureNode(targetId);
          }
          remaining = edgeResult.targetText; // continue chain
        } else {
          targetId = edgeResult.targetText;
          ensureNode(targetId);
          remaining = '';
        }
      }

      const sourceId = sourceDecl ? sourceDecl.id : edgeResult.sourceText;
      ensureNode(sourceId);

      const edgeId = generateEdgeId(sourceId, targetId, edgeCounter++);
      const info = edgeResult.info;
      edges.push({
        type: 'edge',
        id: edgeId,
        sourceId,
        targetId,
        label: info.label ? unescapeMermaidLabel(info.label) : '',
        data: {
          stroke: info.stroke,
          arrowType: info.arrowType,
          ...(info.endMarker !== 'arrow' && { endMarker: info.endMarker }),
          ...(info.startMarker && { startMarker: info.startMarker }),
          ...(info.bidirectional && { bidirectional: true }),
        },
      });
    }

    if (foundEdge) continue;

    // Standalone node declaration
    const nodeDecl = parseNodeDecl(line);
    if (nodeDecl) {
      ensureNode(nodeDecl.id, nodeDecl.label, nodeDecl.shape, nodeDecl.className);
      continue;
    }

    // Semicolon-separated statements
    if (line.includes(';')) {
      const stmts = line.split(';').map((s) => s.trim()).filter(Boolean);
      for (const stmt of stmts) {
        const nd = parseNodeDecl(stmt);
        if (nd) {
          ensureNode(nd.id, nd.label, nd.shape);
        }
      }
    }
  }

  // Apply class assignments to node data
  for (const [nodeId, classes] of Object.entries(classAssignments)) {
    const node = nodeMap.get(nodeId);
    if (node) {
      node.data.classes = classes;
      // Apply classDef styles to node
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

  // Resolve linkStyle lines onto edges. Index refers to edge declaration order.
  for (const ls of linkStyles) {
    if (ls.indices === 'default') {
      defaultLinkStyle = { ...(defaultLinkStyle ?? {}), ...ls.props };
      continue;
    }
    for (const idx of ls.indices) {
      const edge = edges[idx];
      if (edge) {
        edge.data.linkStyle = { ...(edge.data.linkStyle ?? {}), ...ls.props };
      }
    }
  }

  return {
    id: '',
    mode: 'directed',
    initialNodeId: null,
    nodes: Array.from(nodeMap.values()),
    edges,
    data: {
      diagramType: 'flowchart',
      ...(Object.keys(classDefs).length > 0 && { classDefs }),
      ...(defaultLinkStyle && { defaultLinkStyle }),
      ...(directives.init && { init: directives.init }),
    },
    direction,
  };
}

// --- Serializer ---

/**
 * Converts a flowchart Graph to a Mermaid flowchart string.
 *
 * @example
 * const mermaid = toMermaidFlowchart(graph);
 * // "flowchart TD\n    A[Start] --> B{Decision}\n    ..."
 */
export function toMermaidFlowchart(graph: MermaidFlowchartGraph): string {
  const dir = DIRECTION_TO_MERMAID[graph.direction ?? 'down'] ?? 'TD';
  const gd = graph.data;

  const lines: string[] = [];
  // Preserved %%{init}%% directives re-emitted at the very top.
  const initLine = directiveToString('init', gd?.init);
  if (initLine) lines.push(initLine);
  lines.push(`flowchart ${dir}`);

  // Emit classDefs
  if (gd?.classDefs) {
    for (const [name, props] of Object.entries(gd.classDefs)) {
      const propsStr = Object.entries(props)
        .map(([k, v]) => `${k}:${v}`)
        .join(',');
      lines.push(`    classDef ${name} ${propsStr}`);
    }
  }

  // Build children map for subgraph nesting
  const childrenMap = new Map<string | null, FlowchartNode[]>();
  for (const node of graph.nodes) {
    const pid = node.parentId ?? null;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(node);
  }

  // Track which nodes are subgraph parents
  const isParent = new Set<string>();
  for (const node of graph.nodes) {
    if (childrenMap.has(node.id)) isParent.add(node.id);
  }

  // Recursive node/subgraph writer
  function writeNodes(parentId: string | null, indent: string) {
    const children = childrenMap.get(parentId) ?? [];
    for (const node of children) {
      if (isParent.has(node.id)) {
        // Emit as subgraph
        const label = node.label ? `[${escapeMermaidLabel(node.label)}]` : '';
        lines.push(`${indent}subgraph ${node.id}${label}`);
        // Emit direction if set on this subgraph
        if (node.data?.direction) {
          const subDir = DIRECTION_TO_MERMAID[node.data.direction] ?? 'TD';
          lines.push(`${indent}    direction ${subDir}`);
        }
        writeNodes(node.id, indent + '    ');
        lines.push(`${indent}end`);
      } else {
        // Emit as node
        const shape = (node as any).shape ?? 'rectangle';
        const brackets = SHAPE_TO_BRACKETS[shape] ?? ['[', ']'];
        const label = node.label
          ? `${brackets[0]}${escapeMermaidLabel(node.label)}${brackets[1]}`
          : '';
        lines.push(`${indent}${node.id}${label}`);
      }
    }
  }

  writeNodes(null, '    ');

  // Emit edges
  for (const edge of graph.edges) {
    const d = edge.data;
    let arrow: string;
    if (d?.stroke === 'invisible') {
      arrow = '~~~';
    } else if (d?.bidirectional) {
      arrow =
        d.stroke === 'thick'
          ? '<==>'
          : d.stroke === 'dotted'
            ? '<-.->'
            : '<-->';
    } else if (d?.stroke === 'thick') {
      arrow = d.arrowType === 'none' ? '===' : '==>';
    } else if (d?.stroke === 'dotted') {
      arrow = d.arrowType === 'none' ? '-.-' : '-.->';
    } else {
      // Start marker prefix
      let prefix = '';
      if (d?.startMarker === 'circle') prefix = 'o';
      else if (d?.startMarker === 'cross') prefix = 'x';

      if (d?.endMarker === 'circle') arrow = `${prefix}--o`;
      else if (d?.endMarker === 'cross') arrow = `${prefix}--x`;
      else arrow = d?.arrowType === 'none' ? `${prefix}---` : `${prefix}-->`;
    }

    let labelStr = '';
    if (edge.label) {
      labelStr = `|${escapeMermaidLabel(edge.label)}|`;
    }
    lines.push(
      `    ${edge.sourceId} ${arrow}${labelStr} ${edge.targetId}`,
    );
  }

  // Emit class assignments
  const classAssignments = new Map<string, string[]>();
  for (const node of graph.nodes) {
    if (node.data?.classes) {
      for (const cls of node.data.classes) {
        if (!classAssignments.has(cls)) classAssignments.set(cls, []);
        classAssignments.get(cls)!.push(node.id);
      }
    }
  }
  for (const [cls, nodeIds] of classAssignments) {
    lines.push(`    class ${nodeIds.join(',')} ${cls}`);
  }

  // Emit linkStyle directives with recomputed indices. Group edges that share
  // an identical style so multi-index `linkStyle 0,2 ...` lines round-trip.
  if (gd?.defaultLinkStyle) {
    const propsStr = Object.entries(gd.defaultLinkStyle)
      .map(([k, v]) => `${k}:${v}`)
      .join(',');
    lines.push(`    linkStyle default ${propsStr}`);
  }
  const styleGroups = new Map<string, number[]>();
  graph.edges.forEach((edge, idx) => {
    const ls = edge.data?.linkStyle;
    if (ls && Object.keys(ls).length > 0) {
      const key = Object.entries(ls)
        .map(([k, v]) => `${k}:${v}`)
        .join(',');
      if (!styleGroups.has(key)) styleGroups.set(key, []);
      styleGroups.get(key)!.push(idx);
    }
  });
  for (const [propsStr, indices] of styleGroups) {
    lines.push(`    linkStyle ${indices.join(',')} ${propsStr}`);
  }

  // Emit click directives (structured form; falls back to legacy `link` field).
  for (const node of graph.nodes) {
    const click = node.data?.click;
    if (click) {
      const tip = click.tooltip
        ? ` "${escapeMermaidLabel(click.tooltip)}"`
        : '';
      if (click.kind === 'href') {
        const target = click.linkTarget ? ` ${click.linkTarget}` : '';
        lines.push(
          `    click ${node.id} href "${escapeMermaidLabel(click.target)}"${tip}${target}`,
        );
      } else {
        const kw = click.explicitCall ? 'call ' : '';
        lines.push(`    click ${node.id} ${kw}${click.target}${tip}`);
      }
    } else if (node.data?.link) {
      const tip = node.data.tooltip ? ` "${escapeMermaidLabel(node.data.tooltip)}"` : '';
      lines.push(`    click ${node.id} "${escapeMermaidLabel(node.data.link)}"${tip}`);
    }
  }

  return lines.join('\n');
}

/**
 * Bidirectional converter for Mermaid flowchart format.
 *
 * @example
 * const graph = mermaidFlowchartConverter.from(`
 * flowchart TD
 *     A --> B
 * `);
 * const str = mermaidFlowchartConverter.to(graph);
 */
export const mermaidFlowchartConverter: GraphFormatConverter<
  string, FlowchartNodeData, FlowchartEdgeData, FlowchartGraphData
> = createFormatConverter(toMermaidFlowchart, fromMermaidFlowchart);
