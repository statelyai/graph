import type { Graph, GraphNode, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';

// --- GML serializer ---

/**
 * Converts a graph to GML (Graph Modelling Language) string.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { toGML } from '@statelyai/graph/formats/gml';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const gml = toGML(graph);
 * // graph [
 * //   directed 1
 * //   node [ id "a" ]
 * //   node [ id "b" ]
 * //   edge [ id "e0" source "a" target "b" ]
 * // ]
 * ```
 */
export function toGML(graph: Graph): string {
  const lines: string[] = [];
  lines.push('graph [');
  lines.push(`  directed ${graph.type === 'directed' ? 1 : 0}`);
  if (graph.id) lines.push(`  id ${gmlString(graph.id)}`);
  if (graph.initialNodeId) {
    lines.push(`  initialNodeId ${gmlString(graph.initialNodeId)}`);
  }
  if (graph.data !== undefined) {
    lines.push(`  data ${gmlString(JSON.stringify(graph.data))}`);
  }
  if (graph.direction) lines.push(`  direction ${gmlString(graph.direction)}`);
  if (graph.style !== undefined) {
    lines.push(`  style ${gmlString(JSON.stringify(graph.style))}`);
  }

  // Build children map for hierarchical nesting
  const childrenMap = new Map<string | null, GraphNode[]>();
  for (const node of graph.nodes) {
    const pid = node.parentId ?? null;
    if (!childrenMap.has(pid)) childrenMap.set(pid, []);
    childrenMap.get(pid)!.push(node);
  }

  // Recursive node writer
  function writeNode(node: GraphNode, indent: string) {
    lines.push(`${indent}node [`);
    lines.push(`${indent}  id ${gmlString(node.id)}`);
    if (node.label) lines.push(`${indent}  label ${gmlString(node.label)}`);
    if (node.initialNodeId)
      lines.push(`${indent}  initialNodeId ${gmlString(node.initialNodeId)}`);
    if (node.data !== undefined)
      lines.push(`${indent}  data ${gmlString(JSON.stringify(node.data))}`);
    if (node.ports !== undefined) {
      lines.push(`${indent}  ports ${gmlString(JSON.stringify(node.ports))}`);
    }
    if (node.shape) lines.push(`${indent}  shape ${gmlString(node.shape)}`);
    if (node.color) lines.push(`${indent}  color ${gmlString(node.color)}`);
    if (node.style !== undefined) {
      lines.push(`${indent}  style ${gmlString(JSON.stringify(node.style))}`);
    }
    if (
      node.x !== undefined ||
      node.y !== undefined ||
      node.width !== undefined ||
      node.height !== undefined
    ) {
      lines.push(`${indent}  graphics [`);
      if (node.x !== undefined) lines.push(`${indent}    x ${node.x}`);
      if (node.y !== undefined) lines.push(`${indent}    y ${node.y}`);
      if (node.width !== undefined) lines.push(`${indent}    w ${node.width}`);
      if (node.height !== undefined)
        lines.push(`${indent}    h ${node.height}`);
      lines.push(`${indent}  ]`);
    }
    // Nested children
    const children = childrenMap.get(node.id);
    if (children) {
      for (const child of children) {
        writeNode(child, indent + '  ');
      }
    }
    lines.push(`${indent}]`);
  }

  // Write root nodes
  const roots = childrenMap.get(null) ?? [];
  for (const node of roots) {
    writeNode(node, '  ');
  }

  for (const edge of graph.edges) {
    lines.push('  edge [');
    lines.push(`    id ${gmlString(edge.id)}`);
    lines.push(`    source ${gmlString(edge.sourceId)}`);
    lines.push(`    target ${gmlString(edge.targetId)}`);
    if (edge.label) lines.push(`    label ${gmlString(edge.label)}`);
    if (edge.data !== undefined)
      lines.push(`    data ${gmlString(JSON.stringify(edge.data))}`);
    if (edge.weight !== undefined) lines.push(`    weight ${edge.weight}`);
    if (edge.sourcePort !== undefined) {
      lines.push(`    sourcePort ${gmlString(edge.sourcePort)}`);
    }
    if (edge.targetPort !== undefined) {
      lines.push(`    targetPort ${gmlString(edge.targetPort)}`);
    }
    if (edge.color) lines.push(`    color ${gmlString(edge.color)}`);
    if (edge.style !== undefined) {
      lines.push(`    style ${gmlString(JSON.stringify(edge.style))}`);
    }
    if (
      edge.x !== undefined ||
      edge.y !== undefined ||
      edge.width !== undefined ||
      edge.height !== undefined
    ) {
      lines.push('    graphics [');
      if (edge.x !== undefined) lines.push(`      x ${edge.x}`);
      if (edge.y !== undefined) lines.push(`      y ${edge.y}`);
      if (edge.width !== undefined) lines.push(`      w ${edge.width}`);
      if (edge.height !== undefined) lines.push(`      h ${edge.height}`);
      lines.push('    ]');
    }
    lines.push('  ]');
  }

  lines.push(']');
  return lines.join('\n');
}

function gmlString(s: string): string {
  return `"${s.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

// --- GML parser ---

/**
 * Parses a GML (Graph Modelling Language) string into a graph.
 *
 * @example
 * ```ts
 * import { fromGML } from '@statelyai/graph/formats/gml';
 *
 * const graph = fromGML(`
 *   graph [
 *     directed 1
 *     node [ id "a" ]
 *     node [ id "b" ]
 *     edge [ source "a" target "b" ]
 *   ]
 * `);
 * ```
 */
export function fromGML(gml: string): Graph {
  if (typeof gml !== 'string') {
    throw new Error('GML: expected a string');
  }
  if (!gml.trim()) {
    throw new Error('GML: input is empty');
  }
  const tokens = tokenize(gml);
  if (tokens.length === 0) {
    throw new Error('GML: no tokens found');
  }
  const obj = parseBlock(tokens, 0);
  const graphBlock = obj.value['graph'];
  if (!graphBlock) throw new Error('GML: missing top-level "graph" block');

  const directed = graphBlock['directed'] === 1;
  const graphId = String(graphBlock['id'] ?? '');

  const nodes: Graph['nodes'] = [];
  const edges: Graph['edges'] = [];

  // Parse nodes (with recursive hierarchy)
  function parseNodes(block: any, parentId: string | null) {
    const nodeEntries = asArray(block['node']);
    for (const n of nodeEntries) {
      const id = String(n['id'] ?? '');
      const gfx = n['graphics'];
      nodes.push({
        type: 'node',
        id,
        parentId,
        initialNodeId: n['initialNodeId'] ?? null,
        label: n['label'] ?? '',
        data: n['data'] !== undefined ? tryParseJSON(n['data']) : undefined,
        ...(n['ports'] !== undefined && { ports: tryParseJSON(n['ports']) }),
        ...(n['shape'] && { shape: n['shape'] }),
        ...(n['color'] && { color: n['color'] }),
        ...(n['style'] !== undefined && { style: tryParseJSON(n['style']) }),
        ...(gfx?.x !== undefined && { x: gfx.x }),
        ...(gfx?.y !== undefined && { y: gfx.y }),
        ...(gfx?.w !== undefined && { width: gfx.w }),
        ...(gfx?.h !== undefined && { height: gfx.h }),
      });
      // Recurse into nested child nodes
      if (n['node'] !== undefined) {
        parseNodes(n, id);
      }
    }
  }
  parseNodes(graphBlock, null);

  const edgeEntries = asArray(graphBlock['edge']);
  for (const e of edgeEntries) {
    const gfx = e['graphics'];
    edges.push({
      type: 'edge',
      id: String(e['id'] ?? `e${edges.length}`),
      sourceId: String(e['source'] ?? ''),
      targetId: String(e['target'] ?? ''),
      label: e['label'] ?? '',
      data: e['data'] !== undefined ? tryParseJSON(e['data']) : undefined,
      ...(e['weight'] !== undefined && { weight: Number(e['weight']) }),
      ...(e['sourcePort'] !== undefined && {
        sourcePort: String(e['sourcePort']),
      }),
      ...(e['targetPort'] !== undefined && {
        targetPort: String(e['targetPort']),
      }),
      ...(e['color'] && { color: e['color'] }),
      ...(e['style'] !== undefined && { style: tryParseJSON(e['style']) }),
      ...(gfx?.x !== undefined && { x: gfx.x }),
      ...(gfx?.y !== undefined && { y: gfx.y }),
      ...(gfx?.w !== undefined && { width: gfx.w }),
      ...(gfx?.h !== undefined && { height: gfx.h }),
    });
  }

  return {
    id: graphId,
    type: directed ? 'directed' : 'undirected',
    initialNodeId: graphBlock['initialNodeId'] ?? null,
    nodes,
    edges,
    data:
      graphBlock['data'] !== undefined
        ? tryParseJSON(graphBlock['data'])
        : (undefined as any),
    ...(graphBlock['direction'] && {
      direction: String(graphBlock['direction']) as Graph['direction'],
    }),
    ...(graphBlock['style'] !== undefined && {
      style: tryParseJSON(graphBlock['style']),
    }),
  };
}

// --- Tokenizer ---

interface Token {
  type: 'word' | 'string' | 'number' | 'open' | 'close';
  value: any;
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    // Whitespace
    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    // Comments (# to end of line)
    if (ch === '#') {
      while (i < input.length && input[i] !== '\n') i++;
      continue;
    }
    // Brackets
    if (ch === '[') {
      tokens.push({ type: 'open', value: '[' });
      i++;
      continue;
    }
    if (ch === ']') {
      tokens.push({ type: 'close', value: ']' });
      i++;
      continue;
    }
    // Quoted string
    if (ch === '"') {
      i++;
      let s = '';
      while (i < input.length && input[i] !== '"') {
        if (input[i] === '\\' && i + 1 < input.length) {
          i++;
          s += input[i];
        } else {
          s += input[i];
        }
        i++;
      }
      i++; // skip closing quote
      tokens.push({ type: 'string', value: s });
      continue;
    }
    // Number or word
    if (/[-+0-9.]/.test(ch)) {
      let num = '';
      while (i < input.length && /[-+0-9.eE]/.test(input[i])) {
        num += input[i];
        i++;
      }
      const parsed = Number(num);
      if (!isNaN(parsed)) {
        tokens.push({ type: 'number', value: parsed });
      } else {
        tokens.push({ type: 'word', value: num });
      }
      continue;
    }
    // Word/keyword
    if (/[a-zA-Z_]/.test(ch)) {
      let word = '';
      while (i < input.length && /[a-zA-Z0-9_]/.test(input[i])) {
        word += input[i];
        i++;
      }
      tokens.push({ type: 'word', value: word });
      continue;
    }
    i++; // skip unknown chars
  }
  return tokens;
}

// --- Parser ---

function parseBlock(
  tokens: Token[],
  pos: number,
): { value: Record<string, any>; pos: number } {
  const result: Record<string, any> = {};
  while (pos < tokens.length) {
    const tok = tokens[pos];
    if (tok.type === 'close') {
      pos++;
      break;
    }
    if (tok.type === 'word') {
      const key = tok.value;
      pos++;
      if (pos >= tokens.length) break;
      const next = tokens[pos];
      if (next.type === 'open') {
        pos++; // skip '['
        const nested = parseBlock(tokens, pos);
        pos = nested.pos;
        // Support multiple entries (e.g., multiple "node" blocks)
        if (result[key] !== undefined) {
          if (!Array.isArray(result[key])) result[key] = [result[key]];
          result[key].push(nested.value);
        } else {
          result[key] = nested.value;
        }
      } else {
        // Scalar value
        if (result[key] !== undefined) {
          if (!Array.isArray(result[key])) result[key] = [result[key]];
          result[key].push(next.value);
        } else {
          result[key] = next.value;
        }
        pos++;
      }
    } else {
      pos++;
    }
  }
  return { value: result, pos };
}

function asArray<T>(val: T | T[] | undefined): T[] {
  if (val === undefined) return [];
  return Array.isArray(val) ? val : [val];
}

function tryParseJSON(str: any): any {
  if (typeof str !== 'string') return str;
  try {
    return JSON.parse(str);
  } catch {
    return str;
  }
}

/**
 * Bidirectional converter for GML (Graph Modelling Language) format.
 *
 * @example
 * ```ts
 * import { createGraph } from '@statelyai/graph';
 * import { gmlConverter } from '@statelyai/graph/formats/gml';
 *
 * const graph = createGraph({
 *   nodes: [{ id: 'a' }, { id: 'b' }],
 *   edges: [{ id: 'e0', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const gml = gmlConverter.to(graph);
 * const roundTripped = gmlConverter.from(gml);
 * ```
 */
export const gmlConverter: GraphFormatConverter<string> =
  createFormatConverter(toGML, fromGML);
