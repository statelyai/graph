import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import {
  neighbors,
  successors,
  predecessors,
  degree,
  inDegree,
  outDegree,
  edgesOf,
  inEdges,
  outEdges,
  edgeBetween,
  children,
  parent,
  ancestors,
  descendants,
  roots,
} from '../src/queries';

function makeDirectedGraph() {
  return createGraph({
    id: 'dag',
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b' },
      { id: 'e2', sourceId: 'a', targetId: 'c' },
      { id: 'e3', sourceId: 'b', targetId: 'd' },
    ],
  });
}

function makeUndirectedGraph() {
  return createGraph({
    id: 'ug',
    type: 'undirected',
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b' },
      { id: 'e2', sourceId: 'b', targetId: 'c' },
    ],
  });
}

function makeHierarchyGraph() {
  return createGraph({
    nodes: [
      { id: 'root' },
      { id: 'child1', parentId: 'root' },
      { id: 'child2', parentId: 'root' },
      { id: 'grandchild', parentId: 'child1' },
    ],
    edges: [],
  });
}

describe('Edge queries', () => {
  it('edgesOf()', () => {
    const g = makeDirectedGraph();
    expect(edgesOf(g, 'a')).toHaveLength(2);
    expect(edgesOf(g, 'b')).toHaveLength(2); // 1 in + 1 out
    expect(edgesOf(g, 'd')).toHaveLength(1);
  });

  it('inEdges() / outEdges()', () => {
    const g = makeDirectedGraph();
    expect(inEdges(g, 'b')).toHaveLength(1);
    expect(outEdges(g, 'a')).toHaveLength(2);
  });

  it('edgeBetween() directed', () => {
    const g = makeDirectedGraph();
    expect(edgeBetween(g, 'a', 'b')?.id).toBe('e1');
    expect(edgeBetween(g, 'b', 'a')).toBeUndefined();
  });

  it('edgeBetween() undirected', () => {
    const g = makeUndirectedGraph();
    expect(edgeBetween(g, 'a', 'b')?.id).toBe('e1');
    expect(edgeBetween(g, 'b', 'a')?.id).toBe('e1');
  });
});

describe('Neighbor queries', () => {
  it('successors()', () => {
    const g = makeDirectedGraph();
    const s = successors(g, 'a');
    expect(s.map((n) => n.id).sort()).toEqual(['b', 'c']);
  });

  it('predecessors()', () => {
    const g = makeDirectedGraph();
    const p = predecessors(g, 'b');
    expect(p.map((n) => n.id)).toEqual(['a']);
  });

  it('neighbors() directed', () => {
    const g = makeDirectedGraph();
    const n = neighbors(g, 'b');
    expect(n.map((x) => x.id).sort()).toEqual(['a', 'd']);
  });

  it('neighbors() undirected', () => {
    const g = makeUndirectedGraph();
    const n = neighbors(g, 'b');
    expect(n.map((x) => x.id).sort()).toEqual(['a', 'c']);
  });
});

describe('Degree queries', () => {
  it('degree() directed', () => {
    const g = makeDirectedGraph();
    expect(degree(g, 'a')).toBe(2); // 0 in + 2 out
    expect(degree(g, 'b')).toBe(2); // 1 in + 1 out
  });

  it('inDegree() / outDegree()', () => {
    const g = makeDirectedGraph();
    expect(inDegree(g, 'a')).toBe(0);
    expect(outDegree(g, 'a')).toBe(2);
    expect(inDegree(g, 'd')).toBe(1);
  });

  it('degree() undirected', () => {
    const g = makeUndirectedGraph();
    expect(degree(g, 'b')).toBe(2);
    expect(degree(g, 'a')).toBe(1);
  });
});

describe('Hierarchy queries', () => {
  it('children()', () => {
    const g = makeHierarchyGraph();
    expect(children(g, 'root').map((n) => n.id).sort()).toEqual([
      'child1',
      'child2',
    ]);
    expect(children(g, 'child2')).toHaveLength(0);
  });

  it('children(null) returns root nodes', () => {
    const g = makeHierarchyGraph();
    expect(children(g, null).map((n) => n.id)).toEqual(['root']);
  });

  it('parent()', () => {
    const g = makeHierarchyGraph();
    expect(parent(g, 'child1')?.id).toBe('root');
    expect(parent(g, 'root')).toBeUndefined();
  });

  it('ancestors()', () => {
    const g = makeHierarchyGraph();
    expect(ancestors(g, 'grandchild').map((n) => n.id)).toEqual([
      'child1',
      'root',
    ]);
  });

  it('descendants()', () => {
    const g = makeHierarchyGraph();
    expect(descendants(g, 'root').map((n) => n.id).sort()).toEqual([
      'child1',
      'child2',
      'grandchild',
    ]);
  });

  it('roots()', () => {
    const g = makeHierarchyGraph();
    expect(roots(g).map((n) => n.id)).toEqual(['root']);
  });
});
