import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src/graph';
import { getEdgeMode } from '../../src/mode';
import { toGraphML, fromGraphML } from '../../src/formats/graphml';
import { toGEXF, fromGEXF } from '../../src/formats/gexf';
import type { Graph } from '../../src/types';

/** Directed graph whose individual edges override the default in every way. */
function mixedGraph(): Graph {
  return createGraph({
    mode: 'directed',
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b' }, // inherits directed
      { id: 'e2', sourceId: 'b', targetId: 'c', mode: 'undirected' }, // override
      { id: 'e3', sourceId: 'c', targetId: 'd', mode: 'bidirectional' }, // → directed
    ],
  });
}

/** Undirected graph with a directed override. */
function undirectedDefaultGraph(): Graph {
  return createGraph({
    mode: 'undirected',
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b' }, // inherits undirected
      { id: 'e2', sourceId: 'b', targetId: 'c', mode: 'directed' }, // override
    ],
  });
}

describe.each([
  ['GraphML', (g: Graph) => fromGraphML(toGraphML(g)), 'directed="false"'],
  ['GEXF', (g: Graph) => fromGEXF(toGEXF(g)), 'type="undirected"'],
] as const)('%s per-edge directedness', (_name, roundTrip) => {
  it('round-trips a directed graph with per-edge overrides', () => {
    const g = mixedGraph();
    const out = roundTrip(g);
    expect(out.mode).toBe('directed');

    const e1 = out.edges.find((e) => e.id === 'e1')!;
    const e2 = out.edges.find((e) => e.id === 'e2')!;
    const e3 = out.edges.find((e) => e.id === 'e3')!;

    // Directed edge inherits the graph default (no override emitted).
    expect(getEdgeMode(out, e1)).toBe('directed');
    // Undirected override survives.
    expect(getEdgeMode(out, e2)).toBe('undirected');
    expect(e2.mode).toBe('undirected');
    // Bidirectional has no native representation → collapses to directed.
    expect(getEdgeMode(out, e3)).toBe('directed');
  });

  it('round-trips an undirected graph with a directed override', () => {
    const g = undirectedDefaultGraph();
    const out = roundTrip(g);
    expect(out.mode).toBe('undirected');

    const e1 = out.edges.find((e) => e.id === 'e1')!;
    const e2 = out.edges.find((e) => e.id === 'e2')!;
    expect(getEdgeMode(out, e1)).toBe('undirected');
    expect(getEdgeMode(out, e2)).toBe('directed');
    expect(e2.mode).toBe('directed');
  });
});

describe('per-edge directedness wire format', () => {
  it('GraphML only emits the directed attribute on overriding edges', () => {
    const xml = toGraphML(mixedGraph());
    // e2 (undirected override) carries directed="false"
    expect(xml).toMatch(/id="e2"[^>]*directed="false"/);
    // e1 (inherits) does not carry the attribute
    expect(xml).not.toMatch(/id="e1"[^>]*directed=/);
  });

  it('GEXF only emits the type attribute on overriding edges', () => {
    const xml = toGEXF(mixedGraph());
    expect(xml).toMatch(/id="e2"[^>]*type="undirected"/);
    expect(xml).not.toMatch(/id="e1"[^>]*type=/);
  });
});
