import { describe, it, expect } from 'vitest';
import { toCytoscapeJSON, fromCytoscapeJSON } from '../../src/formats/cytoscape';
import type { Graph } from '../../src/types';

const sampleGraph: Graph = {
  id: 'test',
  type: 'directed',
  initialNodeId: null,
  nodes: [
    { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'A', data: { weight: 1 }, x: 10, y: 20 },
    { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'B', data: undefined },
    { type: 'node', id: 'c', parentId: 'a', initialNodeId: null, label: 'Child', data: undefined },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: 'link', data: { cost: 3 } },
  ],
  data: { meta: true },
};

describe('Cytoscape.js JSON', () => {
  it('toCytoscapeJSON() produces standard structure', () => {
    const cyto = toCytoscapeJSON(sampleGraph);
    expect(cyto.elements.nodes).toHaveLength(3);
    expect(cyto.elements.edges).toHaveLength(1);

    const nodeC = cyto.elements.nodes.find((n) => n.data.id === 'c');
    expect(nodeC?.data.parent).toBe('a');

    const nodeA = cyto.elements.nodes.find((n) => n.data.id === 'a');
    expect(nodeA?.position).toEqual({ x: 10, y: 20 });
  });

  it('round-trips compound graph', () => {
    const cyto = toCytoscapeJSON(sampleGraph);
    const parsed = fromCytoscapeJSON(cyto);

    expect(parsed.id).toBe('test');
    expect(parsed.type).toBe('directed');
    expect(parsed.nodes).toHaveLength(3);

    const nodeC = parsed.nodes.find((n) => n.id === 'c');
    expect(nodeC?.parentId).toBe('a');

    const nodeA = parsed.nodes.find((n) => n.id === 'a');
    expect(nodeA?.label).toBe('A');
    expect(nodeA?.data).toEqual({ weight: 1 });
    expect(nodeA?.x).toBe(10);
    expect(nodeA?.y).toBe(20);

    expect(parsed.edges[0].label).toBe('link');
    expect(parsed.edges[0].data).toEqual({ cost: 3 });
    expect(parsed.data).toEqual({ meta: true });
  });
});
