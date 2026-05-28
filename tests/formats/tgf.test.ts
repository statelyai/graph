import { describe, it, expect } from 'vitest';
import { toTGF, fromTGF } from '../../src/formats/tgf';
import type { Graph } from '../../src/types';

describe('TGF', () => {
  it('toTGF() produces valid TGF', () => {
    const g: Graph = {
      id: '',
      mode: 'directed',
      initialNodeId: null,
      nodes: [
        { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'Node A', data: undefined },
        { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: '', data: undefined },
      ],
      edges: [
        { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: 'goes to', data: undefined },
      ],
      data: undefined,
    };
    const tgf = toTGF(g);
    expect(tgf).toBe('a Node A\nb\n#\na b goes to');
  });

  it('round-trips basic structure', () => {
    const tgf = 'x Hello\ny World\n#\nx y connects';
    const graph = fromTGF(tgf);

    expect(graph.nodes).toHaveLength(2);
    expect(graph.nodes[0].id).toBe('x');
    expect(graph.nodes[0].label).toBe('Hello');
    expect(graph.edges).toHaveLength(1);
    expect(graph.edges[0].sourceId).toBe('x');
    expect(graph.edges[0].targetId).toBe('y');
    expect(graph.edges[0].label).toBe('connects');
  });

  it('handles nodes without labels', () => {
    const tgf = 'a\nb\n#\na b';
    const graph = fromTGF(tgf);
    expect(graph.nodes[0].label).toBe('');
    expect(graph.edges[0].label).toBe('');
  });

  it('throws on non-string input', () => {
    expect(() => fromTGF(null as any)).toThrow('TGF: expected a string');
    expect(() => fromTGF(42 as any)).toThrow('TGF: expected a string');
  });

  it('handles empty string', () => {
    const graph = fromTGF('');
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it('handles missing # separator (nodes only)', () => {
    const graph = fromTGF('a Node A\nb Node B');
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(0);
  });

  it('handles extra whitespace and blank lines', () => {
    const tgf = '  a Hello  \n\n  b World  \n#\n  a b edge  \n';
    const graph = fromTGF(tgf);
    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);
  });
});
