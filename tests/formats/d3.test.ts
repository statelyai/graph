import { describe, it, expect } from 'vitest';
import { toD3Graph, fromD3Graph } from '../../src/formats/d3';
import type { Graph } from '../../src/types';
import { expectFixtureRoundTrip } from './fixture-roundtrip';

const sampleGraph: Graph = {
  id: 'test',
  type: 'directed',
  initialNodeId: null,
  nodes: [
    { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'A', data: 42 },
    { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: '', data: undefined },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: 'link', data: undefined },
  ],
  data: undefined,
};

describe('D3.js JSON', () => {
  it('toD3Graph() produces {nodes, links}', () => {
    const d3 = toD3Graph(sampleGraph);
    expect(d3.nodes).toHaveLength(2);
    expect(d3.links).toHaveLength(1);
    expect(d3.links[0].source).toBe('a');
    expect(d3.links[0].target).toBe('b');
    expect(d3.nodes[0].label).toBe('A');
  });

  it('round-trips basic structure', () => {
    const d3 = toD3Graph(sampleGraph);
    const parsed = fromD3Graph(d3);

    expect(parsed.id).toBe('test');
    expect(parsed.type).toBe('directed');
    expect(parsed.nodes).toHaveLength(2);
    expect(parsed.edges).toHaveLength(1);
    expect(parsed.edges[0].sourceId).toBe('a');
    expect(parsed.edges[0].targetId).toBe('b');
    expect(parsed.nodes[0].label).toBe('A');
    expect(parsed.nodes[0].data).toBe(42);
  });

  it('handles D3 object references in source/target', () => {
    // After D3 simulation runs, source/target become object references
    const d3 = {
      nodes: [{ id: 'x' }, { id: 'y' }],
      links: [{ source: { id: 'x' }, target: { id: 'y' } }],
    };
    const parsed = fromD3Graph(d3 as any);
    expect(parsed.edges[0].sourceId).toBe('x');
    expect(parsed.edges[0].targetId).toBe('y');
  });

  it('throws on null/undefined input', () => {
    expect(() => fromD3Graph(null as any)).toThrow('D3: expected an object');
    expect(() => fromD3Graph(undefined as any)).toThrow('D3: expected an object');
  });

  it('throws on missing nodes/links arrays', () => {
    expect(() => fromD3Graph({} as any)).toThrow('D3: "nodes" must be an array');
    expect(() => fromD3Graph({ nodes: [] } as any)).toThrow('D3: "links" must be an array');
  });

  it('handles empty graph', () => {
    const graph = fromD3Graph({ nodes: [], links: [] });
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });

  it('round-trips ports and edge port references', () => {
    expectFixtureRoundTrip((graph) => fromD3Graph(toD3Graph(graph)), {
      graphKeys: ['initialNodeId', 'data', 'direction', 'style'],
      nodeKeys: [
        'parentId',
        'initialNodeId',
        'label',
        'data',
        'x',
        'y',
        'width',
        'height',
        'shape',
        'color',
        'style',
        'ports',
      ],
      edgeKeys: [
        'label',
        'weight',
        'data',
        'x',
        'y',
        'width',
        'height',
        'color',
        'style',
        'sourcePort',
        'targetPort',
      ],
    });
  });
});
