import { describe, it, expect } from 'vitest';
import {
  createGraph,
  addEdge,
  addNode,
  deleteEdge,
  updateEdge,
  invalidateIndex,
} from '../src';
import {
  getConnectedComponents,
  getPageRank,
  getClosenessCentrality,
} from '../src/algorithms';

/**
 * The CSR snapshot (src/algorithms/csr.ts) caches per index object + version.
 * These tests pin its invalidation contract: every mutation-API change and
 * every index-level staleness trigger must be reflected by CSR-backed
 * algorithms on the next call.
 */
describe('CSR cache invalidation', () => {
  it('reflects addEdge/addNode (incremental index updates)', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(getConnectedComponents(g)).toHaveLength(2);

    addEdge(g, { id: 'e2', sourceId: 'b', targetId: 'c' });
    expect(getConnectedComponents(g)).toHaveLength(1);

    addNode(g, { id: 'd' });
    expect(getConnectedComponents(g)).toHaveLength(2);
  });

  it('reflects deleteEdge (index rebuild via array replacement)', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(getConnectedComponents(g)).toHaveLength(1);
    deleteEdge(g, 'e1');
    expect(getConnectedComponents(g)).toHaveLength(2);
  });

  it('reflects updateEdge endpoint changes', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(getConnectedComponents(g)).toHaveLength(2);
    updateEdge(g, 'e1', { targetId: 'c' });
    const components = getConnectedComponents(g).map((c) =>
      c.map((n) => n.id).sort(),
    );
    expect(components).toContainEqual(['a', 'c']);
    expect(components).toContainEqual(['b']);
  });

  it('reflects per-edge mode changes via updateEdge', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    // Directed: b cannot reach a, so closeness(b) is 0 (unset)
    expect(getClosenessCentrality(g).b).toBe(0);

    updateEdge(g, 'e1', { mode: 'undirected' });
    expect(getClosenessCentrality(g).b).toBeGreaterThan(0);
  });

  it('reflects direct graph.mode mutation', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(getClosenessCentrality(g).b).toBe(0);
    g.mode = 'undirected';
    expect(getClosenessCentrality(g).b).toBeGreaterThan(0);
  });

  it('reflects immutable-style array replacement', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    const before = getPageRank(g);
    expect(before.b).toBeGreaterThan(before.a); // b receives the link

    g.edges = g.edges.map((e) => ({ ...e, sourceId: 'b', targetId: 'a' }));
    const after = getPageRank(g);
    expect(after.a).toBeGreaterThan(after.b);
  });

  it('reflects in-place field mutation after invalidateIndex (documented contract)', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(getConnectedComponents(g)).toHaveLength(2);
    g.edges[0].targetId = 'c';
    invalidateIndex(g);
    const components = getConnectedComponents(g).map((c) =>
      c.map((n) => n.id).sort(),
    );
    expect(components).toContainEqual(['a', 'c']);
  });

  it('handles dangling edge endpoints like the index (skipped, no crash)', () => {
    const g = createGraph({ nodes: [{ id: 'a' }] });
    // Bypass addEdge validation deliberately (importers can produce this)
    g.edges = [
      {
        type: 'edge',
        id: 'e1',
        sourceId: 'a',
        targetId: 'ghost',
        label: null,
        data: null,
      },
    ];
    expect(getConnectedComponents(g)).toHaveLength(1);
    expect(getPageRank(g).a).toBeGreaterThan(0);
  });
});
