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

export interface ClassNodeData {
  members?: Array<{
    visibility: '+' | '-' | '#' | '~';
    name: string;
    type?: string;
    isMethod: boolean;
  }>;
  annotation?: string;
  // TODO: generics (List~int~) stored as raw string, tilde syntax not fully parsed
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
    | 'dashed';
  sourceCardinality?: string;
  targetCardinality?: string;
}

export interface ClassGraphData {
  diagramType: 'classDiagram';
}

export type MermaidClassGraph = Graph<ClassNodeData, ClassEdgeData, ClassGraphData>;
type ClassNode = GraphNode<ClassNodeData>;
type ClassEdge = GraphEdge<ClassEdgeData>;

// --- Relationship arrows ---

// Ordered longest-first for greedy match
const RELATIONSHIP_ARROWS: [string, ClassEdgeData['relationType'], boolean][] = [
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
} | null {
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
      leftCard = leftCardMatch[1];
      left = leftCardMatch[2].trim();
    } else {
      const leftCardTrail = left.match(/^(.+?)\s+"([^"]+)"$/);
      if (leftCardTrail) {
        leftCard = leftCardTrail[2];
        left = leftCardTrail[1].trim();
      }
    }

    const rightCardMatch = right.match(/^"([^"]+)"\s+(.+)$/);
    if (rightCardMatch) {
      rightCard = rightCardMatch[1];
      right = rightCardMatch[2].trim();
    } else {
      const rightCardTrail = right.match(/^(.+?)\s+"([^"]+)"$/);
      if (rightCardTrail) {
        rightCard = rightCardTrail[2];
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
  const { lines } = prepareLines(input);

  const header = lines[0]?.trim();
  if (!header || !header.startsWith('classDiagram')) {
    throw new Error('Mermaid class: expected "classDiagram" header');
  }

  const nodeMap = new Map<string, ClassNode>();
  const edges: ClassEdge[] = [];
  let edgeCounter = 0;

  function ensureNode(id: string): ClassNode {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, {
        type: 'node',
        id,
        parentId: null,
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
        data: {
          relationType: rel.relationType,
          ...(rel.leftCard && { sourceCardinality: rel.leftCard }),
          ...(rel.rightCard && { targetCardinality: rel.rightCard }),
        },
      });
      continue;
    }
  }

  return {
    id: '',
    mode: 'directed',
    initialNodeId: null,
    nodes: Array.from(nodeMap.values()),
    edges,
    data: { diagramType: 'classDiagram' },
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
  const lines: string[] = ['classDiagram'];

  // Emit classes with members
  for (const node of graph.nodes) {
    if (node.data?.members && node.data.members.length > 0) {
      const generic = node.data.genericType ? `~${node.data.genericType}~` : '';
      lines.push(`    class ${node.id}${generic} {`);
      if (node.data.annotation) {
        lines.push(`        <<${node.data.annotation}>>`);
      }
      for (const m of node.data.members) {
        const vis = VISIBILITY_SYMBOLS[m.visibility] ?? '+';
        const typeStr = m.type ? (m.isMethod ? ` ${m.type}` : `${m.type} `) : '';
        if (m.isMethod) {
          lines.push(`        ${vis}${m.name}${typeStr}`);
        } else {
          lines.push(`        ${vis}${typeStr}${m.name}`);
        }
      }
      lines.push(`    }`);
    } else {
      // Bare class declaration
      const generic = node.data?.genericType ? `~${node.data.genericType}~` : '';
      lines.push(`    class ${node.id}${generic}`);
      if (node.data?.annotation) {
        lines.push(`    <<${node.data.annotation}>> ${node.id}`);
      }
    }
  }

  // Emit relationships
  for (const edge of graph.edges) {
    const arrow = RELATION_TO_ARROW[edge.data?.relationType ?? 'association'] ?? '-->';
    const srcCard = edge.data?.sourceCardinality
      ? `"${edge.data.sourceCardinality}" `
      : '';
    const tgtCard = edge.data?.targetCardinality
      ? ` "${edge.data.targetCardinality}"`
      : '';
    const label = edge.label ? ` : ${escapeMermaidLabel(edge.label)}` : '';
    lines.push(
      `    ${srcCard}${edge.sourceId} ${arrow} ${edge.targetId}${tgtCard}${label}`,
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
