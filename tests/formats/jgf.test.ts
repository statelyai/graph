import { createGraph } from '../../src/graph';
import { describe, it, expect } from 'vitest';
import { toJGF, fromJGF } from '../../src/formats/jgf';
import type { Graph } from '../../src/types';
import { expectFixtureRoundTrip } from './fixture-roundtrip';

const sampleGraph: Graph = {
  id: 'test',
  mode: 'directed',
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
    // Legacy default retains graph.id for existing array-shape consumers.
    expect(jgf.graph.id).toBe('test');
    expect(fromJGF(jgf).id).toBe('test');
    expect(jgf.graph.nodes).toHaveLength(3);
    expect(jgf.graph.edges).toHaveLength(2);
    expect(jgf.graph.edges[0].source).toBe('a');
    expect(jgf.graph.edges[0].target).toBe('b');
  });

  it('round-trips through toJGF/fromJGF', () => {
    const jgf = toJGF(sampleGraph);
    const parsed = fromJGF(jgf);

    expect(parsed.id).toBe('test');
    expect(parsed.mode).toBe('directed');
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
    const jgf = toJGF({ ...sampleGraph, mode: 'undirected' });
    expect(jgf.graph.directed).toBe(false);
    const parsed = fromJGF(jgf);
    expect(parsed.mode).toBe('undirected');
  });

  it('throws on null/undefined input', () => {
    expect(() => fromJGF(null as any)).toThrow('JGF: expected an object');
    expect(() => fromJGF(undefined as any)).toThrow('JGF: expected an object');
  });

  it('throws on missing graph property', () => {
    expect(() => fromJGF({} as any)).toThrow('JGF: missing "graph" property');
    expect(() => fromJGF({ graph: 'not an object' } as any)).toThrow('JGF: missing "graph" property');
  });

  it('throws on malformed nodes/edges collections', () => {
    expect(() => fromJGF({ graph: { nodes: 'bad', edges: [] } } as any)).toThrow('JGF: "graph.nodes" must be an array or object');
    expect(() => fromJGF({ graph: { nodes: [], edges: 'bad' } } as any)).toThrow('JGF: "graph.edges" must be an array');
  });

  it('handles empty graph', () => {
    const graph = fromJGF({ graph: { nodes: [], edges: [] } });
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
    expect(graph.mode).toBe('directed');
  });

  it('round-trips ports and edge port references', () => {
    expectFixtureRoundTrip((graph) => fromJGF(toJGF(graph)), {
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

describe('JGF versions and native semantics', () => {
  it('exports v1 without forbidden graph.id and v2 with ID-keyed nodes', () => {
    const graph = sampleGraph;
    const v1 = toJGF(graph, { version: 1 });
    expect(Object.keys(v1.graph).sort()).toEqual(['directed', 'edges', 'metadata', 'nodes']);
    expect(v1.graph.nodes.every((node) => typeof node.id === 'string')).toBe(true);
    const v2 = toJGF(graph, { version: 2 });
    expect(v2.graph.id).toBe('test');
    expect(Object.keys(v2.graph.nodes)).toEqual(['a', 'b', 'c']);
    expect(Object.values(v2.graph.nodes).every((node) => !Object.hasOwn(node, 'id'))).toBe(true);
    expect(JSON.parse(JSON.stringify(fromJGF(v2)))).toEqual(JSON.parse(JSON.stringify(graph)));
  });

  it('preserves Graph node order through numeric v2 dictionary keys', () => {
    const graph: Graph = { id: '', mode: 'directed', data: null, nodes: [
      { type: 'node', id: '10', data: null }, { type: 'node', id: '2', data: null },
    ], edges: [] };
    expect(JSON.parse(JSON.stringify(fromJGF(toJGF(graph, { version: 2 }))))).toEqual(graph);
  });

  it('imports v2 native directedness, relation and arbitrary metadata', () => {
    const native = { graph: { id: 'native', directed: true, label: 'Network', metadata: { author: 'Ada' },
      nodes: { a: { metadata: { score: 10 } }, b: {} },
      edges: [{ source: 'a', target: 'b', directed: false, relation: 'knows', metadata: { confidence: 0.9 } }],
    } };
    const graph = fromJGF(native);
    expect(graph.edges[0].mode).toBe('undirected');
    expect(graph.edges[0].data).toEqual({ confidence: 0.9, relation: 'knows' });
    // Default output remains v1 for array-shape consumers, including imported v2.
    expect(Array.isArray(toJGF(graph).graph.nodes)).toBe(true);
    expect(toJGF(graph, { version: 2 })).toMatchObject(native);
  });

  it('accepts schema-valid documents with optional nodes and edges omitted', () => {
    expect(fromJGF({ graph: {} } as any).nodes).toEqual([]);
    expect(fromJGF({ graph: { nodes: null, edges: null } } as any).edges).toEqual([]);
  });

  it('accepts the former hybrid dialect and permits explicit standards-valid v1', () => {
    const graph = fromJGF({ graph: { id: 'old', directed: true, metadata: { data: { old: true } },
      nodes: [{ id: 'a', metadata: { data: { keep: 1 }, parentId: null } }], edges: [] } });
    expect(graph.id).toBe('old');
    expect(graph.nodes[0].data).toEqual({ keep: 1 });
    const next = toJGF(graph);
    expect(next.graph.id).toBe('old');
    expect(toJGF(graph, { version: 1 }).graph.id).toBeUndefined();
    expect(fromJGF(next).id).toBe('old');
  });
});


describe('JGF legacy default type and wire compatibility', () => {
  it('always emits the required string graph id, including empty identity', () => {
    const graph = createGraph();
    const native = toJGF(graph);
    const id: string = native.graph.id;
    expect(id).toBe('');
    expect(Object.hasOwn(native.graph, 'id')).toBe(true);
    expect(toJGF(graph, { version: 1 }).graph).not.toHaveProperty('id');
  });
});
