import { describe, it, expect } from 'vitest';
import { toGML, fromGML } from '../../src/formats/gml';
import type { Graph } from '../../src/types';
import { expectFixtureRoundTrip } from './fixture-roundtrip';

const sampleGraph: Graph = {
  id: 'test',
  mode: 'directed',
  initialNodeId: null,
  nodes: [
    { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'Node A', data: { key: 'val' } },
    { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'Node B', data: undefined },
    { type: 'node', id: 'c', parentId: 'a', initialNodeId: null, label: 'Child', data: undefined },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: 'connects', data: undefined },
  ],
  data: undefined,
};

describe('GML', () => {
  it('toGML() produces valid GML', () => {
    const gml = toGML(sampleGraph);
    expect(gml).toContain('graph [');
    expect(gml).toContain('directed 1');
    expect(gml).toContain('id "a"');
    expect(gml).toContain('label "Node A"');
    expect(gml).toContain('source "a"');
    expect(gml).toContain('target "b"');
  });

  it('nests child nodes inside parents', () => {
    const gml = toGML(sampleGraph);
    // Child node "c" should appear nested inside node "a"
    const nodeAStart = gml.indexOf('id "a"');
    const nodeCStart = gml.indexOf('id "c"');
    const nodeAEnd = gml.indexOf(']', nodeCStart);
    expect(nodeCStart).toBeGreaterThan(nodeAStart);
    expect(nodeAEnd).toBeGreaterThan(nodeCStart);
  });

  it('round-trips through toGML/fromGML', () => {
    const gml = toGML(sampleGraph);
    const parsed = fromGML(gml);

    expect(parsed.id).toBe('test');
    expect(parsed.mode).toBe('directed');
    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(1);

    const nodeA = parsed.nodes.find((n) => n.id === 'a');
    expect(nodeA?.label).toBe('Node A');
    expect(nodeA?.data).toEqual({ key: 'val' });

    const nodeC = parsed.nodes.find((n) => n.id === 'c');
    expect(nodeC?.parentId).toBe('a');

    expect(parsed.edges[0].label).toBe('connects');
  });

  it('handles undirected graphs', () => {
    const gml = toGML({ ...sampleGraph, mode: 'undirected' });
    expect(gml).toContain('directed 0');
    const parsed = fromGML(gml);
    expect(parsed.mode).toBe('undirected');
  });

  it('handles graphics properties', () => {
    const g: Graph = {
      ...sampleGraph,
      nodes: [
        { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'A', data: undefined, x: 10, y: 20, width: 100, height: 50 },
      ],
      edges: [],
    };
    const gml = toGML(g);
    expect(gml).toContain('graphics [');
    expect(gml).toContain('x 10');
    expect(gml).toContain('y 20');
    expect(gml).toContain('w 100');
    expect(gml).toContain('h 50');

    const parsed = fromGML(gml);
    expect(parsed.nodes[0].x).toBe(10);
    expect(parsed.nodes[0].y).toBe(20);
    expect(parsed.nodes[0].width).toBe(100);
    expect(parsed.nodes[0].height).toBe(50);
  });

  it('throws on empty input', () => {
    expect(() => fromGML('')).toThrow('GML: input is empty');
    expect(() => fromGML('   ')).toThrow('GML: input is empty');
  });

  it('throws on missing graph block', () => {
    expect(() => fromGML('node [ id "a" ]')).toThrow('GML: missing top-level "graph" block');
  });

  it('handles graph with no nodes or edges', () => {
    const graph = fromGML('graph [ directed 1 ]');
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.mode).toBe('directed');
  });

  it('handles comments in GML', () => {
    const gml = `
# This is a comment
graph [
  directed 1
  # Another comment
  node [
    id "a"
    label "A"
  ]
]`;
    const graph = fromGML(gml);
    expect(graph.nodes).toHaveLength(1);
    expect(graph.nodes[0].label).toBe('A');
  });

  it('throws on non-numeric edge weight', () => {
    const gml = `
graph [
  directed 1
  node [ id "a" ]
  node [ id "b" ]
  edge [ id "e1" source "a" target "b" weight "heavy" ]
]`;
    expect(() => fromGML(gml)).toThrow(
      'GML: weight value "heavy" on edge "e1" is not a number. Fix the value or remove the attribute.',
    );
  });

  it('throws on non-numeric graphics values', () => {
    const nodeGml = `
graph [
  directed 1
  node [ id "a" graphics [ x "left" ] ]
]`;
    expect(() => fromGML(nodeGml)).toThrow(
      'GML: graphics x value "left" on node "a" is not a number. Fix the value or remove the attribute.',
    );

    const edgeGml = `
graph [
  directed 1
  node [ id "a" ]
  node [ id "b" ]
  edge [ id "e1" source "a" target "b" graphics [ w "wide" ] ]
]`;
    expect(() => fromGML(edgeGml)).toThrow(
      'GML: graphics w value "wide" on edge "e1" is not a number. Fix the value or remove the attribute.',
    );
  });

  it('round-trips ports and edge port references', () => {
    expectFixtureRoundTrip((graph) => fromGML(toGML(graph)), {
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
