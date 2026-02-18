import { describe, it, expect } from 'vitest';
import { toDOT, fromDOT, dotConverter } from '../../src/formats/dot';
import type { Graph } from '../../src/types';

describe('toDOT', () => {
  it('exports directed graph', () => {
    const g: Graph = {
      id: 'test',
      type: 'directed',
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
    const dot = toDOT(g);
    expect(dot).toContain('digraph test');
    expect(dot).toContain('a [label="Node A"]');
    expect(dot).toContain('a -> b [label="goes to"]');
  });

  it('exports undirected graph', () => {
    const g: Graph = {
      id: 'ug',
      type: 'undirected',
      initialNodeId: null,
      nodes: [
        { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: '', data: undefined },
        { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: '', data: undefined },
      ],
      edges: [
        { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: '', data: undefined },
      ],
      data: undefined,
    };
    const dot = toDOT(g);
    expect(dot).toContain('graph ug');
    expect(dot).toContain('a -- b');
  });

  it('escapes special characters in ids', () => {
    const g: Graph = {
      id: 'my graph',
      type: 'directed',
      initialNodeId: null,
      nodes: [
        { type: 'node', id: 'node 1', parentId: null, initialNodeId: null, label: 'has "quotes"', data: undefined },
      ],
      edges: [],
      data: undefined,
    };
    const dot = toDOT(g);
    expect(dot).toContain('"my graph"');
    expect(dot).toContain('"node 1"');
    expect(dot).toContain('has \\"quotes\\"');
  });
});

describe('fromDOT', () => {
  it('parses empty digraph', () => {
    const g = fromDOT('digraph G {}');
    expect(g.id).toBe('G');
    expect(g.type).toBe('directed');
    expect(g.nodes).toHaveLength(0);
    expect(g.edges).toHaveLength(0);
  });

  it('parses empty undirected graph', () => {
    const g = fromDOT('graph G {}');
    expect(g.type).toBe('undirected');
  });

  it('parses nodes with labels', () => {
    const g = fromDOT(`digraph G {
      a [label="Hello"];
      b [label="World"];
    }`);
    expect(g.nodes).toHaveLength(2);
    expect(g.nodes[0].id).toBe('a');
    expect(g.nodes[0].label).toBe('Hello');
    expect(g.nodes[1].id).toBe('b');
    expect(g.nodes[1].label).toBe('World');
  });

  it('parses node shapes', () => {
    const g = fromDOT(`digraph G {
      a [shape=box];
      b [shape=circle];
      c [shape=diamond];
    }`);
    expect(g.nodes[0].shape).toBe('rectangle');
    expect(g.nodes[1].shape).toBe('circle');
    expect(g.nodes[2].shape).toBe('diamond');
  });

  it('preserves unknown shapes as-is', () => {
    const g = fromDOT(`digraph G { a [shape=doublecircle]; }`);
    expect(g.nodes[0].shape).toBe('doublecircle');
  });

  it('parses node colors (fillcolor)', () => {
    const g = fromDOT(`digraph G {
      a [fillcolor="#ff0000" style=filled];
    }`);
    expect(g.nodes[0].color).toBe('#ff0000');
  });

  it('falls back to color attr when no fillcolor', () => {
    const g = fromDOT(`digraph G {
      a [color="blue"];
    }`);
    expect(g.nodes[0].color).toBe('blue');
  });

  it('parses edges', () => {
    const g = fromDOT(`digraph G { a -> b; }`);
    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].sourceId).toBe('a');
    expect(g.edges[0].targetId).toBe('b');
  });

  it('parses edge labels and color', () => {
    const g = fromDOT(`digraph G { a -> b [label="next" color="red"]; }`);
    expect(g.edges[0].label).toBe('next');
    expect(g.edges[0].color).toBe('red');
  });

  it('parses edge chains (a -> b -> c)', () => {
    const g = fromDOT(`digraph G { a -> b -> c -> d; }`);
    expect(g.edges).toHaveLength(3);
    expect(g.edges[0].sourceId).toBe('a');
    expect(g.edges[0].targetId).toBe('b');
    expect(g.edges[1].sourceId).toBe('b');
    expect(g.edges[1].targetId).toBe('c');
    expect(g.edges[2].sourceId).toBe('c');
    expect(g.edges[2].targetId).toBe('d');
  });

  it('auto-creates nodes from edges', () => {
    const g = fromDOT(`digraph G { a -> b; }`);
    expect(g.nodes).toHaveLength(2);
    expect(g.nodes.find((n) => n.id === 'a')).toBeDefined();
    expect(g.nodes.find((n) => n.id === 'b')).toBeDefined();
  });

  it('parses rankdir as direction', () => {
    const g = fromDOT(`digraph G { rankdir=LR; a; }`);
    expect(g.direction).toBe('right');
  });

  it('parses rankdir BT', () => {
    const g = fromDOT(`digraph G { rankdir=BT; }`);
    expect(g.direction).toBe('up');
  });

  it('parses subgraphs as compound nodes', () => {
    const g = fromDOT(`digraph G {
      subgraph cluster_sub {
        label="My Cluster";
        x; y;
        x -> y;
      }
    }`);
    const sub = g.nodes.find((n) => n.id === 'cluster_sub');
    expect(sub).toBeDefined();
    expect(sub!.label).toBe('My Cluster');
    expect(sub!.parentId).toBeNull();

    const x = g.nodes.find((n) => n.id === 'x');
    expect(x!.parentId).toBe('cluster_sub');

    const y = g.nodes.find((n) => n.id === 'y');
    expect(y!.parentId).toBe('cluster_sub');

    expect(g.edges).toHaveLength(1);
    expect(g.edges[0].sourceId).toBe('x');
    expect(g.edges[0].targetId).toBe('y');
  });

  it('parses nested subgraphs', () => {
    const g = fromDOT(`digraph G {
      subgraph cluster_a {
        subgraph cluster_b {
          n1;
        }
      }
    }`);
    const a = g.nodes.find((n) => n.id === 'cluster_a');
    const b = g.nodes.find((n) => n.id === 'cluster_b');
    const n1 = g.nodes.find((n) => n.id === 'n1');
    expect(a!.parentId).toBeNull();
    expect(b!.parentId).toBe('cluster_a');
    expect(n1!.parentId).toBe('cluster_b');
  });

  it('expands subgraph endpoints in edge statements', () => {
    const g = fromDOT(`digraph G {
      a;
      subgraph cluster_x { b; c; }
      a -> { b c };
      { b c } -> d;
    }`);

    const edgePairs = new Set(g.edges.map((e) => `${e.sourceId}->${e.targetId}`));
    expect(edgePairs.has('a->b')).toBe(true);
    expect(edgePairs.has('a->c')).toBe(true);
    expect(edgePairs.has('b->d')).toBe(true);
    expect(edgePairs.has('c->d')).toBe(true);
  });

  it('applies node defaults', () => {
    const g = fromDOT(`digraph G {
      node [shape=box];
      a;
      b;
    }`);
    expect(g.nodes[0].shape).toBe('rectangle');
    expect(g.nodes[1].shape).toBe('rectangle');
  });

  it('node-level attrs override defaults', () => {
    const g = fromDOT(`digraph G {
      node [shape=box];
      a [shape=circle];
      b;
    }`);
    expect(g.nodes[0].shape).toBe('circle');
    expect(g.nodes[1].shape).toBe('rectangle');
  });

  it('applies edge defaults', () => {
    const g = fromDOT(`digraph G {
      edge [color="green"];
      a -> b;
      c -> d [color="red"];
    }`);
    expect(g.edges[0].color).toBe('green');
    expect(g.edges[1].color).toBe('red');
  });

  it('throws on empty input', () => {
    expect(() => fromDOT('')).toThrow('DOT: input is empty');
  });

  it('throws on invalid syntax', () => {
    expect(() => fromDOT('not a graph')).toThrow('DOT:');
  });

  it('parses graph without explicit id', () => {
    const g = fromDOT('digraph { a -> b; }');
    expect(g.id).toBe('');
    expect(g.nodes).toHaveLength(2);
  });
});

describe('dotConverter', () => {
  it('has to and from methods', () => {
    expect(typeof dotConverter.to).toBe('function');
    expect(typeof dotConverter.from).toBe('function');
  });

  it('round-trips a simple graph', () => {
    const g: Graph = {
      id: 'test',
      type: 'directed',
      initialNodeId: null,
      nodes: [
        { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'A', data: undefined },
        { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'B', data: undefined },
      ],
      edges: [
        { type: 'edge', id: 'e0', sourceId: 'a', targetId: 'b', label: 'next', data: undefined },
      ],
      data: undefined,
    };

    const dot = dotConverter.to(g);
    const restored = dotConverter.from(dot);

    expect(restored.id).toBe('test');
    expect(restored.type).toBe('directed');
    expect(restored.nodes).toHaveLength(2);
    expect(restored.nodes[0].id).toBe('a');
    expect(restored.nodes[0].label).toBe('A');
    expect(restored.nodes[1].id).toBe('b');
    expect(restored.nodes[1].label).toBe('B');
    expect(restored.edges).toHaveLength(1);
    expect(restored.edges[0].sourceId).toBe('a');
    expect(restored.edges[0].targetId).toBe('b');
    expect(restored.edges[0].label).toBe('next');
  });
});
