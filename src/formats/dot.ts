import type { Graph } from '../types';

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
