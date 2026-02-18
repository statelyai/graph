import parse from 'dotparser';
import type { Graph, GraphNode, GraphEdge, GraphFormatConverter } from '../../types';
import { createFormatConverter } from '../converter';

// --- toDOT ---

/** Escape a DOT identifier */
function escapeId(id: string): string {
  if (/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) return id;
  return `"${id.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
}

/** Escape a DOT label string */
function escapeLabel(label: string): string {
  return label.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

const DIRECTION_TO_RANKDIR: Record<string, string> = {
  down: 'TB',
  up: 'BT',
  right: 'LR',
  left: 'RL',
};

const SHAPE_TO_DOT: Record<string, string> = {
  rectangle: 'box',
  ellipse: 'ellipse',
  circle: 'circle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  parallelogram: 'parallelogram',
};

export function toDOT(graph: Graph): string {
  const isDirected = graph.type === 'directed';
  const keyword = isDirected ? 'digraph' : 'graph';
  const edgeOp = isDirected ? '->' : '--';

  const lines: string[] = [];
  lines.push(`${keyword} ${escapeId(graph.id)} {`);

  if (graph.direction) {
    const rankdir = DIRECTION_TO_RANKDIR[graph.direction] ?? 'TB';
    lines.push(`  rankdir=${rankdir};`);
  }

  for (const node of graph.nodes) {
    const attrs: string[] = [];
    if (node.label) attrs.push(`label="${escapeLabel(node.label)}"`);
    if (node.shape) {
      const dotShape = SHAPE_TO_DOT[node.shape] ?? node.shape;
      attrs.push(`shape=${dotShape}`);
    }
    if (node.color) attrs.push(`fillcolor="${escapeLabel(node.color)}" style=filled`);
    if (attrs.length > 0) {
      lines.push(`  ${escapeId(node.id)} [${attrs.join(', ')}];`);
    } else {
      lines.push(`  ${escapeId(node.id)};`);
    }
  }

  for (const edge of graph.edges) {
    const attrs: string[] = [];
    if (edge.label) attrs.push(`label="${escapeLabel(edge.label)}"`);
    if (edge.color) attrs.push(`color="${escapeLabel(edge.color)}"`);
    const attrStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
    lines.push(`  ${escapeId(edge.sourceId)} ${edgeOp} ${escapeId(edge.targetId)}${attrStr};`);
  }

  lines.push('}');
  return lines.join('\n');
}

// --- fromDOT ---

const RANKDIR_TO_DIRECTION: Record<string, Graph['direction']> = {
  TB: 'down',
  BT: 'up',
  LR: 'right',
  RL: 'left',
};

const DOT_TO_SHAPE: Record<string, string> = {
  box: 'rectangle',
  rect: 'rectangle',
  rectangle: 'rectangle',
  ellipse: 'ellipse',
  oval: 'ellipse',
  circle: 'circle',
  diamond: 'diamond',
  hexagon: 'hexagon',
  cylinder: 'cylinder',
  parallelogram: 'parallelogram',
};

interface AttrMap {
  [key: string]: string;
}

function attrsToMap(attrList: { id: string; eq: string | number }[]): AttrMap {
  const map: AttrMap = {};
  for (const a of attrList) {
    map[a.id] = String(a.eq);
  }
  return map;
}

function nodeFromAttrs(
  id: string,
  attrs: AttrMap,
  defaults: AttrMap,
  parentId: string | null,
): GraphNode {
  const merged = { ...defaults, ...attrs };
  const label = merged['label'] ?? '';
  const rawShape = merged['shape'];
  const shape = rawShape ? (DOT_TO_SHAPE[rawShape] ?? rawShape) : undefined;
  const color = merged['fillcolor'] ?? merged['color'] ?? undefined;

  return {
    type: 'node',
    id,
    parentId,
    initialNodeId: null,
    label,
    data: undefined as any,
    ...(shape && { shape }),
    ...(color && { color }),
  };
}

export function fromDOT(dot: string): Graph {
  if (typeof dot !== 'string') {
    throw new Error('DOT: expected a string');
  }
  if (!dot.trim()) {
    throw new Error('DOT: input is empty');
  }

  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(dot);
  } catch (e: any) {
    throw new Error(`DOT: parse error — ${e.message}`);
  }

  if (!ast || ast.length === 0) {
    throw new Error('DOT: no graph found');
  }

  const root = ast[0];
  const isDirected = root.type === 'digraph';

  const nodeMap = new Map<string, GraphNode>();
  const edges: GraphEdge[] = [];
  let edgeIdx = 0;
  let direction: Graph['direction'] | undefined;

  function ensureNode(
    id: string,
    parentId: string | null,
    defaults: AttrMap,
  ): void {
    if (!nodeMap.has(id)) {
      nodeMap.set(id, nodeFromAttrs(id, {}, defaults, parentId));
    }
  }

  function getNodeIdsFromSubgraph(children: any[]): string[] {
    const ids: string[] = [];
    for (const child of children) {
      if (child.type === 'node_stmt') {
        ids.push(child.node_id.id);
      }
    }
    return ids;
  }

  function walkChildren(
    children: typeof root.children,
    parentId: string | null,
    nodeDefaults: AttrMap,
    edgeDefaults: AttrMap,
  ): void {
    let nd = { ...nodeDefaults };
    let ed = { ...edgeDefaults };

    for (const stmt of children) {
      switch (stmt.type) {
        case 'attr_stmt': {
          if (stmt.target === 'node') {
            nd = { ...nd, ...attrsToMap(stmt.attr_list) };
          } else if (stmt.target === 'edge') {
            ed = { ...ed, ...attrsToMap(stmt.attr_list) };
          } else if (stmt.target === 'graph') {
            const graphAttrs = attrsToMap(stmt.attr_list);
            if (graphAttrs['rankdir']) {
              direction =
                RANKDIR_TO_DIRECTION[graphAttrs['rankdir'].toUpperCase()] ??
                undefined;
            }
            // TODO: Other graph attributes (bgcolor, fontname, etc.) are ignored
          }
          break;
        }

        case 'node_stmt': {
          const id = stmt.node_id.id;
          const attrs = attrsToMap(stmt.attr_list);
          const node = nodeFromAttrs(id, attrs, nd, parentId);
          nodeMap.set(id, node);
          break;
        }

        case 'edge_stmt': {
          const edgeAttrs = attrsToMap(stmt.attr_list);
          const mergedEdgeAttrs = { ...ed, ...edgeAttrs };

          // Walk edge_list: each consecutive pair is an edge
          // Items can be node_id or subgraph
          const ids: string[] = [];
          for (const item of stmt.edge_list) {
            if (item.type === 'node_id') {
              ensureNode(item.id, parentId, nd);
              ids.push(item.id);
            } else if (item.type === 'subgraph') {
              // TODO: Inline subgraphs in edge statements connect all
              // contained nodes, not just the first. Currently we only
              // use the first node as the edge endpoint.
              walkChildren(item.children, parentId, nd, ed);
              const subNodeIds = getNodeIdsFromSubgraph(item.children);
              if (subNodeIds.length > 0) {
                ids.push(subNodeIds[0]);
              }
            }
          }

          for (let i = 0; i < ids.length - 1; i++) {
            const edge: GraphEdge = {
              type: 'edge',
              id: `e${edgeIdx++}`,
              sourceId: ids[i],
              targetId: ids[i + 1],
              label: mergedEdgeAttrs['label'] ?? '',
              data: undefined as any,
              ...(mergedEdgeAttrs['color'] && {
                color: mergedEdgeAttrs['color'],
              }),
            };
            edges.push(edge);
          }
          break;
        }

        case 'subgraph': {
          const subId = stmt.id ?? `subgraph_${nodeMap.size}`;
          // Extract subgraph-level label from graph attr_stmt
          let subLabel = '';
          for (const child of stmt.children) {
            if (child.type === 'attr_stmt' && child.target === 'graph') {
              const ga = attrsToMap(child.attr_list);
              if (ga['label']) subLabel = ga['label'];
            }
          }
          const subNode: GraphNode = {
            type: 'node',
            id: subId,
            parentId,
            initialNodeId: null,
            label: subLabel,
            data: undefined as any,
          };
          nodeMap.set(subId, subNode);

          walkChildren(stmt.children, subId, nd, ed);
          break;
        }
      }
    }
  }

  walkChildren(root.children, null, {}, {});

  // TODO: HTML labels (<...>) are stored as-is in the label string
  // TODO: Port syntax (:port:compass) is ignored
  // TODO: rank=same and other layout hints beyond rankdir are ignored

  return {
    id: root.id ?? '',
    type: isDirected ? 'directed' : 'undirected',
    initialNodeId: null,
    nodes: [...nodeMap.values()],
    edges,
    data: undefined as any,
    ...(direction && { direction }),
  };
}

/** Bidirectional converter for DOT (Graphviz) format. */
export const dotConverter: GraphFormatConverter<string> =
  createFormatConverter(toDOT, fromDOT);
