import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import {
  getNeighbors,
  getSuccessors,
  getPredecessors,
  getDegree,
  getInDegree,
  getOutDegree,
  getEdgesOf,
  getInEdges,
  getOutEdges,
  getEdgeBetween,
  getChildren,
  getParent,
  getAncestors,
  getDescendants,
  getRoots,
  isCompound,
  isLeaf,
  getDepth,
  getSiblings,
  getLCA,
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
  it('getEdgesOf()', () => {
    const g = makeDirectedGraph();
    expect(getEdgesOf(g, 'a')).toHaveLength(2);
    expect(getEdgesOf(g, 'b')).toHaveLength(2); // 1 in + 1 out
    expect(getEdgesOf(g, 'd')).toHaveLength(1);
  });

  it('getInEdges() / getOutEdges()', () => {
    const g = makeDirectedGraph();
    expect(getInEdges(g, 'b')).toHaveLength(1);
    expect(getOutEdges(g, 'a')).toHaveLength(2);
  });

  it('getEdgeBetween() directed', () => {
    const g = makeDirectedGraph();
    expect(getEdgeBetween(g, 'a', 'b')?.id).toBe('e1');
    expect(getEdgeBetween(g, 'b', 'a')).toBeUndefined();
  });

  it('getEdgeBetween() undirected', () => {
    const g = makeUndirectedGraph();
    expect(getEdgeBetween(g, 'a', 'b')?.id).toBe('e1');
    expect(getEdgeBetween(g, 'b', 'a')?.id).toBe('e1');
  });
});

describe('Neighbor queries', () => {
  it('getSuccessors()', () => {
    const g = makeDirectedGraph();
    const s = getSuccessors(g, 'a');
    expect(s.map((n) => n.id).sort()).toEqual(['b', 'c']);
  });

  it('getPredecessors()', () => {
    const g = makeDirectedGraph();
    const p = getPredecessors(g, 'b');
    expect(p.map((n) => n.id)).toEqual(['a']);
  });

  it('getNeighbors() directed', () => {
    const g = makeDirectedGraph();
    const n = getNeighbors(g, 'b');
    expect(n.map((x) => x.id).sort()).toEqual(['a', 'd']);
  });

  it('getNeighbors() undirected', () => {
    const g = makeUndirectedGraph();
    const n = getNeighbors(g, 'b');
    expect(n.map((x) => x.id).sort()).toEqual(['a', 'c']);
  });
});

describe('Degree queries', () => {
  it('getDegree() directed', () => {
    const g = makeDirectedGraph();
    expect(getDegree(g, 'a')).toBe(2); // 0 in + 2 out
    expect(getDegree(g, 'b')).toBe(2); // 1 in + 1 out
  });

  it('getInDegree() / getOutDegree()', () => {
    const g = makeDirectedGraph();
    expect(getInDegree(g, 'a')).toBe(0);
    expect(getOutDegree(g, 'a')).toBe(2);
    expect(getInDegree(g, 'd')).toBe(1);
  });

  it('getDegree() undirected', () => {
    const g = makeUndirectedGraph();
    expect(getDegree(g, 'b')).toBe(2);
    expect(getDegree(g, 'a')).toBe(1);
  });
});

describe('Hierarchy queries', () => {
  it('getChildren()', () => {
    const g = makeHierarchyGraph();
    expect(getChildren(g, 'root').map((n) => n.id).sort()).toEqual([
      'child1',
      'child2',
    ]);
    expect(getChildren(g, 'child2')).toHaveLength(0);
  });

  it('getChildren(null) returns root nodes', () => {
    const g = makeHierarchyGraph();
    expect(getChildren(g, null).map((n) => n.id)).toEqual(['root']);
  });

  it('getParent()', () => {
    const g = makeHierarchyGraph();
    expect(getParent(g, 'child1')?.id).toBe('root');
    expect(getParent(g, 'root')).toBeUndefined();
  });

  it('getAncestors()', () => {
    const g = makeHierarchyGraph();
    expect(getAncestors(g, 'grandchild').map((n) => n.id)).toEqual([
      'child1',
      'root',
    ]);
  });

  it('getDescendants()', () => {
    const g = makeHierarchyGraph();
    expect(getDescendants(g, 'root').map((n) => n.id).sort()).toEqual([
      'child1',
      'child2',
      'grandchild',
    ]);
  });

  it('getRoots()', () => {
    const g = makeHierarchyGraph();
    expect(getRoots(g).map((n) => n.id)).toEqual(['root']);
  });
});

// --- Hierarchy helper queries ---

// Hierarchy used for LCCA tests:
//
//   root
//   ├── a
//   │   ├── a1
//   │   └── a2
//   └── b
//       ├── b1
//       └── b2
//
function makeDeepHierarchy() {
  return createGraph({
    nodes: [
      { id: 'root' },
      { id: 'a', parentId: 'root' },
      { id: 'a1', parentId: 'a' },
      { id: 'a2', parentId: 'a' },
      { id: 'b', parentId: 'root' },
      { id: 'b1', parentId: 'b' },
      { id: 'b2', parentId: 'b' },
    ],
    edges: [
      { id: 'e1', sourceId: 'a1', targetId: 'a2' },
      { id: 'e2', sourceId: 'a2', targetId: 'b1' },
    ],
  });
}

describe('isCompound / isLeaf', () => {
  it('compound nodes have children', () => {
    const g = makeDeepHierarchy();
    expect(isCompound(g, 'root')).toBe(true);
    expect(isCompound(g, 'a')).toBe(true);
    expect(isCompound(g, 'b')).toBe(true);
  });

  it('leaf nodes have no children', () => {
    const g = makeDeepHierarchy();
    expect(isLeaf(g, 'a1')).toBe(true);
    expect(isLeaf(g, 'a2')).toBe(true);
    expect(isLeaf(g, 'b1')).toBe(true);
    expect(isLeaf(g, 'b2')).toBe(true);
  });

  it('isCompound and isLeaf are inverses', () => {
    const g = makeDeepHierarchy();
    for (const n of g.nodes) {
      expect(isCompound(g, n.id)).toBe(!isLeaf(g, n.id));
    }
  });
});

describe('depth', () => {
  it('root depth is 0', () => {
    const g = makeDeepHierarchy();
    expect(getDepth(g, 'root')).toBe(0);
  });

  it('immediate children depth is 1', () => {
    const g = makeDeepHierarchy();
    expect(getDepth(g, 'a')).toBe(1);
    expect(getDepth(g, 'b')).toBe(1);
  });

  it('grandchildren depth is 2', () => {
    const g = makeDeepHierarchy();
    expect(getDepth(g, 'a1')).toBe(2);
    expect(getDepth(g, 'b2')).toBe(2);
  });

  it('returns -1 for nonexistent node', () => {
    const g = makeDeepHierarchy();
    expect(getDepth(g, 'nope')).toBe(-1);
  });
});

describe('siblings', () => {
  it('returns sibling nodes (same parent)', () => {
    const g = makeDeepHierarchy();
    expect(getSiblings(g, 'a1').map((n) => n.id)).toEqual(['a2']);
    expect(getSiblings(g, 'a').map((n) => n.id)).toEqual(['b']);
  });

  it('root has no siblings', () => {
    const g = makeDeepHierarchy();
    expect(getSiblings(g, 'root')).toEqual([]);
  });
});

describe('getLCA', () => {
  it('LCA of siblings is their parent', () => {
    const g = makeDeepHierarchy();
    expect(getLCA(g, 'a1', 'a2')?.id).toBe('a');
  });

  it('LCA of cousins is grandparent', () => {
    const g = makeDeepHierarchy();
    expect(getLCA(g, 'a1', 'b1')?.id).toBe('root');
  });

  it('LCA of parent and child is proper ancestor (grandparent)', () => {
    const g = makeDeepHierarchy();
    // a is parent of a1, but LCA must be a proper ancestor of both
    expect(getLCA(g, 'a', 'a1')?.id).toBe('root');
  });

  it('single node returns its parent', () => {
    const g = makeDeepHierarchy();
    expect(getLCA(g, 'a1')?.id).toBe('a');
  });

  it('LCA of three nodes across branches', () => {
    const g = makeDeepHierarchy();
    expect(getLCA(g, 'a1', 'a2', 'b1')?.id).toBe('root');
  });

  it('returns undefined for no args', () => {
    const g = makeDeepHierarchy();
    expect(getLCA(g)).toBeUndefined();
  });

  it('returns undefined for root node (no ancestor)', () => {
    const g = makeDeepHierarchy();
    expect(getLCA(g, 'root')).toBeUndefined();
  });

  it('returns undefined for flat graph (no hierarchy)', () => {
    const g = createGraph({
      nodes: [{ id: 'x' }, { id: 'y' }],
    });
    expect(getLCA(g, 'x', 'y')).toBeUndefined();
  });
});
