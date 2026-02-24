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

export interface ERNodeData {
  attributes?: Array<{
    type: string;
    name: string;
    key?: 'PK' | 'FK' | 'UK';
    comment?: string;
  }>;
}

export interface EREdgeData {
  sourceCardinality: 'one' | 'zero-or-one' | 'zero-or-more' | 'one-or-more';
  targetCardinality: 'one' | 'zero-or-one' | 'zero-or-more' | 'one-or-more';
  identifying: boolean;
}

export interface ERGraphData {
  diagramType: 'erDiagram';
}

type ERGraph = Graph<ERNodeData, EREdgeData, ERGraphData>;
type ERNode = GraphNode<ERNodeData>;
type EREdge = GraphEdge<EREdgeData>;

// --- Crow's foot notation parsing ---
//
// Left side (source):  || = one, |o = zero-or-one, }| = one-or-more, }o = zero-or-more
// Right side (target): || = one, o| = zero-or-one, |{ = one-or-more, o{ = zero-or-more
// Line style: -- = identifying (solid), .. = non-identifying (dashed)
//
// Pattern: <leftMarker><lineStyle><rightMarker>
// Example: ||--o{  means one (identifying) zero-or-more

const LEFT_CARDINALITY: Record<string, EREdgeData['sourceCardinality']> = {
  '||': 'one',
  '|o': 'zero-or-one',
  '}|': 'one-or-more',
  '}o': 'zero-or-more',
};

const RIGHT_CARDINALITY: Record<string, EREdgeData['targetCardinality']> = {
  '||': 'one',
  'o|': 'zero-or-one',
  '|{': 'one-or-more',
  'o{': 'zero-or-more',
};

const CARDINALITY_TO_LEFT: Record<string, string> = {
  one: '||',
  'zero-or-one': '|o',
  'one-or-more': '}|',
  'zero-or-more': '}o',
};

const CARDINALITY_TO_RIGHT: Record<string, string> = {
  one: '||',
  'zero-or-one': 'o|',
  'one-or-more': '|{',
  'zero-or-more': 'o{',
};

function parseERRelationship(symbol: string): {
  sourceCardinality: EREdgeData['sourceCardinality'];
  targetCardinality: EREdgeData['targetCardinality'];
  identifying: boolean;
} | null {
  // Try all combinations: 2-char left + 2-char line + 2-char right
  if (symbol.length < 6) return null;

  const left = symbol.slice(0, 2);
  const mid = symbol.slice(2, 4);
  const right = symbol.slice(4, 6);

  const srcCard = LEFT_CARDINALITY[left];
  const tgtCard = RIGHT_CARDINALITY[right];
  if (!srcCard || !tgtCard) return null;

  let identifying: boolean;
  if (mid === '--') identifying = true;
  else if (mid === '..') identifying = false;
  else return null;

  return { sourceCardinality: srcCard, targetCardinality: tgtCard, identifying };
}

// --- Parser ---

// ER relationship line: ENTITY1 ||--o{ ENTITY2 : "label"
const ER_LINE_RE =
  /^(\S+)\s+([|}{o.][|}{o.][-.][-.][|}{o.][|}{o.])\s+(\S+)\s*:\s*"?([^"]*)"?\s*$/;

/**
 * Parses a Mermaid ER diagram string into a Graph.
 *
 * @example
 * const graph = fromMermaidER(`
 * erDiagram
 *     CUSTOMER ||--o{ ORDER : places
 *     ORDER ||--|{ LINE_ITEM : contains
 * `);
 */
export function fromMermaidER(input: string): ERGraph {
  validateInput(input, 'Mermaid ER');
  const { lines } = prepareLines(input);

  const header = lines[0]?.trim();
  if (!header || !header.startsWith('erDiagram')) {
    throw new Error('Mermaid ER: expected "erDiagram" header');
  }

  const nodeMap = new Map<string, ERNode>();
  const edges: EREdge[] = [];
  let edgeCounter = 0;

  function ensureNode(id: string): ERNode {
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

  let currentEntity: string | null = null;
  let inBlock = false;

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    // Entity attribute block: ENTITY {
    const blockMatch = line.match(/^(\S+)\s*\{\s*$/);
    if (blockMatch) {
      currentEntity = blockMatch[1];
      ensureNode(currentEntity);
      inBlock = true;
      continue;
    }

    if (inBlock && currentEntity) {
      if (line === '}') {
        inBlock = false;
        currentEntity = null;
        continue;
      }

      // Attribute: type name [PK|FK|UK] ["comment"]
      const attrMatch = line.match(
        /^(\S+)\s+(\S+)(?:\s+(PK|FK|UK))?(?:\s+"([^"]*)")?$/,
      );
      if (attrMatch) {
        const node = nodeMap.get(currentEntity)!;
        if (!node.data.attributes) node.data.attributes = [];
        node.data.attributes.push({
          type: attrMatch[1],
          name: attrMatch[2],
          ...(attrMatch[3] && { key: attrMatch[3] as 'PK' | 'FK' | 'UK' }),
          ...(attrMatch[4] && { comment: attrMatch[4] }),
        });
      }
      continue;
    }

    // Relationship line
    const relMatch = line.match(ER_LINE_RE);
    if (relMatch) {
      const leftEntity = relMatch[1];
      const symbol = relMatch[2];
      const rightEntity = relMatch[3];
      const label = relMatch[4].trim();

      ensureNode(leftEntity);
      ensureNode(rightEntity);

      const rel = parseERRelationship(symbol);
      if (rel) {
        const edgeId = generateEdgeId(leftEntity, rightEntity, edgeCounter++);
        edges.push({
          type: 'edge',
          id: edgeId,
          sourceId: leftEntity,
          targetId: rightEntity,
          label: label ? unescapeMermaidLabel(label) : '',
          data: rel,
        });
      }
      continue;
    }

    // Bare entity declaration
    if (/^[A-Z_][\w]*$/i.test(line)) {
      ensureNode(line);
    }
  }

  return {
    id: '',
    type: 'directed',
    initialNodeId: null,
    nodes: Array.from(nodeMap.values()),
    edges,
    data: { diagramType: 'erDiagram' },
  };
}

// --- Serializer ---

/**
 * Converts an ER diagram Graph to a Mermaid ER diagram string.
 *
 * @example
 * const mermaid = toMermaidER(graph);
 * // "erDiagram\n    CUSTOMER ||--o{ ORDER : \"places\"\n    ..."
 */
export function toMermaidER(graph: ERGraph): string {
  const lines: string[] = ['erDiagram'];

  // Emit entities with attributes
  for (const node of graph.nodes) {
    if (node.data?.attributes && node.data.attributes.length > 0) {
      lines.push(`    ${node.id} {`);
      for (const attr of node.data.attributes) {
        const keyStr = attr.key ? ` ${attr.key}` : '';
        const commentStr = attr.comment ? ` "${escapeMermaidLabel(attr.comment)}"` : '';
        lines.push(`        ${attr.type} ${attr.name}${keyStr}${commentStr}`);
      }
      lines.push(`    }`);
    }
  }

  // Emit relationships
  for (const edge of graph.edges) {
    const d = edge.data;
    if (!d) continue;

    const leftMark = CARDINALITY_TO_LEFT[d.sourceCardinality] ?? '||';
    const rightMark = CARDINALITY_TO_RIGHT[d.targetCardinality] ?? '||';
    const lineStyle = d.identifying ? '--' : '..';
    const symbol = `${leftMark}${lineStyle}${rightMark}`;
    const label = edge.label ? `"${escapeMermaidLabel(edge.label)}"` : '""';
    lines.push(`    ${edge.sourceId} ${symbol} ${edge.targetId} : ${label}`);
  }

  return lines.join('\n');
}

/**
 * Bidirectional converter for Mermaid ER diagram format.
 *
 * @example
 * const graph = mermaidERConverter.from(`
 * erDiagram
 *     CUSTOMER ||--o{ ORDER : places
 * `);
 * const str = mermaidERConverter.to(graph);
 */
export const mermaidERConverter: GraphFormatConverter<string> =
  createFormatConverter(
    toMermaidER as (graph: Graph) => string,
    fromMermaidER,
  );
