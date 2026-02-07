import { describe, it, expect } from 'vitest';
import { toGraphML, fromGraphML } from '../../src/formats/graphml';
import type { Graph } from '../../src/types';

const sampleGraph: Graph = {
  id: 'test',
  type: 'directed',
  initialNodeId: null,
  nodes: [
    { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'Node A', data: { color: 'red' } },
    { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'Node B', data: 42 },
    { type: 'node', id: 'c', parentId: 'a', initialNodeId: null, label: 'Child', data: undefined },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: 'connects', data: { weight: 1 } },
    { type: 'edge', id: 'e2', sourceId: 'b', targetId: 'c', label: '', data: undefined },
  ],
  data: { version: 1 },
};

describe('GraphML', () => {
  it('toGraphML() produces valid XML', () => {
    const xml = toGraphML(sampleGraph);
    expect(xml).toContain('<graphml');
    expect(xml).toContain('edgedefault="directed"');
    expect(xml).toContain('id="a"');
    expect(xml).toContain('source="a"');
    expect(xml).toContain('target="b"');
  });

  it('round-trips through toGraphML/fromGraphML', () => {
    const xml = toGraphML(sampleGraph);
    const parsed = fromGraphML(xml);

    expect(parsed.id).toBe('test');
    expect(parsed.type).toBe('directed');
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(2);

    // Check node data
    const nodeA = parsed.nodes.find((n) => n.id === 'a');
    expect(nodeA?.label).toBe('Node A');
    expect(nodeA?.data).toEqual({ color: 'red' });

    const nodeC = parsed.nodes.find((n) => n.id === 'c');
    expect(nodeC?.parentId).toBe('a');

    // Check edge data
    const edge1 = parsed.edges.find((e) => e.id === 'e1');
    expect(edge1?.label).toBe('connects');
    expect(edge1?.data).toEqual({ weight: 1 });

    // Check graph data
    expect(parsed.data).toEqual({ version: 1 });
  });

  it('handles undirected graphs', () => {
    const g: Graph = {
      ...sampleGraph,
      type: 'undirected',
    };
    const xml = toGraphML(g);
    expect(xml).toContain('edgedefault="undirected"');
    const parsed = fromGraphML(xml);
    expect(parsed.type).toBe('undirected');
  });
});
