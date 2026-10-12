import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';
import {
  validateInput,
  prepareLines,
  getMermaidPreamble,
  type MermaidSourceData,
  MERMAID_TO_DIRECTION,
  DIRECTION_TO_MERMAID,
  escapeMermaidLabel,
  unescapeMermaidLabel,
  generateEdgeId,
} from './shared';

// --- Types ---

export interface ClassNodeData {
  namespace?: boolean;
  notes?: string[];
  classes?: string[];
  members?: Array<{
    visibility: '+' | '-' | '#' | '~';
    name: string;
    type?: string;
    isMethod: boolean;
  }>;
  annotation?: string;
  /**
   * Generic type parameter inside `~...~` (e.g. `List~int~` → `"int"`,
   * `Map~K, V~` → `"K, V"`). Preserved as the raw inner string rather than a
   * parsed structure: Mermaid treats the generic as opaque display text, so a
   * verbatim round-trip is both simpler and lossless. Emit re-wraps in `~...~`.
   */
  genericType?: string;
}

export interface ClassEdgeData {
  relationType:
    | 'inheritance'
    | 'composition'
    | 'aggregation'
    | 'association'
    | 'dependency'
    | 'realization'
    | 'link'
    | 'dashed'
    | 'lollipop';
  sourceCardinality?: string;
  targetCardinality?: string;
  sourceMarker?: string;
  targetMarker?: string;
  lineStyle?: 'solid' | 'dashed';
}

export interface ClassGraphData extends MermaidSourceData {
  diagramType: 'classDiagram';
  notes?: string[];
  classDefs?: Record<string, Record<string, string>>;
}

export type MermaidClassGraph = Graph<ClassNodeData, ClassEdgeData, ClassGraphData>;
type ClassNode = GraphNode<ClassNodeData>;
type ClassEdge = GraphEdge<ClassEdgeData>;

// --- Relationship arrows ---

// Ordered longest-first for greedy match
const RELATIONSHIP_ARROWS: [string, ClassEdgeData['relationType'], boolean][] = [
  ['--()', 'lollipop', false],
  ['()--', 'lollipop', true],
  // [arrow, relationType, reversed] — reversed means target is on the left
  ['<|--', 'inheritance', true],
  ['--|>', 'inheritance', false],
  ['<|..', 'realization', true],
  ['..|>', 'realization', false],
  ['*--', 'composition', true],
  ['--*', 'composition', false],
  ['o--', 'aggregation', true],
  ['--o', 'aggregation', false],
  ['<--', 'association', true],
  ['-->', 'association', false],
  ['<..', 'dependency', true],
  ['..>', 'dependency', false],
  ['--', 'link', false],
  ['..', 'dashed', false],
];

function parseRelationship(line: string): {
  leftClass: string;
  rightClass: string;
  relationType: ClassEdgeData['relationType'];
  label: string;
  leftCard?: string;
  rightCard?: string;
  sourceMarker?: string;
  targetMarker?: string;
  lineStyle?: 'solid' | 'dashed';
} | null {
  const twoSided = line.match(/^(.+?)\s*(<\||\*|o|<)(--|\.\.)(\|>|\*|o|>)\s*(.+)$/);
  if (twoSided) {
    const relationship = parseRelationship(`${twoSided[1]} ${twoSided[3]} ${twoSided[5]}`);
    if (relationship) return { ...relationship, sourceMarker: twoSided[2], targetMarker: twoSided[4], lineStyle: twoSided[3] === '--' ? 'solid' : 'dashed' };
  }
  for (const [arrow, relationType, reversed] of RELATIONSHIP_ARROWS) {
    const idx = line.indexOf(arrow);
    if (idx < 0) continue;

    let left = line.slice(0, idx).trim();
    let right = line.slice(idx + arrow.length).trim();

    // Check for label after colon
    let label = '';
    const colonIdx = right.indexOf(':');
    if (colonIdx >= 0) {
      label = right.slice(colonIdx + 1).trim();
      right = right.slice(0, colonIdx).trim();
    }

    // Check for cardinality: "1" ClassName or ClassName "1..*"
    let leftCard: string | undefined;
    let rightCard: string | undefined;

    const leftCardMatch = left.match(/^"([^"]+)"\s+(.+)$/);
    if (leftCardMatch) {
      leftCard = unescapeMermaidLabel(leftCardMatch[1]);
      left = leftCardMatch[2].trim();
    } else {
      const leftCardTrail = left.match(/^(.+?)\s+"([^"]+)"$/);
      if (leftCardTrail) {
        leftCard = unescapeMermaidLabel(leftCardTrail[2]);
        left = leftCardTrail[1].trim();
      }
    }

    const rightCardMatch = right.match(/^"([^"]+)"\s+(.+)$/);
    if (rightCardMatch) {
      rightCard = unescapeMermaidLabel(rightCardMatch[1]);
      right = rightCardMatch[2].trim();
    } else {
      const rightCardTrail = right.match(/^(.+?)\s+"([^"]+)"$/);
      if (rightCardTrail) {
        rightCard = unescapeMermaidLabel(rightCardTrail[2]);
        right = rightCardTrail[1].trim();
      }
    }

    if (!left || !right) continue;

    if (reversed) {
      return {
        leftClass: right,
        rightClass: left,
        relationType,
        label,
        leftCard: rightCard,
        rightCard: leftCard,
      };
    }

    return {
      leftClass: left,
      rightClass: right,
      relationType,
      label,
      leftCard,
      rightCard,
    };
  }
  return null;
}

// --- Member parsing ---

function parseMember(line: string): {
  visibility: '+' | '-' | '#' | '~';
  name: string;
  type?: string;
  isMethod: boolean;
} {
  const trimmed = line.trim();
  let visibility: '+' | '-' | '#' | '~' = '+';
  let rest = trimmed;

  if (/^[+\-#~]/.test(rest)) {
    visibility = rest[0] as '+' | '-' | '#' | '~';
    rest = rest.slice(1).trim();
  }

  const isMethod = rest.includes('(');

  // Try to extract return type: name() ReturnType or Type name
  let name = rest;
  let type: string | undefined;

  if (isMethod) {
    // method() ReturnType or method(args) ReturnType
    const methodMatch = rest.match(/^(.+\))\s*(.+)?$/);
    if (methodMatch) {
      name = methodMatch[1];
      type = methodMatch[2];
    }
  } else {
    // Type name or name Type
    const fieldMatch = rest.match(/^(\S+)\s+(\S+)$/);
    if (fieldMatch) {
      type = fieldMatch[1];
      name = fieldMatch[2];
    }
  }

  return { visibility, name, type, isMethod };
}

// --- Parser ---

/**
 * Parses a Mermaid class diagram string into a Graph.
 *
 * @example
 * const graph = fromMermaidClass(`
 * classDiagram
 *     class Animal {
 *         +String name
 *         +eat() void
 *     }
 *     Animal <|-- Dog
 * `);
 */
export function fromMermaidClass(input: string): MermaidClassGraph {
  validateInput(input, 'Mermaid class');
  const prepared = prepareLines(input);
  const { lines } = prepared;
  let source = prepared.source;

  const header = lines[0]?.trim();
  if (!header || !header.startsWith('classDiagram')) {
    throw new Error('Mermaid class: expected "classDiagram" header');
  }

  const nodeMap = new Map<string, ClassNode>();
  const edges: ClassEdge[] = [];
  let edgeCounter = 0;
  const namespaceStack: string[] = [];
  const notes: string[] = [];
  const classDefs: Record<string, Record<string, string>> = Object.create(null);
  let direction: MermaidClassGraph['direction'];

  function ensureNode(id: string): ClassNode {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        type: 'node',
        id,
        parentId: namespaceStack[namespaceStack.length - 1] ?? null,
        initialNodeId: null,
        label: id,
        data: {},
      });
    }
    return nodeMap.get(id)!;
  }

  let currentClass: string | null = null;
  let inClassBlock = false;
  let braceDepth = 0;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (!inClassBlock) {
      const namespaceMatch = line.match(/^namespace\s+([^\s\[{}]+)(?:\["?([^\]"]*)"?\])?\s*\{$/);
      if (namespaceMatch) {
        const rawId = namespaceMatch[1];
        const parentId = namespaceStack[namespaceStack.length - 1];
        const namespaceId = parentId && !rawId.startsWith(parentId + '.') ? `${parentId}.${rawId}` : rawId;
        const segments = namespaceId.split('.');
        for (let count = 1; count <= segments.length; count++) {
          const id = segments.slice(0, count).join('.');
          const node = ensureNode(id);
          node.parentId = count > 1 ? segments.slice(0, count - 1).join('.') : null;
          node.data.namespace = true;
        }
        if (namespaceMatch[2]) nodeMap.get(namespaceId)!.label = unescapeMermaidLabel(namespaceMatch[2]);
        namespaceStack.push(namespaceId);
        continue;
      }
      if (line === '}' && namespaceStack.length) { namespaceStack.pop(); continue; }
      const directionMatch = line.match(/^direction\s+(TB|TD|BT|LR|RL)$/);
      if (directionMatch) { direction = MERMAID_TO_DIRECTION[directionMatch[1]]; continue; }
      const noteMatch = line.match(/^note(?:\s+for\s+(\S+))?\s+"([\s\S]*)"$/);
      if (noteMatch) {
        const text = unescapeMermaidLabel(noteMatch[2]);
        if (noteMatch[1]) (ensureNode(noteMatch[1]).data.notes ??= []).push(text);
        else notes.push(text);
        continue;
      }
      const styleMatch = line.match(/^(style|classDef)\s+(\S+)\s+(.+)$/);
      if (styleMatch) {
        const properties: Record<string, string> = Object.create(null);
        for (const entry of styleMatch[3].split(',')) {
          const separator = entry.indexOf(':');
          if (separator >= 0) properties[entry.slice(0, separator).trim()] = entry.slice(separator + 1).trim().replace(/;$/, '');
        }
        if (styleMatch[1] === 'style') ensureNode(styleMatch[2]).style = properties;
        else classDefs[styleMatch[2]] = properties;
        continue;
      }
      const cssMatch = line.match(/^cssClass\s+"([^"]+)"\s+(\S+?);?$/);
      if (cssMatch) {
        for (const id of cssMatch[1].split(',')) (ensureNode(id.trim()).data.classes ??= []).push(cssMatch[2]);
        continue;
      }
      const aliasMatch = line.match(/^class\s+([^\s\[]+)\["?([\s\S]*?)"?\]$/);
      if (aliasMatch) {
        ensureNode(aliasMatch[1]).label = unescapeMermaidLabel(aliasMatch[2]);
        continue;
      }
    }

    // Class block: class ClassName {
    const classBlockMatch = line.match(/^class\s+(\S+?)(?:~(.+?)~)?\s*\{\s*$/);
    if (classBlockMatch) {
      currentClass = classBlockMatch[1];
      const node = ensureNode(currentClass);
      if (classBlockMatch[2]) {
        node.data ??= {};
        node.data.genericType = classBlockMatch[2];
      }
      inClassBlock = true;
      braceDepth = 1;
      continue;
    }

    // Inside class block
    if (inClassBlock && currentClass) {
      if (line === '}') {
        braceDepth--;
        if (braceDepth <= 0) {
          inClassBlock = false;
          currentClass = null;
        }
        continue;
      }

      // Annotation <<interface>> etc.
      const annotMatch = line.match(/^<<(.+)>>$/);
      if (annotMatch) {
        const node = nodeMap.get(currentClass)!;
        node.data ??= {};
        node.data.annotation = annotMatch[1];
        continue;
      }

      // Member line
      const node = nodeMap.get(currentClass)!;
      node.data ??= {};
      if (!node.data.members) node.data.members = [];
      node.data.members.push(parseMember(line));
      continue;
    }

    // Inline class declaration: class ClassName
    const classInlineMatch = line.match(/^class\s+(\S+?)(?:~(.+?)~)?\s*$/);
    if (classInlineMatch) {
      const node = ensureNode(classInlineMatch[1]);
      if (classInlineMatch[2]) {
        node.data ??= {};
        node.data.genericType = classInlineMatch[2];
      }
      continue;
    }

    // Annotation on existing class: <<interface>> ClassName
    const annotLineMatch = line.match(/^<<(.+)>>\s+(\S+)\s*$/);
    if (annotLineMatch) {
      const node = ensureNode(annotLineMatch[2]);
      node.data ??= {};
      node.data.annotation = annotLineMatch[1];
      continue;
    }

    // Inline member: ClassName : +method() or ClassName : -field
    const inlineMemberMatch = line.match(/^(\S+)\s*:\s*(.+)$/);
    if (inlineMemberMatch) {
      // Check it's not a relationship label
      const possibleRel = parseRelationship(line);
      if (!possibleRel) {
        const node = ensureNode(inlineMemberMatch[1]);
        node.data ??= {};
        if (!node.data.members) node.data.members = [];
        node.data.members.push(parseMember(inlineMemberMatch[2]));
        continue;
      }
    }

    // Relationship
    const rel = parseRelationship(line);
    if (rel) {
      ensureNode(rel.leftClass);
      ensureNode(rel.rightClass);
      const edgeId = generateEdgeId(rel.leftClass, rel.rightClass, edgeCounter++);
      edges.push({
        type: 'edge',
        id: edgeId,
        sourceId: rel.leftClass,
        targetId: rel.rightClass,
        label: rel.label ? unescapeMermaidLabel(rel.label) : '',
        mode: rel.sourceMarker && rel.targetMarker ? 'bidirectional' : ['link', 'dashed'].includes(rel.relationType) ? 'undirected' : 'directed',
        data: {
          relationType: rel.relationType,
          ...(rel.leftCard && { sourceCardinality: rel.leftCard }),
          ...(rel.rightCard && { targetCardinality: rel.rightCard }),
          ...(rel.sourceMarker && { sourceMarker: rel.sourceMarker, targetMarker: rel.targetMarker, lineStyle: rel.lineStyle }),
        },
      });
      continue;
    }
    ((source ??= {}).unknownStatements ??= []).push(line);
  }

  return {
    id: '',
    mode: 'directed',
    initialNodeId: null,
    nodes: Array.from(nodeMap.values()),
    edges,
    data: { diagramType: 'classDiagram', ...(source && { source }), ...(notes.length && { notes }), ...(Object.keys(classDefs).length && { classDefs }) },
    ...(direction && { direction }),
  };
}

// --- Serializer ---

const RELATION_TO_ARROW: Record<ClassEdgeData['relationType'], string> = {
  inheritance: '--|>',
  composition: '--*',
  aggregation: '--o',
  association: '-->',
  dependency: '..>',
  realization: '..|>',
  link: '--',
  dashed: '..',
  lollipop: '--()',
};

const VISIBILITY_SYMBOLS: Record<string, string> = {
  '+': '+',
  '-': '-',
  '#': '#',
  '~': '~',
};

/**
 * Converts a class diagram Graph to a Mermaid class diagram string.
 *
 * @example
 * const mermaid = toMermaidClass(graph);
 * // "classDiagram\n    class Animal {\n    ..."
 */
export function toMermaidClass(graph: MermaidClassGraph): string {
  const lines: string[] = [...getMermaidPreamble(graph.data ?? {}), 'classDiagram'];

  if (graph.direction) lines.push(`    direction ${DIRECTION_TO_MERMAID[graph.direction]}`);
  const children = new Map<string | null, typeof graph.nodes>();
  for (const node of graph.nodes) {
    const parent = node.parentId ?? null;
    const list = children.get(parent) ?? [];
    list.push(node);
    children.set(parent, list);
  }
  const stack: Array<{ node?: typeof graph.nodes[0]; indent: string }> = (children.get(null) ?? []).slice().reverse().map((node) => ({ node, indent: '    ' }));
  while (stack.length) {
    const item = stack.pop()!;
    if (!item.node) { lines.push(`${item.indent}}`); continue; }
    const node = item.node;
    const nodeIndent = item.indent;
    if (node.data?.namespace) {
      const label = node.label && node.label !== node.id ? `["${escapeMermaidLabel(node.label)}"]` : '';
      lines.push(`${nodeIndent}namespace ${node.id}${label} {`);
      stack.push({ indent: nodeIndent });
      for (const child of (children.get(node.id) ?? []).slice().reverse()) stack.push({ node: child, indent: nodeIndent + '    ' });
      continue;
    }
    if (node.label && node.label !== node.id) lines.push(`${nodeIndent}class ${node.id}["${escapeMermaidLabel(node.label)}"]`);
    const generic = node.data?.genericType ? `~${node.data.genericType}~` : '';
    if (node.data?.members?.length) {
      lines.push(`${nodeIndent}class ${node.id}${generic} {`);
      if (node.data.annotation) lines.push(`${nodeIndent}    <<${node.data.annotation}>>`);
      for (const member of node.data.members) {
        const visibility = VISIBILITY_SYMBOLS[member.visibility] ?? '+';
        const type = member.type ? (member.isMethod ? ` ${member.type}` : `${member.type} `) : '';
        lines.push(member.isMethod
          ? `${nodeIndent}    ${visibility}${member.name}${type}`
          : `${nodeIndent}    ${visibility}${type}${member.name}`);
      }
      lines.push(`${nodeIndent}}`);
    } else {
      lines.push(`${nodeIndent}class ${node.id}${generic}`);
      if (node.data?.annotation) lines.push(`${nodeIndent}<<${node.data.annotation}>> ${node.id}`);
    }
    for (const note of node.data?.notes ?? []) lines.push(`${nodeIndent}note for ${node.id} "${escapeMermaidLabel(note)}"`);
    if (node.style) lines.push(`${nodeIndent}style ${node.id} ${Object.entries(node.style).map(([key, value]) => `${key}:${value}`).join(',')}`);
    for (const name of node.data?.classes ?? []) lines.push(`${nodeIndent}cssClass "${node.id}" ${name}`);
  }
  for (const note of graph.data?.notes ?? []) lines.push(`    note "${escapeMermaidLabel(note)}"`);
  for (const [name, properties] of Object.entries(graph.data?.classDefs ?? {})) lines.push(`    classDef ${name} ${Object.entries(properties).map(([key, value]) => `${key}:${value}`).join(',')}`);

  // Emit relationships
  for (const edge of graph.edges) {
    const arrow = edge.data?.sourceMarker && edge.data.targetMarker
      ? `${edge.data.sourceMarker}${edge.data.lineStyle === 'dashed' ? '..' : '--'}${edge.data.targetMarker}`
      : RELATION_TO_ARROW[edge.data?.relationType ?? 'association'] ?? '-->';
    const srcCard = edge.data?.sourceCardinality
      ? ` "${escapeMermaidLabel(edge.data.sourceCardinality)}"`
      : '';
    const tgtCard = edge.data?.targetCardinality
      ? ` "${escapeMermaidLabel(edge.data.targetCardinality)}"`
      : '';
    const label = edge.label ? ` : ${escapeMermaidLabel(edge.label)}` : '';
    lines.push(
      `    ${edge.sourceId}${srcCard} ${arrow}${tgtCard} ${edge.targetId}${label}`,
    );
  }

  return lines.join('\n');
}

/**
 * Bidirectional converter for Mermaid class diagram format.
 *
 * @example
 * const graph = mermaidClassConverter.from(`
 * classDiagram
 *     Animal <|-- Dog
 * `);
 * const str = mermaidClassConverter.to(graph);
 */
export const mermaidClassConverter: GraphFormatConverter<
  string, ClassNodeData, ClassEdgeData, ClassGraphData
> = createFormatConverter(toMermaidClass, fromMermaidClass);
