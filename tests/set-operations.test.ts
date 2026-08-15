import { describe, expect, it } from 'vitest';
import {
  createGraph,
  getDisjointUnion,
  getGraphComplement,
  getGraphDifference,
  getGraphIntersection,
  getGraphSymmetricDifference,
  getGraphUnion,
  getNeighborhood,
} from '../src';

function makePair() {
  const left = createGraph({
    id: 'left',
    mode: 'directed',
    initialNodeId: 'a',
    data: { owner: 'left' },
    nodes: [
      { id: 'a', data: 'left-a' },
      { id: 'b', data: 'left-b' },
      { id: 'left-only' },
    ],
    edges: [
      { id: 'shared', sourceId: 'a', targetId: 'b', data: 'left' },
      { id: 'left-edge', sourceId: 'b', targetId: 'left-only' },
    ],
  });
  const right = createGraph({
    id: 'right',
    mode: 'directed',
    data: { owner: 'right' },
    nodes: [
      { id: 'a', data: 'right-a' },
      { id: 'b', data: 'right-b' },
      { id: 'right-only' },
    ],
    edges: [
      { id: 'shared', sourceId: 'a', targetId: 'b', data: 'right' },
      { id: 'right-edge', sourceId: 'b', targetId: 'right-only' },
    ],
  });
  return { left, right };
}

describe('graph set operations', () => {
  it('unions by ID with right-biased entities and left metadata', () => {
    const { left, right } = makePair();
    const result = getGraphUnion(left, right);

    expect(result.id).toBe('left');
    expect(result.data).toEqual({ owner: 'left' });
    expect(result.nodes.map((node) => node.id)).toEqual([
      'a',
      'b',
      'left-only',
      'right-only',
    ]);
    expect(result.nodes[0].data).toBe('right-a');
    expect(result.edges.map((edge) => edge.id)).toEqual([
      'shared',
      'left-edge',
      'right-edge',
    ]);
    expect(result.edges[0].data).toBe('right');
  });

  it('intersects nodes and edges by ID using right entities', () => {
    const { left, right } = makePair();
    const result = getGraphIntersection(left, right);

    expect(result.nodes.map((node) => node.id)).toEqual(['a', 'b']);
    expect(result.nodes.map((node) => node.data)).toEqual([
      'right-a',
      'right-b',
    ]);
    expect(result.edges.map((edge) => edge.id)).toEqual(['shared']);
    expect(result.edges[0].data).toBe('right');
  });

  it('subtracts and symmetric-differences edge IDs while preserving nodes', () => {
    const { left, right } = makePair();
    expect(getGraphDifference(left, right).edges.map((edge) => edge.id)).toEqual([
      'left-edge',
    ]);
    expect(
      getGraphSymmetricDifference(left, right).edges.map((edge) => edge.id),
    ).toEqual(['left-edge', 'right-edge']);
  });

  it('creates a disjoint union and rewrites right hierarchy and endpoints', () => {
    const left = createGraph({
      nodes: [{ id: 'parent' }, { id: 'child', parentId: 'parent' }],
      edges: [{ id: 'edge', sourceId: 'parent', targetId: 'child' }],
    });
    const right = createGraph({
      nodes: [
        { id: 'parent', initialNodeId: 'child' },
        { id: 'child', parentId: 'parent' },
      ],
      edges: [{ id: 'edge', sourceId: 'parent', targetId: 'child' }],
    });

    const result = getDisjointUnion(left, right);
    expect(result.nodes.map((node) => node.id)).toEqual([
      'parent',
      'child',
      'parent#2',
      'child#2',
    ]);
    expect(result.nodes[2].initialNodeId).toBe('child#2');
    expect(result.nodes[3].parentId).toBe('parent#2');
    expect(result.edges[1]).toMatchObject({
      id: 'edge#2',
      sourceId: 'parent#2',
      targetId: 'child#2',
    });
  });

  it('supports custom disjoint-union remappers and rejects collisions', () => {
    const graph = createGraph({ nodes: [{ id: 'a' }] });
    expect(
      getDisjointUnion(graph, graph, {
        getRightNodeId: (id) => `right:${id}`,
      }).nodes.map((node) => node.id),
    ).toEqual(['a', 'right:a']);
    expect(() =>
      getDisjointUnion(graph, graph, { getRightNodeId: (id) => id }),
    ).toThrow(/not unique/);
  });

  it('preserves non-conflicting right IDs when generating collision suffixes', () => {
    const left = createGraph({ nodes: [{ id: 'a' }] });
    const right = createGraph({ nodes: [{ id: 'a' }, { id: 'a#2' }] });
    expect(getDisjointUnion(left, right).nodes.map((node) => node.id)).toEqual([
      'a',
      'a#3',
      'a#2',
    ]);
  });

  it('creates directed and undirected complements without self-loops', () => {
    const directed = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
    });
    expect(
      getGraphComplement(directed).edges.map(
        (edge) => `${edge.sourceId}->${edge.targetId}`,
      ),
    ).toEqual(['a->c', 'b->a', 'b->c', 'c->a', 'c->b']);

    const undirected = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'ab', sourceId: 'a', targetId: 'b' }],
    });
    expect(
      getGraphComplement(undirected).edges.map(
        (edge) => `${edge.sourceId}-${edge.targetId}`,
      ),
    ).toEqual(['a-c', 'b-c']);
  });

  it('honors non-directed edge overrides and custom complement edges', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'ab', sourceId: 'a', targetId: 'b', mode: 'undirected' },
      ],
    });
    expect(getGraphComplement(graph).edges).toEqual([]);

    const empty = createGraph({ nodes: [{ id: 'a' }, { id: 'b' }] });
    const complement = getGraphComplement(empty, {
      createEdge: (source, target, index) => ({
        id: `missing-${index}`,
        label: `${source.id}-${target.id}`,
        data: index,
      }),
    });
    expect(complement.edges[0]).toMatchObject({
      id: 'missing-0',
      label: 'a-b',
      data: 0,
    });

    const defaultId = getGraphComplement(empty, {
      createEdge: () => ({ id: undefined }),
    });
    expect(defaultId.edges[0].id).toBe('complement:["a","b"]');
  });

  it('treats reverse directed overrides as existing non-directed pairs', () => {
    for (const mode of ['undirected', 'bidirectional'] as const) {
      const graph = createGraph({
        mode,
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [
          { id: 'ba', sourceId: 'b', targetId: 'a', mode: 'directed' },
        ],
      });
      expect(getGraphComplement(graph).edges).toEqual([]);
    }
  });

  it('rejects binary operations on different graph modes', () => {
    const directed = createGraph({ mode: 'directed' });
    const undirected = createGraph({ mode: 'undirected' });
    expect(() => getGraphUnion(directed, undirected)).toThrow(/modes/);
  });
});

describe('getNeighborhood', () => {
  const graph = createGraph({
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'bc', sourceId: 'b', targetId: 'c' },
      { id: 'ac', sourceId: 'a', targetId: 'c' },
      { id: 'dc', sourceId: 'd', targetId: 'c' },
    ],
  });

  it('returns an induced radius-one outgoing neighborhood by default', () => {
    const result = getNeighborhood(graph, 'b');
    expect(result.nodes.map((node) => node.id)).toEqual(['b', 'c']);
    expect(result.edges.map((edge) => edge.id)).toEqual(['bc']);
  });

  it('supports incoming direction, multiple centers, and radius zero', () => {
    expect(
      getNeighborhood(graph, 'c', { direction: 'incoming', radius: 1 }).nodes.map(
        (node) => node.id,
      ),
    ).toEqual(['a', 'b', 'c', 'd']);
    const centers = getNeighborhood(graph, ['a', 'd'], { radius: 0 });
    expect(centers.nodes.map((node) => node.id)).toEqual(['a', 'd']);
    expect(centers.edges).toEqual([]);
  });
});
