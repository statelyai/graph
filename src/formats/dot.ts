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

export function toDOT(graph: Graph): string {
  const isDirected = graph.type === 'directed';
  const keyword = isDirected ? 'digraph' : 'graph';
  const edgeOp = isDirected ? '->' : '--';

  const lines: string[] = [];
  lines.push(`${keyword} ${escapeId(graph.id)} {`);

  for (const node of graph.nodes) {
    const attrs: string[] = [];
    if (node.label) attrs.push(`label="${escapeLabel(node.label)}"`);
    if (attrs.length > 0) {
      lines.push(`  ${escapeId(node.id)} [${attrs.join(', ')}];`);
    } else {
      lines.push(`  ${escapeId(node.id)};`);
    }
  }

  for (const edge of graph.edges) {
    const attrs: string[] = [];
    if (edge.label) attrs.push(`label="${escapeLabel(edge.label)}"`);
    const attrStr = attrs.length > 0 ? ` [${attrs.join(', ')}]` : '';
    lines.push(`  ${escapeId(edge.sourceId)} ${edgeOp} ${escapeId(edge.targetId)}${attrStr};`);
  }

  lines.push('}');
  return lines.join('\n');
}
