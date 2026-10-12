import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import { getEdgeMode } from '../../mode';
import {
  validateInput,
  prepareLines,
  getMermaidPreamble,
  type MermaidSourceData,
  getMermaidProperties,
  getMermaidStyle,
  isMermaidEscaped,
  toMermaidProperties,
  escapeMermaidLabel,
  getMermaidIdDisplay,
  unescapeMermaidLabel,
  escapeMermaidId,
  unescapeMermaidId,
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
  properties?: Record<string, string | number | boolean>;
  classes?: string[];
  /** @deprecated Legacy hyperlink field. New parses populate `click` instead. */
  link?: string;
  tooltip?: string;
  direction?: 'up' | 'down' | 'left' | 'right';
  /** Structured `click` interaction, preserved round-trip. */
  click?: FlowchartClick;
}

export interface FlowchartEdgeData {
  properties?: Record<string, string | number | boolean>;
  explicitId?: boolean;
  arrowToken?: string;
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

export interface FlowchartGraphData extends MermaidSourceData {
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
  label?: string;
  shape?: string;
  properties?: Record<string, string | number | boolean>;
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
  const atMatch = text.match(/^([^\s@]+)@\{(.+)\}$/s);
  if (atMatch) {
    const id = atMatch[1];
    const body = atMatch[2].trim();
    const properties = getMermaidProperties(body);
    return { id, ...(properties.label !== undefined && { label: String(properties.label) }),
      ...(properties.shape !== undefined && { shape: String(properties.shape) }), properties, ...(className && { className }) };
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
    return { id, label: getDecodedNodeLabel(label.trim()), shape: shapeName, ...(className && { className }) };
  }
  // Bare node ID (no brackets). Accept entity-encoded ids (`#NN;`) from
  // pre-release converter versions too.
  if (/^[\p{L}\p{N}_#;.-]+$/u.test(text)) {
    return { id: text, ...(className && { className }) };
  }
  return null;
}

function getDecodedNodeLabel(label: string): string {
  const unquoted = label.startsWith('"') && label.endsWith('"')
    ? label.slice(1, -1)
    : label;
  return unescapeMermaidLabel(unquoted);
}

/** Split delimiters outside quoted labels and node shapes. */
function getTopLevelParts(input: string, separator: string): string[] {
  const parts: string[] = [];
  let start = 0;
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (char === '"' && !isMermaidEscaped(input, i)) quoted = !quoted;
    if (!quoted) {
      if ('[({'.includes(char)) depth++;
      if ('])}'.includes(char)) depth = Math.max(0, depth - 1);
      const entityTerminator = separator === ';' && /#(?:quot|\d+)$/i.test(input.slice(0, i));
      if (depth === 0 && !entityTerminator && input.startsWith(separator, i)) {
        const part = input.slice(start, i).trim();
        if (part) parts.push(part);
        i += separator.length - 1;
        start = i + 1;
      }
    }
  }
  const last = input.slice(start).trim();
  if (last) parts.push(last);
  return parts;
}

function getTopLevelArrows(line: string): { start: number; end: number; arrow: string; label?: string }[] {
  const arrows: { start: number; end: number; arrow: string; label?: string }[] = [];
  let depth = 0;
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' && !isMermaidEscaped(line, i)) quoted = !quoted;
    if (quoted) continue;
    if ('[({'.includes(char)) depth++;
    if ('])}'.includes(char)) depth = Math.max(0, depth - 1);
    if (depth !== 0) continue;

    const arrow = line.slice(i).match(/^(?:<|o|x)?(?:-{2,}[>ox]?|-\.+-[>ox]?|={2,}[>ox]?|~{3,})/)?.[0] ?? '';
    if (!arrow) continue;
    let end = i + arrow.length;
    let label: string | undefined;
    if (line[end] === '|') {
      const labelEnd = line.indexOf('|', end + 1);
      if (labelEnd < 0) return [];
      label = line.slice(end + 1, labelEnd);
      end = labelEnd + 1;
    }
    arrows.push({ start: i, end, arrow, label });
    i = end - 1;
  }
  return arrows;
}

function getExpandedCompactLinks(line: string): string[] {
  const arrows = getTopLevelArrows(line);
  if (!arrows.length) return [line];
  const chain = arrows.map((arrow, i) => line.slice(i === 0 ? 0 : arrows[i - 1].end, arrow.start).trim());
  chain.push(line.slice(arrows[arrows.length - 1].end).trim());
  if (chain.some((part) => !part)) return [line];
  const groups = chain.map((part) => getTopLevelParts(part, '&'));
  if (groups.every((group) => group.length === 1)) return [line];
  const links: string[] = [];
  for (let i = 0; i < groups.length - 1; i++) {
    for (const source of groups[i]) {
      for (const target of groups[i + 1]) {
        links.push(`${source} ${line.slice(arrows[i].start, arrows[i].end)} ${target}`);
      }
    }
  }
  return links;
}

// --- Edge parsing ---

interface EdgeArrowInfo {
  stroke: 'normal' | 'dotted' | 'thick' | 'invisible';
  arrowType: 'arrow' | 'none';
  endMarker: 'arrow' | 'circle' | 'cross';
  startMarker?: 'arrow' | 'circle' | 'cross';
  bidirectional: boolean;
  label: string;
  arrowToken?: string;
  edgeId?: string;
}

function getFlowchartArrowInfo(arrow: string): Omit<EdgeArrowInfo, 'label'> | undefined {
  const original = EDGE_ARROWS.find(([pattern]) => pattern.test(arrow));
  if (original) return { ...original[1], arrowToken: arrow };
  if (!/^(?:[<ox])?(?:-{2,}[>ox]?|-\.+-[>ox]?|={2,}[>ox]?|~{3,})$/.test(arrow)) return undefined;
  return { stroke: arrow.includes('~') ? 'invisible' : arrow.includes('=') ? 'thick' : arrow.includes('.') ? 'dotted' : 'normal',
    arrowType: /[>ox]$/.test(arrow) ? 'arrow' : 'none', endMarker: arrow.endsWith('o') ? 'circle' : arrow.endsWith('x') ? 'cross' : 'arrow',
    ...(arrow.startsWith('o') ? { startMarker: 'circle' as const } : arrow.startsWith('x') ? { startMarker: 'cross' as const } : arrow.startsWith('<') ? { startMarker: 'arrow' as const } : {}),
    bidirectional: arrow.startsWith('<') && arrow.endsWith('>'), arrowToken: arrow };
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
  // The scanner isolates complete connectors outside quoted shapes. This
  // avoids treating additional minimum-length dashes as part of the source ID.
  const scanned = getTopLevelArrows(line).find((entry) => entry.arrow !== '--');
  if (scanned && !/^.+\s+--\s+.+\s+-->/.test(line)) {
    const info = getFlowchartArrowInfo(scanned.arrow);
    if (info) {
      let sourceText = line.slice(0, scanned.start).trim();
      const edgeIdMatch = sourceText.match(/^(.*?)\s+([^\s@]+)@$/);
      if (edgeIdMatch) sourceText = edgeIdMatch[1];
      return { sourceText, targetText: line.slice(scanned.end).trim(),
        info: { ...info, label: scanned.label?.trim() ?? '', ...(edgeIdMatch && { edgeId: edgeIdMatch[2] }) }, rest: '' };
    }
  }
  // Strategy: scan for arrow patterns in the line
  // First try the pipe-label form: A -->|label| B
  const pipeArrow = getTopLevelArrows(line).find((arrow) => arrow.label !== undefined);
  if (pipeArrow) {
    const arrowStr = pipeArrow.arrow;
    for (const [re, info] of EDGE_ARROWS) {
      if (re.test(arrowStr)) {
        return {
          sourceText: line.slice(0, pipeArrow.start).trim(),
          targetText: line.slice(pipeArrow.end).trim(),
          info: { ...info, label: pipeArrow.label?.trim() ?? '' },
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
      target: unescapeMermaidLabel(m[1]),
      ...(m[2] && { tooltip: unescapeMermaidLabel(m[2]) }),
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
      ...(callMatch[2] && { tooltip: unescapeMermaidLabel(callMatch[2]) }),
    };
  }
  const bareMatch = rest.match(/^(\S+)(?:\s+"([^"]*)")?\s*$/);
  if (bareMatch) {
    return {
      kind: 'callback',
      target: bareMatch[1],
      ...(bareMatch[2] && { tooltip: unescapeMermaidLabel(bareMatch[2]) }),
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
  const prepared = prepareLines(input);
  const { lines, directives } = prepared;
  let source = prepared.source;

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
  const edgeProperties = new Map<string, Record<string, string | number | boolean>>();
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
    if (label !== undefined) node.label = label;
    if (shape) {
      if (shape === 'rectangle' || shape === 'rect') delete node.shape;
      else node.shape = shape;
    }
    // Apply ::: inline class
    if (className) {
      if (!classAssignments[id]) classAssignments[id] = [];
      if (!classAssignments[id].includes(className)) classAssignments[id].push(className);
    }
    return node;
  }

  const statements = lines.slice(1)
    .flatMap((line) => getTopLevelParts(line, ';'))
    .flatMap(getExpandedCompactLinks);
  for (const statement of statements) {
    const line = statement.trim();
    if (!line) continue;
    const propertyMatch = line.match(/^([^\s@]+)@\{([\s\S]+)\}$/);
    const propertyEdge = propertyMatch && edges.find((edge) => edge.id === propertyMatch[1]);
    if (propertyEdge && propertyMatch) {
      propertyEdge.data.properties = { ...propertyEdge.data.properties, ...getMermaidProperties(propertyMatch[2]) };
      continue;
    }
    if (propertyMatch) {
      const properties = getMermaidProperties(propertyMatch[2]);
      if (Object.keys(properties).some((key) => ['animate', 'animation', 'curve'].includes(key))) {
        edgeProperties.set(propertyMatch[1], { ...edgeProperties.get(propertyMatch[1]), ...properties });
        continue;
      }
    }

    // subgraph
    const subgraphMatch = line.match(/^subgraph\s+(\S+?)(?:\s*\[(.+)\])?\s*$/);
    if (subgraphMatch) {
      const subId = subgraphMatch[1];
      const subLabel = subgraphMatch[2]?.trim() ?? unescapeMermaidId(subId);
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
      const props = getMermaidStyle(propsStr);
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
      const style = getMermaidStyle(propsStr);
      if (style.fill) node.color = style.fill;
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
      const props = getMermaidStyle(linkStyleMatch[2]);
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
        if (sourceDecl.properties) nodeMap.get(sourceDecl.id)!.data.properties = { ...nodeMap.get(sourceDecl.id)!.data.properties, ...sourceDecl.properties };
      }

      // Parse target — might have more edges chained
      const targetDecl = parseNodeDecl(edgeResult.targetText);
      let targetId: string;
      if (targetDecl) {
        ensureNode(targetDecl.id, targetDecl.label, targetDecl.shape, targetDecl.className);
        if (targetDecl.properties) nodeMap.get(targetDecl.id)!.data.properties = { ...nodeMap.get(targetDecl.id)!.data.properties, ...targetDecl.properties };
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

      const info = edgeResult.info;
      const edgeId = info.edgeId ?? generateEdgeId(sourceId, targetId, edgeCounter);
      edgeCounter++;
      edges.push({
        type: 'edge',
        id: edgeId,
        sourceId,
        targetId,
        label: info.label ? unescapeMermaidLabel(info.label) : '',
        mode: info.bidirectional ? 'bidirectional' : info.arrowType === 'none' ? 'undirected' : 'directed',
        data: {
          ...(info.edgeId && { explicitId: true }),
          ...(info.arrowToken && { arrowToken: info.arrowToken }),
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
      if (nodeDecl.properties) nodeMap.get(nodeDecl.id)!.data.properties = { ...nodeMap.get(nodeDecl.id)!.data.properties, ...nodeDecl.properties };
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
    ((source ??= {}).unknownStatements ??= []).push(line);
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

  // Ids were kept entity-encoded throughout the pass so every internal
  // reference (node map keys, parentId, edge endpoints, class targets) stayed
  // mutually consistent. Decode them once here, at the boundary, back to their
  // raw form (e.g. `#40;root#41;` → `(root)`).
  const decodedNodes = Array.from(nodeMap.values()).map((node) => ({
    ...node,
    id: unescapeMermaidId(node.id),
    parentId: node.parentId == null ? node.parentId : unescapeMermaidId(node.parentId),
  }));
  for (const [id, properties] of edgeProperties) {
    const edge = edges.find((entry) => entry.id === id);
    if (edge) edge.data.properties = { ...edge.data.properties, ...properties };
    else ((source ??= {}).unknownStatements ??= []).push(`${id}@{ ${toMermaidProperties(properties)} }`);
  }
  const decodedEdges = edges.map((edge, index) => ({
    ...edge,
    id: edge.data.explicitId ? unescapeMermaidId(edge.id) : generateEdgeId(unescapeMermaidId(edge.sourceId), unescapeMermaidId(edge.targetId), index),
    sourceId: unescapeMermaidId(edge.sourceId),
    targetId: unescapeMermaidId(edge.targetId),
  }));

  return {
    id: '',
    mode: 'directed',
    initialNodeId: null,
    nodes: decodedNodes,
    edges: decodedEdges,
    data: {
      diagramType: 'flowchart',
      ...(source && { source }),
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

  const lines: string[] = getMermaidPreamble(graph.data ?? {});
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
  const stack: Array<{ node?: FlowchartNode; indent: string }> = (childrenMap.get(null) ?? []).slice().reverse().map((node) => ({ node, indent: '    ' }));
  while (stack.length) {
    const { node, indent } = stack.pop()!;
    if (!node) { lines.push(`${indent}end`); continue; }
    const mermaidId = escapeMermaidId(node.id);
    const displayLabel = node.label || (mermaidId === node.id ? '' : getMermaidIdDisplay(node.id));
    if (isParent.has(node.id)) {
      const label = displayLabel ? `[${escapeMermaidLabel(displayLabel)}]` : '';
      lines.push(`${indent}subgraph ${mermaidId}${label}`);
      if (node.data?.direction) lines.push(`${indent}    direction ${DIRECTION_TO_MERMAID[node.data.direction] ?? 'TD'}`);
      stack.push({ indent });
      for (const child of (childrenMap.get(node.id) ?? []).slice().reverse()) stack.push({ node: child, indent: indent + '    ' });
    } else {
      const shape = node.shape ?? 'rectangle';
      if (node.data?.properties || !SHAPE_TO_BRACKETS[shape]) {
        const properties = { ...(node.data?.properties ?? {}),
          ...((node.shape || node.data?.properties?.shape !== undefined) && { shape }), label: node.label ?? getMermaidIdDisplay(node.id) };
        lines.push(`${indent}${mermaidId}@{ ${toMermaidProperties(properties)} }`);
      } else {
        const brackets = SHAPE_TO_BRACKETS[shape] ?? ['[', ']'];
        const label = displayLabel ? `${brackets[0]}${escapeMermaidLabel(displayLabel)}${brackets[1]}` : '';
        lines.push(`${indent}${mermaidId}${label}`);
      }
    }
  }

  for (const node of graph.nodes) {
    if (node.style && Object.keys(node.style).length) lines.push(`    style ${escapeMermaidId(node.id)} ${Object.entries(node.style).map(([key, value]) => `${key}:${value}`).join(',')}`);
  }

  // Emit edges
  for (const edge of graph.edges) {
    const d = edge.data;
    let arrow: string;
    const mode = edge.mode ?? (graph.mode !== 'directed' ? getEdgeMode(graph, edge) : d?.bidirectional ? 'bidirectional' : d?.arrowType === 'none' ? 'undirected' : getEdgeMode(graph, edge));
    if (mode === 'undirected') arrow = d?.stroke === 'thick' ? '===' : d?.stroke === 'dotted' ? '-.-' : d?.stroke === 'invisible' ? '~~~' : '---';
    else if (mode === 'bidirectional') arrow = d?.stroke === 'thick' ? '<==>' : d?.stroke === 'dotted' ? '<-.->' : '<-->';
    else if (d?.stroke === 'invisible') {
      arrow = '~~~';
    } else if (d?.stroke === 'thick') {
      arrow = '==>';
    } else if (d?.stroke === 'dotted') {
      arrow = '-.->';
    } else {
      // Start marker prefix
      let prefix = '';
      if (d?.startMarker === 'circle') prefix = 'o';
      else if (d?.startMarker === 'cross') prefix = 'x';

      if (d?.endMarker === 'circle') arrow = `${prefix}--o`;
      else if (d?.endMarker === 'cross') arrow = `${prefix}--x`;
      else arrow = `${prefix}-->`;
    }
    if (d?.arrowToken) {
      const authored = getFlowchartArrowInfo(d.arrowToken);
      const authoredMode = authored?.bidirectional ? 'bidirectional' : authored?.arrowType === 'none' ? 'undirected' : 'directed';
      if (authoredMode === mode && authored?.stroke === d.stroke
        && authored.arrowType === d.arrowType && authored.endMarker === (d.endMarker ?? 'arrow')
        && authored.startMarker === d.startMarker) arrow = d.arrowToken;
    }

    let labelStr = '';
    if (edge.label) {
      labelStr = `|${escapeMermaidLabel(edge.label)}|`;
    }
    lines.push(
      `    ${escapeMermaidId(edge.sourceId)} ${d?.explicitId ? `${escapeMermaidId(edge.id)}@` : ''}${arrow}${labelStr} ${escapeMermaidId(edge.targetId)}`,
    );
    if (d?.properties) lines.push(`    ${escapeMermaidId(edge.id)}@{ ${toMermaidProperties(d.properties)} }`);
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
    lines.push(`    class ${nodeIds.map(escapeMermaidId).join(',')} ${cls}`);
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
          `    click ${escapeMermaidId(node.id)} href "${escapeMermaidLabel(click.target)}"${tip}${target}`,
        );
      } else {
        const kw = click.explicitCall ? 'call ' : '';
        lines.push(`    click ${escapeMermaidId(node.id)} ${kw}${click.target}${tip}`);
      }
    } else if (node.data?.link) {
      const tip = node.data.tooltip ? ` "${escapeMermaidLabel(node.data.tooltip)}"` : '';
      lines.push(`    click ${escapeMermaidId(node.id)} "${escapeMermaidLabel(node.data.link)}"${tip}`);
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
