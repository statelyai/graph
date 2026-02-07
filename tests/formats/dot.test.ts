import { describe, it, expect } from 'vitest';
import { toDOT } from '../../src/formats/dot';
import type { Graph } from '../../src/types';

describe('DOT', () => {
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
