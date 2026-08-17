import { describe, it, expect } from 'vitest';
import {
  createGraph,
  getFlattenedGraph,
  getMappedGraph,
  getFilteredGraph,
  getShortestPaths,
  getTopologicalSort,
  isAcyclic,
  getConnectedComponents,
} from '../src';

describe('getFlattenedGraph', () => {
  it('a→b(b1→b2)→c resolves to a→b1, b1→b2, b1→c, b2→c', () => {
    const g = createGraph({
      nodes: [
        { id: 'a' },
        { id: 'b', initialNodeId: 'b1' },
        { id: 'b1', parentId: 'b' },
        { id: 'b2', parentId: 'b' },
        { id: 'c' },
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b1', targetId: 'b2' },
        { id: 'e3', sourceId: 'b', targetId: 'c' },
      ],
    });

    const flat = getFlattenedGraph(g);

    // Only leaf nodes
    const nodeIds = flat.nodes.map((n) => n.id).sort();
    expect(nodeIds).toEqual(['a', 'b1', 'b2', 'c']);

    // No hierarchy
    expect(flat.nodes.every((n) => n.parentId == null)).toBe(true);

    // Edges: a→b1, b1→b2, b1→c, b2→c
    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort();
    expect(edges).toEqual(['a->b1', 'b1->b2', 'b1->c', 'b2->c']);
  });

  it('already flat graph is unchanged', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });

    const flat = getFlattenedGraph(g);
    expect(flat.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c']);
    expect(flat.edges.map((e) => `${e.sourceId}->${e.targetId}`)).toEqual([
      'a->b',
      'b->c',
    ]);
  });

  it('deeply nested: resolves through multiple levels', () => {
    // a → b → b1 → b1a (initial chain: b→b1→b1a)
    const g = createGraph({
      nodes: [
        { id: 'a' },
        { id: 'b', initialNodeId: 'b1' },
        { id: 'b1', parentId: 'b', initialNodeId: 'b1a' },
        { id: 'b1a', parentId: 'b1' },
        { id: 'b1b', parentId: 'b1' },
        { id: 'c' },
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });

    const flat = getFlattenedGraph(g);

    const nodeIds = flat.nodes.map((n) => n.id).sort();
    expect(nodeIds).toEqual(['a', 'b1a', 'b1b', 'c']);

    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort();
    // a→b resolves to a→b1a (deepest initial)
    // b→c expands from all leaf descendants of b: b1a→c, b1b→c
    expect(edges).toEqual(['a->b1a', 'b1a->c', 'b1b->c']);
  });

  it('no initialNodeId: defaults to first child', () => {
    const g = createGraph({
      nodes: [
        { id: 'a' },
        { id: 'b' }, // no initialNodeId
        { id: 'b1', parentId: 'b' },
        { id: 'b2', parentId: 'b' },
      ],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });

    const flat = getFlattenedGraph(g);
    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`);
    // Falls back to first child
    expect(edges).toEqual(['a->b1']);
  });

  it('deduplicates edges', () => {
    // Two edges both resolve to the same source→target
    const g = createGraph({
      nodes: [
        { id: 'a' },
        { id: 'b', initialNodeId: 'b1' },
        { id: 'b1', parentId: 'b' },
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'b1' }, // already points to b1
      ],
    });

    const flat = getFlattenedGraph(g);
    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`);
    expect(edges).toEqual(['a->b1']); // deduplicated
  });

  it('preserves edge labels', () => {
    const g = createGraph({
      nodes: [
        { id: 'a' },
        { id: 'b', initialNodeId: 'b1' },
        { id: 'b1', parentId: 'b' },
      ],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', label: 'GO' }],
    });

    const flat = getFlattenedGraph(g);
    expect(flat.edges[0].label).toBe('GO');
  });

  it('preserves edge data', () => {
    const g = createGraph<any, { weight: number }>({
      nodes: [
        { id: 'a' },
        { id: 'b', initialNodeId: 'b1' },
        { id: 'b1', parentId: 'b' },
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', data: { weight: 5 } },
      ],
    });

    const flat = getFlattenedGraph(g);
    expect(flat.edges[0].data).toEqual({ weight: 5 });
  });

  it('preserves graph metadata', () => {
    const g = createGraph({
      id: 'my-graph',
      mode: 'directed',
      data: { name: 'test' },
      nodes: [{ id: 'a' }],
      edges: [],
    });

    const flat = getFlattenedGraph(g);
    expect(flat.id).toBe('my-graph');
    expect(flat.mode).toBe('directed');
    expect(flat.data).toEqual({ name: 'test' });
  });

  it('empty graph', () => {
    const g = createGraph();
    const flat = getFlattenedGraph(g);
    expect(flat.nodes).toEqual([]);
    expect(flat.edges).toEqual([]);
  });

  it('compound node with no children is treated as leaf', () => {
    // A node with initialNodeId but no actual children
    const g = createGraph({
      nodes: [
        { id: 'a' },
        { id: 'b', initialNodeId: 'missing' },
      ],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });

    const flat = getFlattenedGraph(g);
    // b has no children so it's a leaf itself
    expect(flat.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(flat.edges.map((e) => `${e.sourceId}->${e.targetId}`)).toEqual([
      'a->b',
    ]);
  });

  it('shortest path works on flattened graph', () => {
    const g = createGraph({
      nodes: [
        { id: 'a' },
        { id: 'b', initialNodeId: 'b1' },
        { id: 'b1', parentId: 'b' },
        { id: 'b2', parentId: 'b' },
        { id: 'c' },
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b1', targetId: 'b2' },
        { id: 'e3', sourceId: 'b', targetId: 'c' },
      ],
    });

    const flat = getFlattenedGraph(g);
    const paths = getShortestPaths(flat, { from: 'a', to: 'c' });

    // a→b1→c (length 2) is shorter than a→b1→b2→c (length 3)
    expect(paths.length).toBeGreaterThanOrEqual(1);
    expect(paths[0].steps).toHaveLength(2); // a→b1, b1→c
    expect(paths[0].source.id).toBe('a');
    expect(paths[0].steps[paths[0].steps.length - 1].node.id).toBe('c');
  });

  it('preserves document order of leaf nodes', () => {
    const g = createGraph({
      nodes: [
        { id: 'x' },
        { id: 'compound', initialNodeId: 'c1' },
        { id: 'c1', parentId: 'compound' },
        { id: 'c2', parentId: 'compound' },
        { id: 'y' },
      ],
      edges: [],
    });

    const flat = getFlattenedGraph(g);
    // Document order preserved: x, c1, c2, y (compound removed)
    expect(flat.nodes.map((n) => n.id)).toEqual(['x', 'c1', 'c2', 'y']);
  });

  // --- Statechart-specific scenarios ---

  it('traffic light: green→yellow→red→green with pedestrian sub-state', () => {
    // red has a compound child: red.walk (initial) → red.stop
    const g = createGraph({
      nodes: [
        { id: 'green' },
        { id: 'yellow' },
        { id: 'red', initialNodeId: 'walk' },
        { id: 'walk', parentId: 'red' },
        { id: 'stop', parentId: 'red' },
      ],
      edges: [
        { id: 'e1', sourceId: 'green', targetId: 'yellow' },
        { id: 'e2', sourceId: 'yellow', targetId: 'red' },
        { id: 'e3', sourceId: 'walk', targetId: 'stop' },
        { id: 'e4', sourceId: 'red', targetId: 'green' },
      ],
    });

    const flat = getFlattenedGraph(g);
    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort();

    expect(flat.nodes.map((n) => n.id).sort()).toEqual([
      'green', 'stop', 'walk', 'yellow',
    ]);
    // yellow→red becomes yellow→walk (initial)
    // red→green becomes walk→green AND stop→green
    expect(edges).toEqual([
      'green->yellow',
      'stop->green',
      'walk->green',
      'walk->stop',
      'yellow->walk',
    ]);
  });

  it('compound-to-compound transition', () => {
    // a(a1,a2) → b(b1,b2): from all leaves of a, to initial of b
    const g = createGraph({
      nodes: [
        { id: 'a', initialNodeId: 'a1' },
        { id: 'a1', parentId: 'a' },
        { id: 'a2', parentId: 'a' },
        { id: 'b', initialNodeId: 'b1' },
        { id: 'b1', parentId: 'b' },
        { id: 'b2', parentId: 'b' },
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a1', targetId: 'a2' },
        { id: 'e3', sourceId: 'b1', targetId: 'b2' },
      ],
    });

    const flat = getFlattenedGraph(g);
    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort();

    // a→b expands to: a1→b1, a2→b1
    expect(edges).toEqual(['a1->a2', 'a1->b1', 'a2->b1', 'b1->b2']);
  });

  it('sibling compound states with cross-transitions', () => {
    // parent has two compound children: s1(s1a,s1b) and s2(s2a,s2b)
    // s1→s2 transition
    const g = createGraph({
      nodes: [
        { id: 'start' },
        { id: 's1', initialNodeId: 's1a' },
        { id: 's1a', parentId: 's1' },
        { id: 's1b', parentId: 's1' },
        { id: 's2', initialNodeId: 's2a' },
        { id: 's2a', parentId: 's2' },
        { id: 's2b', parentId: 's2' },
        { id: 'end' },
      ],
      edges: [
        { id: 'e1', sourceId: 'start', targetId: 's1' },
        { id: 'e2', sourceId: 's1a', targetId: 's1b' },
        { id: 'e3', sourceId: 's1', targetId: 's2' },
        { id: 'e4', sourceId: 's2a', targetId: 's2b' },
        { id: 'e5', sourceId: 's2', targetId: 'end' },
      ],
    });

    const flat = getFlattenedGraph(g);
    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort();

    expect(edges).toEqual([
      's1a->s1b',
      's1a->s2a', // s1→s2: from s1a to s2a (initial)
      's1b->s2a', // s1→s2: from s1b to s2a (initial)
      's2a->end', // s2→end: from s2a
      's2a->s2b',
      's2b->end', // s2→end: from s2b
      'start->s1a', // start→s1: resolves to s1a (initial)
    ]);
  });

  it('leaf-to-compound: specific child exits to compound sibling', () => {
    // s1b (leaf) explicitly transitions to s2 (compound)
    const g = createGraph({
      nodes: [
        { id: 's1', initialNodeId: 's1a' },
        { id: 's1a', parentId: 's1' },
        { id: 's1b', parentId: 's1' },
        { id: 's2', initialNodeId: 's2a' },
        { id: 's2a', parentId: 's2' },
        { id: 's2b', parentId: 's2' },
      ],
      edges: [
        { id: 'e1', sourceId: 's1a', targetId: 's1b' },
        { id: 'e2', sourceId: 's1b', targetId: 's2' }, // leaf → compound
      ],
    });

    const flat = getFlattenedGraph(g);
    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort();

    // s1b→s2 resolves to s1b→s2a (s2's initial)
    expect(edges).toEqual(['s1a->s1b', 's1b->s2a']);
  });

  it('self-transition on compound: re-enters initial', () => {
    // b→b means exit b, re-enter b (go to initial)
    const g = createGraph({
      nodes: [
        { id: 'a' },
        { id: 'b', initialNodeId: 'b1' },
        { id: 'b1', parentId: 'b' },
        { id: 'b2', parentId: 'b' },
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b1', targetId: 'b2' },
        { id: 'e3', sourceId: 'b', targetId: 'b' }, // self-transition
      ],
    });

    const flat = getFlattenedGraph(g);
    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort();

    // b→b expands: all leaves of b → initial of b
    // b1→b1 is a self-loop, gets skipped
    // b2→b1 is the meaningful re-entry
    expect(edges).toEqual(['a->b1', 'b1->b2', 'b2->b1']);
  });

  it('multiple compound levels: grandparent transition', () => {
    // top → mid(mid1(leaf1, leaf2), mid2)
    // top→mid resolves through mid→mid1→leaf1
    // mid→done expands from leaf1, leaf2, mid2
    const g = createGraph({
      nodes: [
        { id: 'top' },
        { id: 'mid', initialNodeId: 'mid1' },
        { id: 'mid1', parentId: 'mid', initialNodeId: 'leaf1' },
        { id: 'leaf1', parentId: 'mid1' },
        { id: 'leaf2', parentId: 'mid1' },
        { id: 'mid2', parentId: 'mid' },
        { id: 'done' },
      ],
      edges: [
        { id: 'e1', sourceId: 'top', targetId: 'mid' },
        { id: 'e2', sourceId: 'leaf1', targetId: 'leaf2' },
        { id: 'e3', sourceId: 'mid', targetId: 'done' },
      ],
    });

    const flat = getFlattenedGraph(g);
    const nodeIds = flat.nodes.map((n) => n.id).sort();
    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort();

    expect(nodeIds).toEqual(['done', 'leaf1', 'leaf2', 'mid2', 'top']);
    // top→mid → top→leaf1 (mid→mid1→leaf1)
    // mid→done → leaf1→done, leaf2→done, mid2→done
    expect(edges).toEqual([
      'leaf1->done',
      'leaf1->leaf2',
      'leaf2->done',
      'mid2->done',
      'top->leaf1',
    ]);
  });

  it('flattened graph is acyclic when original statechart is acyclic', () => {
    const g = createGraph({
      nodes: [
        { id: 'idle' },
        { id: 'loading', initialNodeId: 'fetching' },
        { id: 'fetching', parentId: 'loading' },
        { id: 'parsing', parentId: 'loading' },
        { id: 'done' },
      ],
      edges: [
        { id: 'e1', sourceId: 'idle', targetId: 'loading' },
        { id: 'e2', sourceId: 'fetching', targetId: 'parsing' },
        { id: 'e3', sourceId: 'loading', targetId: 'done' },
      ],
    });

    const flat = getFlattenedGraph(g);
    expect(isAcyclic(flat)).toBe(true);

    const sorted = getTopologicalSort(flat);
    expect(sorted).not.toBeNull();
    expect(sorted!.map((n) => n.id)).toContain('idle');
    expect(sorted!.map((n) => n.id)).toContain('done');
  });

  it('flattened cyclic statechart preserves cycles', () => {
    // idle → active(on,off) → idle (cycle)
    const g = createGraph({
      nodes: [
        { id: 'idle' },
        { id: 'active', initialNodeId: 'on' },
        { id: 'on', parentId: 'active' },
        { id: 'off', parentId: 'active' },
      ],
      edges: [
        { id: 'e1', sourceId: 'idle', targetId: 'active' },
        { id: 'e2', sourceId: 'on', targetId: 'off' },
        { id: 'e3', sourceId: 'active', targetId: 'idle' },
      ],
    });

    const flat = getFlattenedGraph(g);
    expect(isAcyclic(flat)).toBe(false);

    // idle→on→idle is a cycle, on→off→idle is a cycle
    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort();
    expect(edges).toEqual([
      'idle->on',
      'off->idle',
      'on->idle',
      'on->off',
    ]);
  });

  it('connected components preserved after flattening', () => {
    // Two independent compound states
    const g = createGraph({
      nodes: [
        { id: 'a', initialNodeId: 'a1' },
        { id: 'a1', parentId: 'a' },
        { id: 'a2', parentId: 'a' },
        { id: 'b', initialNodeId: 'b1' },
        { id: 'b1', parentId: 'b' },
        { id: 'b2', parentId: 'b' },
      ],
      edges: [
        { id: 'e1', sourceId: 'a1', targetId: 'a2' },
        { id: 'e2', sourceId: 'b1', targetId: 'b2' },
      ],
    });

    const flat = getFlattenedGraph(g);
    const comps = getConnectedComponents(flat);
    expect(comps).toHaveLength(2);
  });

  it('parallel regions: two compound children with independent sub-states', () => {
    // parent has two parallel regions, each with their own sub-states
    // No cross-region edges — they remain independent after flattening
    const g = createGraph({
      nodes: [
        { id: 'start' },
        { id: 'parallel' },
        { id: 'regionA', parentId: 'parallel', initialNodeId: 'a1' },
        { id: 'a1', parentId: 'regionA' },
        { id: 'a2', parentId: 'regionA' },
        { id: 'regionB', parentId: 'parallel', initialNodeId: 'b1' },
        { id: 'b1', parentId: 'regionB' },
        { id: 'b2', parentId: 'regionB' },
        { id: 'end' },
      ],
      edges: [
        { id: 'e1', sourceId: 'start', targetId: 'parallel' },
        { id: 'e2', sourceId: 'a1', targetId: 'a2' },
        { id: 'e3', sourceId: 'b1', targetId: 'b2' },
        { id: 'e4', sourceId: 'parallel', targetId: 'end' },
      ],
    });

    const flat = getFlattenedGraph(g);
    const edges = flat.edges.map((e) => `${e.sourceId}->${e.targetId}`).sort();

    // parallel has no initialNodeId, so first child (regionA) is used
    // regionA→a1 (initial)
    // start→parallel→regionA→a1
    expect(edges).toContain('start->a1');

    // parallel→end expands from all leaves: a1, a2, b1, b2
    expect(edges).toContain('a1->end');
    expect(edges).toContain('a2->end');
    expect(edges).toContain('b1->end');
    expect(edges).toContain('b2->end');
  });
});

describe('getMappedGraph', () => {
  it('maps node and edge data while preserving structure', () => {
    const g = createGraph({
      id: 'g',
      initialNodeId: 'a',
      nodes: [
        { id: 'a', data: 1, x: 5, y: 6 },
        { id: 'b', data: 2, parentId: 'a' },
      ],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', data: 'x', weight: 3 },
      ],
      data: { name: 'meta' },
    });

    const mapped = getMappedGraph(g, {
      node: (n) => n.data * 10,
      edge: (e) => e.data.toUpperCase(),
    });

    expect(mapped.nodes.map((n) => n.data)).toEqual([10, 20]);
    expect(mapped.edges[0].data).toBe('X');
    // structure and metadata preserved
    expect(mapped.id).toBe('g');
    expect(mapped.initialNodeId).toBe('a');
    expect(mapped.nodes[0].x).toBe(5);
    expect(mapped.nodes[1].parentId).toBe('a');
    expect(mapped.edges[0].weight).toBe(3);
    expect(mapped.data).toEqual({ name: 'meta' });
    // original untouched
    expect(g.nodes[0].data).toBe(1);
    expect(g.edges[0].data).toBe('x');
  });

  it('mapping only one entity kind leaves the other unchanged', () => {
    const g = createGraph({
      nodes: [{ id: 'a', data: 1 }],
      edges: [],
    });
    const mapped = getMappedGraph(g, {});
    expect(mapped.nodes[0].data).toBe(1);
  });

  it('returning undefined clears data', () => {
    const g = createGraph({
      nodes: [{ id: 'a', data: 1 }],
      edges: [],
    });
    const mapped = getMappedGraph(g, { node: () => undefined });
    expect(mapped.nodes[0].data).toBeNull();
  });
});

describe('getFilteredGraph', () => {
  const make = () =>
    createGraph({
      id: 'g',
      initialNodeId: 'a',
      nodes: [
        { id: 'a', data: 1 },
        { id: 'b', data: 2, parentId: 'a', initialNodeId: 'a' },
        { id: 'c', data: 3, parentId: 'b' },
      ],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', weight: 1 },
        { id: 'bc', sourceId: 'b', targetId: 'c', weight: 2 },
        { id: 'ca', sourceId: 'c', targetId: 'a', weight: 3 },
      ],
    });

  it('filters nodes and drops incident edges', () => {
    const filtered = getFilteredGraph(make(), { node: (n) => n.data < 3 });
    expect(filtered.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(filtered.edges.map((e) => e.id)).toEqual(['ab']);
    expect(filtered.initialNodeId).toBe('a');
  });

  it('filters edges without touching nodes', () => {
    const filtered = getFilteredGraph(make(), { edge: (e) => e.weight! < 3 });
    expect(filtered.nodes).toHaveLength(3);
    expect(filtered.edges.map((e) => e.id)).toEqual(['ab', 'bc']);
  });

  it('combines node and edge predicates', () => {
    const filtered = getFilteredGraph(make(), {
      node: (n) => n.id !== 'c',
      edge: (e) => e.weight! > 100,
    });
    expect(filtered.nodes.map((n) => n.id)).toEqual(['a', 'b']);
    expect(filtered.edges).toEqual([]);
  });

  it('strips dangling parent/initial references and graph initialNodeId', () => {
    const filtered = getFilteredGraph(make(), { node: (n) => n.id !== 'a' });
    expect(filtered.initialNodeId).toBeNull();
    const b = filtered.nodes.find((n) => n.id === 'b')!;
    expect(b.parentId).toBeUndefined();
    expect(b.initialNodeId).toBeUndefined();
    const c = filtered.nodes.find((n) => n.id === 'c')!;
    expect(c.parentId).toBe('b');
    expect(filtered.edges.map((e) => e.id)).toEqual(['bc']);
  });

  it('no predicates returns an equivalent copy', () => {
    const g = make();
    const filtered = getFilteredGraph(g, {});
    expect(filtered.nodes).toHaveLength(3);
    expect(filtered.edges).toHaveLength(3);
  });
});

describe('transform metadata preservation', () => {
  it('getMappedGraph and getFilteredGraph keep graph direction and style', () => {
    const g = createGraph({
      nodes: [{ id: 'a', data: 1 }, { id: 'b', data: 2 }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
      direction: 'right',
      style: { stroke: 'red' },
    });

    const mapped = getMappedGraph(g, { node: (n) => n.data * 2 });
    expect(mapped.direction).toBe('right');
    expect(mapped.style).toEqual({ stroke: 'red' });

    const filtered = getFilteredGraph(g, { node: (n) => n.data < 2 });
    expect(filtered.direction).toBe('right');
    expect(filtered.style).toEqual({ stroke: 'red' });
  });
});
