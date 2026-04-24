import { describe, it, expect } from 'vitest';
import { toJGF, fromJGF } from '../../src/formats/jgf';
import type { Graph } from '../../src/types';
import { getFullyFeaturedGraphFixture } from '../fixtures';

const sampleGraph: Graph = {
  id: 'test',
  type: 'directed',
  initialNodeId: 'a',
  nodes: [
    { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'Node A', data: { color: 'red' } },
    { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'Node B', data: undefined },
    { type: 'node', id: 'c', parentId: 'a', initialNodeId: null, label: 'Child', data: undefined },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: 'connects', data: { weight: 5 } },
    { type: 'edge', id: 'e2', sourceId: 'b', targetId: 'c', label: '', data: undefined },
  ],
  data: { version: 1 },
};

describe('JGF', () => {
  it('toJGF() produces valid JGF structure', () => {
    const jgf = toJGF(sampleGraph);
    expect(jgf.graph.directed).toBe(true);
    expect(jgf.graph.id).toBe('test');
    expect(jgf.graph.nodes).toHaveLength(3);
    expect(jgf.graph.edges).toHaveLength(2);
    expect(jgf.graph.edges[0].source).toBe('a');
    expect(jgf.graph.edges[0].target).toBe('b');
  });

  it('round-trips through toJGF/fromJGF', () => {
    const jgf = toJGF(sampleGraph);
    const parsed = fromJGF(jgf);

    expect(parsed.id).toBe('test');
    expect(parsed.type).toBe('directed');
    expect(parsed.initialNodeId).toBe('a');
    expect(parsed.data).toEqual({ version: 1 });
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(2);

    const nodeA = parsed.nodes.find((n) => n.id === 'a');
    expect(nodeA?.label).toBe('Node A');
    expect(nodeA?.data).toEqual({ color: 'red' });

    const nodeC = parsed.nodes.find((n) => n.id === 'c');
    expect(nodeC?.parentId).toBe('a');

    const edge1 = parsed.edges.find((e) => e.id === 'e1');
    expect(edge1?.label).toBe('connects');
    expect(edge1?.data).toEqual({ weight: 5 });
  });

  it('handles undirected graphs', () => {
    const jgf = toJGF({ ...sampleGraph, type: 'undirected' });
    expect(jgf.graph.directed).toBe(false);
    const parsed = fromJGF(jgf);
    expect(parsed.type).toBe('undirected');
  });

  it('throws on null/undefined input', () => {
    expect(() => fromJGF(null as any)).toThrow('JGF: expected an object');
    expect(() => fromJGF(undefined as any)).toThrow('JGF: expected an object');
  });

  it('throws on missing graph property', () => {
    expect(() => fromJGF({} as any)).toThrow('JGF: missing "graph" property');
    expect(() => fromJGF({ graph: 'not an object' } as any)).toThrow('JGF: missing "graph" property');
  });

  it('throws on missing nodes/edges arrays', () => {
    expect(() => fromJGF({ graph: { edges: [] } } as any)).toThrow('JGF: "graph.nodes" must be an array');
    expect(() => fromJGF({ graph: { nodes: [] } } as any)).toThrow('JGF: "graph.edges" must be an array');
  });

  it('handles empty graph', () => {
    const graph = fromJGF({ graph: { nodes: [], edges: [] } });
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.type).toBe('directed');
  });

  it('round-trips ports and edge port references', () => {
    const graph = getFullyFeaturedGraphFixture();
    const parsed = fromJGF(toJGF(graph));

    expect(parsed.nodes.find((n) => n.id === 'child-a')?.ports).toEqual(
      graph.nodes.find((n) => n.id === 'child-a')?.ports,
    );
    expect(parsed.edges.find((e) => e.id === 'e1')?.sourcePort).toBe('out');
    expect(parsed.edges.find((e) => e.id === 'e1')?.targetPort).toBe('in');
  });
});
