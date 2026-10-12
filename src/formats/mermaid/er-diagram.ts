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

export interface ERNodeData {
  attributes?: Array<{
    type: string;
    name: string;
    key?: 'PK' | 'FK' | 'UK';
    keys?: Array<'PK' | 'FK' | 'UK'>;
    comment?: string;
  }>;
}

export interface EREdgeData {
  sourceCardinality: 'one' | 'zero-or-one' | 'zero-or-more' | 'one-or-more';
  targetCardinality: 'one' | 'zero-or-one' | 'zero-or-more' | 'one-or-more';
  identifying: boolean;
}

export interface ERGraphData extends MermaidSourceData {
  diagramType: 'erDiagram';
}

export type MermaidERGraph = Graph<ERNodeData, EREdgeData, ERGraphData>;
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
  '1': 'one',
  '|o': 'zero-or-one',
  '}|': 'one-or-more',
  '}o': 'zero-or-more',
};

const RIGHT_CARDINALITY: Record<string, EREdgeData['targetCardinality']> = {
  '||': 'one',
  '1': 'one',
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

function getParsedERRelationship(symbol: string): {
  sourceCardinality: EREdgeData['sourceCardinality'];
  targetCardinality: EREdgeData['targetCardinality'];
  identifying: boolean;
} | null {
  for (const left of Object.keys(LEFT_CARDINALITY).sort((a, b) => b.length - a.length)) {
    for (const mid of ['--', '..']) {
      for (const right of Object.keys(RIGHT_CARDINALITY).sort((a, b) => b.length - a.length)) {
        if (symbol !== `${left}${mid}${right}`) continue;
        return {
          sourceCardinality: LEFT_CARDINALITY[left],
          targetCardinality: RIGHT_CARDINALITY[right],
          identifying: mid === '--',
        };
      }
    }
  }
  return null;
}

// --- Parser ---

// ER relationship line: ENTITY1 ||--o{ ENTITY2 : "label"
const ER_LINE_RE =
  /^(\S+)\s+([|}{o1.]{1,2}[-.][-.][|}{o1.]{1,2})\s+(\S+)\s*:\s*"?([^"]*)"?\s*$/;

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
export function fromMermaidER(input: string): MermaidERGraph {
  validateInput(input, 'Mermaid ER');
  const { lines, source } = prepareLines(input);

  const header = lines[0]?.trim();
  if (!header || !header.startsWith('erDiagram')) {
    throw new Error('Mermaid ER: expected "erDiagram" header');
  }

  const nodeMap = new Map<string, ERNode>();
  const edges: EREdge[] = [];
  let edgeCounter = 0;
  let direction: MermaidERGraph['direction'];

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
    const directionMatch = line.match(/^direction\s+(TB|TD|BT|LR|RL)$/);
    if (directionMatch) { direction = MERMAID_TO_DIRECTION[directionMatch[1]]; continue; }

    // Entity attribute block: ENTITY {
    const blockMatch = line.match(/^(\S+?)(?:\["?([^\]"]*)"?\])?\s*\{\s*$/);
    if (blockMatch) {
      currentEntity = blockMatch[1];
      ensureNode(currentEntity);
      if (blockMatch[2] !== undefined) nodeMap.get(currentEntity)!.label = unescapeMermaidLabel(blockMatch[2]);
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
        /^(\S+)\s+(\S+)(?:\s+((?:PK|FK|UK)(?:\s*,\s*(?:PK|FK|UK))*))?(?:\s+"([^"]*)")?$/,
      );
      if (attrMatch) {
        const node = nodeMap.get(currentEntity)!;
        if (!node.data?.attributes) {
          if (!node.data) node.data = {};
          node.data.attributes = [];
        }
        node.data.attributes.push({
          type: attrMatch[1],
          name: attrMatch[2],
          ...(attrMatch[3] && { key: attrMatch[3].split(',')[0].trim() as 'PK' | 'FK' | 'UK' }),
          ...(attrMatch[3]?.includes(',') && { keys: attrMatch[3].split(',').map((key) => key.trim() as 'PK' | 'FK' | 'UK') }),
          ...(attrMatch[4] && { comment: unescapeMermaidLabel(attrMatch[4]) }),
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

      const rel = getParsedERRelationship(symbol);
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
    const aliasMatch = line.match(/^([^\s\[]+)\["?([^\]"]*)"?\]$/);
    if (aliasMatch) { ensureNode(aliasMatch[1]).label = unescapeMermaidLabel(aliasMatch[2]); continue; }
    if (/^[A-Z_][\w]*$/i.test(line)) {
      ensureNode(line);
    }
  }

  return {
    id: '',
    mode: 'directed',
    initialNodeId: null,
    nodes: Array.from(nodeMap.values()),
    edges,
    data: { diagramType: 'erDiagram', ...(source && { source }) },
    ...(direction && { direction }),
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
export function toMermaidER(graph: MermaidERGraph): string {
  const lines: string[] = [...getMermaidPreamble(graph.data ?? {}), 'erDiagram'];
  if (graph.direction) lines.push(`    direction ${DIRECTION_TO_MERMAID[graph.direction]}`);

  // Emit entities with attributes
  for (const node of graph.nodes) {
    const declaration = node.label && node.label !== node.id ? `${node.id}["${escapeMermaidLabel(node.label)}"]` : node.id;
    if (node.data?.attributes && node.data.attributes.length > 0) {
      lines.push(`    ${declaration} {`);
      for (const attr of node.data.attributes) {
        const keyStr = attr.keys?.length ? ` ${attr.keys.join(', ')}` : attr.key ? ` ${attr.key}` : '';
        const commentStr = attr.comment ? ` "${escapeMermaidLabel(attr.comment)}"` : '';
        lines.push(`        ${attr.type} ${attr.name}${keyStr}${commentStr}`);
      }
      lines.push(`    }`);
    } else {
      lines.push(`    ${declaration}`);
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
export const mermaidERConverter: GraphFormatConverter<
  string, ERNodeData, EREdgeData, ERGraphData
> = createFormatConverter(toMermaidER, fromMermaidER);
