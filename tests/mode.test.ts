import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import { getEdgeMode, isEdgeDirected } from '../src/mode';
import { getNeighbors, getEdgesBetween, getDegree } from '../src/queries';

describe('graph mode', () => {
  it('defaults to directed', () => {
    const graph = createGraph({ nodes: [{ id: 'a' }] });
    expect(graph.mode).toBe('directed');
  });

  it('respects an explicit mode', () => {
    expect(createGraph({ mode: 'undirected', nodes: [] }).mode).toBe(
      'undirected',
    );
    expect(createGraph({ mode: 'bidirectional', nodes: [] }).mode).toBe(
      'bidirectional',
    );
  });

  it('persists a per-edge mode override', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', mode: 'undirected' }],
    });
    expect(graph.edges[0].mode).toBe('undirected');
    expect(getEdgeMode(graph, graph.edges[0])).toBe('undirected');
    expect(isEdgeDirected(graph, graph.edges[0])).toBe(false);
  });

  it('edges inherit the graph mode when there is no override', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    expect(getEdgeMode(graph, graph.edges[0])).toBe('directed');
    expect(isEdgeDirected(graph, graph.edges[0])).toBe(true);
  });

  it('treats bidirectional graphs as traversable both ways', () => {
    const graph = createGraph({
      mode: 'bidirectional',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    expect(getNeighbors(graph, 'b').map((n) => n.id)).toContain('a');
    expect(getEdgesBetween(graph, 'b', 'a')).toHaveLength(1);
    expect(getDegree(graph, 'a')).toBe(1);
  });
});
