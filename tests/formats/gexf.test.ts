import { describe, it, expect } from 'vitest';
import { toGEXF, fromGEXF } from '../../src/formats/gexf';
import type { Graph } from '../../src/types';
import { expectFixtureRoundTrip } from './fixture-roundtrip';

const sampleGraph: Graph = {
  id: 'test',
  type: 'directed',
  initialNodeId: null,
  nodes: [
    { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'Node A', data: { color: 'red' } },
    { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'Node B', data: undefined },
    { type: 'node', id: 'c', parentId: 'a', initialNodeId: null, label: 'Child', data: undefined },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: 'connects', data: { weight: 1 } },
    { type: 'edge', id: 'e2', sourceId: 'b', targetId: 'c', label: '', data: undefined },
  ],
  data: undefined,
};

describe('GEXF', () => {
  it('toGEXF() produces valid GEXF XML', () => {
    const xml = toGEXF(sampleGraph);
    expect(xml).toContain('<gexf');
    expect(xml).toContain('defaultedgetype="directed"');
    expect(xml).toContain('id="a"');
    expect(xml).toContain('source="a"');
    expect(xml).toContain('target="b"');
    expect(xml).toContain('pid="a"');
  });

  it('round-trips graph structure', () => {
    const xml = toGEXF(sampleGraph);
    const parsed = fromGEXF(xml);

    expect(parsed.type).toBe('directed');
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(2);

    const nodeA = parsed.nodes.find((n) => n.id === 'a');
    expect(nodeA?.label).toBe('Node A');
    expect(nodeA?.data).toEqual({ color: 'red' });

    const nodeC = parsed.nodes.find((n) => n.id === 'c');
    expect(nodeC?.parentId).toBe('a');

    const edge1 = parsed.edges.find((e) => e.id === 'e1');
    expect(edge1?.label).toBe('connects');
    expect(edge1?.data).toEqual({ weight: 1 });
  });

  it('handles undirected graphs', () => {
    const xml = toGEXF({ ...sampleGraph, type: 'undirected' });
    expect(xml).toContain('defaultedgetype="undirected"');
    const parsed = fromGEXF(xml);
    expect(parsed.type).toBe('undirected');
  });

  it('preserves visual properties', () => {
    const g: Graph = {
      ...sampleGraph,
      nodes: [
        {
          type: 'node', id: 'a', parentId: null, initialNodeId: null,
          label: 'A', data: undefined,
          x: 100, y: 200, color: '#ff0000',
        },
      ],
      edges: [],
    };
    const xml = toGEXF(g);
    const parsed = fromGEXF(xml);
    expect(parsed.nodes[0].x).toBe(100);
    expect(parsed.nodes[0].y).toBe(200);
    expect(parsed.nodes[0].color).toBe('#ff0000');
  });

  it('throws on non-string input', () => {
    expect(() => fromGEXF(null as any)).toThrow('GEXF: expected a string');
  });

  it('throws on invalid XML', () => {
    expect(() => fromGEXF('not xml at all <><><')).toThrow('GEXF:');
  });

  it('throws on XML without <gexf> root', () => {
    expect(() => fromGEXF('<root><child/></root>')).toThrow('GEXF: missing <gexf> root element');
  });

  it('throws on <gexf> without <graph>', () => {
    expect(() => fromGEXF('<gexf><meta/></gexf>')).toThrow('GEXF: missing <graph> element');
  });

  it('handles empty graph', () => {
    const xml = '<gexf><graph defaultedgetype="directed"></graph></gexf>';
    const graph = fromGEXF(xml);
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.type).toBe('directed');
  });

  it('round-trips ports and edge port references', () => {
    expectFixtureRoundTrip((graph) => fromGEXF(toGEXF(graph)), {
      graphKeys: ['initialNodeId', 'data', 'direction'],
      nodeKeys: [
        'parentId',
        'initialNodeId',
        'label',
        'data',
        'x',
        'y',
        'width',
        'shape',
        'color',
        'ports',
      ],
      edgeKeys: ['label', 'data', 'color', 'sourcePort', 'targetPort'],
    });
  });
});
