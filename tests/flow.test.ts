import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import { getMaxFlow, getMinCut } from '../src/algorithms';

// Classic CLRS network (Introduction to Algorithms, Fig. 26.1).
// Known answer: max flow s→t = 23; min cut = ({s,v1,v2,v4},{v3,t})
// with cut edges v1→v3 (12), v4→v3 (7), v4→t (4): 12 + 7 + 4 = 23.
function makeClrsNetwork() {
  return createGraph({
    nodes: ['s', 'v1', 'v2', 'v3', 'v4', 't'].map((id) => ({ id })),
    edges: [
      { id: 'sv1', sourceId: 's', targetId: 'v1', weight: 16 },
      { id: 'sv2', sourceId: 's', targetId: 'v2', weight: 13 },
      { id: 'v2v1', sourceId: 'v2', targetId: 'v1', weight: 4 },
      { id: 'v1v3', sourceId: 'v1', targetId: 'v3', weight: 12 },
      { id: 'v3v2', sourceId: 'v3', targetId: 'v2', weight: 9 },
      { id: 'v2v4', sourceId: 'v2', targetId: 'v4', weight: 14 },
      { id: 'v4v3', sourceId: 'v4', targetId: 'v3', weight: 7 },
      { id: 'v3t', sourceId: 'v3', targetId: 't', weight: 20 },
      { id: 'v4t', sourceId: 'v4', targetId: 't', weight: 4 },
    ],
  });
}

describe('getMaxFlow', () => {
  it('computes the known max flow of the CLRS network', () => {
    const graph = makeClrsNetwork();
    const { value, flows } = getMaxFlow(graph, { from: 's', to: 't' });

    expect(value).toBe(23);
    // Flow conservation at the sink: everything arrives via v3→t and v4→t.
    expect(flows.v3t + flows.v4t).toBe(23);
    // Flow conservation at the source.
    expect(flows.sv1 + flows.sv2).toBe(23);
    // Capacity constraints.
    for (const edge of graph.edges) {
      expect(Math.abs(flows[edge.id])).toBeLessThanOrEqual(edge.weight!);
    }
  });

  it('returns the min cut whose capacity equals the flow value', () => {
    const graph = makeClrsNetwork();
    const { value, cutEdges } = getMaxFlow(graph, { from: 's', to: 't' });

    expect(cutEdges.map((edge) => edge.id).sort()).toEqual([
      'v1v3',
      'v4t',
      'v4v3',
    ]);
    const cutCapacity = cutEdges.reduce(
      (sum, edge) => sum + (edge.weight ?? 1),
      0,
    );
    expect(cutCapacity).toBe(value);
  });

  it('returns value 0 and an empty cut when from cannot reach to', () => {
    const graph = createGraph({
      nodes: [{ id: 's' }, { id: 't' }, { id: 'x' }],
      edges: [{ id: 'xt', sourceId: 'x', targetId: 't', weight: 5 }],
    });

    const { value, flows, cutEdges } = getMaxFlow(graph, {
      from: 's',
      to: 't',
    });
    expect(value).toBe(0);
    expect(cutEdges).toEqual([]);
    expect(flows).toEqual({ xt: 0 });
  });

  it('carries capacity both ways across non-directed edges', () => {
    // Edge e1 is declared a→s but undirected, so s→a flow is allowed.
    // Known answer: bottleneck is e1's capacity 4; net flow on e1 is -4
    // because the flow runs target→source.
    const graph = createGraph({
      nodes: [{ id: 's' }, { id: 'a' }, { id: 't' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 's', weight: 4, mode: 'undirected' },
        { id: 'e2', sourceId: 'a', targetId: 't', weight: 10 },
      ],
    });

    const { value, flows, cutEdges } = getMaxFlow(graph, {
      from: 's',
      to: 't',
    });
    expect(value).toBe(4);
    expect(flows.e1).toBe(-4);
    expect(flows.e2).toBe(4);
    expect(cutEdges.map((edge) => edge.id)).toEqual(['e1']);
  });

  it('handles fully undirected graphs', () => {
    // s-a (4), a-t (7): max flow 4, cut is the s-a edge.
    const graph = createGraph({
      mode: 'undirected',
      nodes: [{ id: 's' }, { id: 'a' }, { id: 't' }],
      edges: [
        { id: 'sa', sourceId: 's', targetId: 'a', weight: 4 },
        { id: 'at', sourceId: 'a', targetId: 't', weight: 7 },
      ],
    });

    const { value, cutEdges } = getMaxFlow(graph, { from: 's', to: 't' });
    expect(value).toBe(4);
    expect(cutEdges.map((edge) => edge.id)).toEqual(['sa']);
  });

  it('sums capacities across parallel edges', () => {
    const graph = createGraph({
      nodes: [{ id: 's' }, { id: 't' }],
      edges: [
        { id: 'p1', sourceId: 's', targetId: 't', weight: 3 },
        { id: 'p2', sourceId: 's', targetId: 't', weight: 5 },
      ],
    });

    const { value, flows, cutEdges } = getMaxFlow(graph, {
      from: 's',
      to: 't',
    });
    expect(value).toBe(8);
    expect(flows).toEqual({ p1: 3, p2: 5 });
    expect(cutEdges.map((edge) => edge.id).sort()).toEqual(['p1', 'p2']);
  });

  it('supports a custom getCapacity accessor', () => {
    const graph = createGraph<any, { cap: number }>({
      nodes: [{ id: 's' }, { id: 't' }],
      edges: [{ id: 'st', sourceId: 's', targetId: 't', data: { cap: 9 } }],
    });

    const { value } = getMaxFlow(graph, {
      from: 's',
      to: 't',
      getCapacity: (edge) => edge.data.cap,
    });
    expect(value).toBe(9);
  });

  it('throws when the source node is missing', () => {
    const graph = createGraph({ nodes: [{ id: 't' }] });
    expect(() => getMaxFlow(graph, { from: 'nope', to: 't' })).toThrow(
      /source node "nope" not found/,
    );
  });

  it('throws when the sink node is missing', () => {
    const graph = createGraph({ nodes: [{ id: 's' }] });
    expect(() => getMaxFlow(graph, { from: 's', to: 'nope' })).toThrow(
      /sink node "nope" not found/,
    );
  });

  it('throws when source and sink are the same node', () => {
    const graph = createGraph({ nodes: [{ id: 's' }] });
    expect(() => getMaxFlow(graph, { from: 's', to: 's' })).toThrow(
      /must be different nodes/,
    );
  });

  it('throws on negative capacity, naming the edge and value', () => {
    const graph = createGraph({
      nodes: [{ id: 's' }, { id: 't' }],
      edges: [{ id: 'bad', sourceId: 's', targetId: 't', weight: -2 }],
    });

    expect(() => getMaxFlow(graph, { from: 's', to: 't' })).toThrow(
      /edge "bad" has negative capacity -2/,
    );
  });
});

describe('getMinCut', () => {
  it('returns the known min cut of the CLRS network', () => {
    const graph = makeClrsNetwork();
    const { value, cutEdges, partition } = getMinCut(graph, {
      source: 's',
      sink: 't',
    });

    // Hand-verified (CLRS Fig. 26.1): cut ({s,v1,v2,v4},{v3,t}) of capacity
    // 12 + 7 + 4 = 23.
    expect(value).toBe(23);
    expect([...cutEdges].sort()).toEqual(['v1v3', 'v4t', 'v4v3']);
    expect(partition.source).toEqual(['s', 'v1', 'v2', 'v4']);
    expect(partition.sink).toEqual(['v3', 't']);
  });

  it('matches the max-flow value and the cut capacity', () => {
    const graph = makeClrsNetwork();
    const cut = getMinCut(graph, { source: 's', sink: 't' });
    const flow = getMaxFlow(graph, { from: 's', to: 't' });

    expect(cut.value).toBe(flow.value);
    const cutCapacity = cut.cutEdges.reduce(
      (sum, edgeId) =>
        sum + (graph.edges.find((edge) => edge.id === edgeId)!.weight ?? 1),
      0,
    );
    expect(cutCapacity).toBe(cut.value);
  });

  it('partitions every node exactly once', () => {
    const graph = makeClrsNetwork();
    const { partition } = getMinCut(graph, { source: 's', sink: 't' });

    expect(
      [...partition.source, ...partition.sink].sort(),
    ).toEqual(graph.nodes.map((node) => node.id).sort());
  });

  it('returns an empty cut when source cannot reach sink', () => {
    const graph = createGraph({
      nodes: [{ id: 's' }, { id: 't' }, { id: 'x' }],
      edges: [{ id: 'xt', sourceId: 'x', targetId: 't', weight: 5 }],
    });

    const { value, cutEdges, partition } = getMinCut(graph, {
      source: 's',
      sink: 't',
    });
    expect(value).toBe(0);
    expect(cutEdges).toEqual([]);
    expect(partition.source).toEqual(['s']);
    expect(partition.sink).toEqual(['t', 'x']);
  });

  it('supports a custom getCapacity accessor', () => {
    const graph = createGraph<any, { cap: number }>({
      nodes: [{ id: 's' }, { id: 't' }],
      edges: [{ id: 'st', sourceId: 's', targetId: 't', data: { cap: 9 } }],
    });

    const { value, cutEdges } = getMinCut(graph, {
      source: 's',
      sink: 't',
      getCapacity: (edge) => edge.data.cap,
    });
    expect(value).toBe(9);
    expect(cutEdges).toEqual(['st']);
  });

  it('throws with getMinCut-specific messages on invalid options', () => {
    const graph = createGraph({ nodes: [{ id: 's' }, { id: 't' }] });

    expect(() => getMinCut(graph, { source: 'nope', sink: 't' })).toThrow(
      /getMinCut: source node "nope" not found in graph — pass an existing node id as options\.source/,
    );
    expect(() => getMinCut(graph, { source: 's', sink: 'nope' })).toThrow(
      /getMinCut: sink node "nope" not found .* options\.sink/,
    );
    expect(() => getMinCut(graph, { source: 's', sink: 's' })).toThrow(
      /must be different nodes/,
    );
  });
});
