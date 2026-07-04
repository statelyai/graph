import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import {
  createCompleteGraph,
  createGridGraph,
  createRandomGraph,
} from '../src/generators';
import { isPlanar } from '../src/algorithms/planarity';

/** Complete bipartite graph K_{m,n} with undirected edges. */
function completeBipartite(m: number, n: number): ReturnType<typeof createGraph> {
  const nodes: Array<{ id: string }> = [];
  for (let i = 0; i < m; i++) nodes.push({ id: `l${i}` });
  for (let j = 0; j < n; j++) nodes.push({ id: `r${j}` });
  const edges: Array<{ id: string; sourceId: string; targetId: string }> = [];
  let e = 0;
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      edges.push({ id: `e${e++}`, sourceId: `l${i}`, targetId: `r${j}` });
    }
  }
  return createGraph({ mode: 'undirected', nodes, edges });
}

/** The Petersen graph: outer 5-cycle, inner pentagram, matching spokes. */
function petersen(): ReturnType<typeof createGraph> {
  const nodes = Array.from({ length: 10 }, (_, i) => ({ id: `n${i}` }));
  const edges: Array<{ id: string; sourceId: string; targetId: string }> = [];
  let e = 0;
  const add = (a: number, b: number) =>
    edges.push({ id: `e${e++}`, sourceId: `n${a}`, targetId: `n${b}` });
  // Outer 5-cycle 0-1-2-3-4-0
  for (let i = 0; i < 5; i++) add(i, (i + 1) % 5);
  // Spokes i - (i+5)
  for (let i = 0; i < 5; i++) add(i, i + 5);
  // Inner pentagram 5-7-9-6-8-5 (step of 2)
  for (let i = 0; i < 5; i++) add(5 + i, 5 + ((i + 2) % 5));
  return createGraph({ mode: 'undirected', nodes, edges });
}

/** Random spanning tree on n nodes (always planar). */
function randomTree(n: number, seed: number): ReturnType<typeof createGraph> {
  let s = seed;
  const rand = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  const nodes = Array.from({ length: n }, (_, i) => ({ id: `n${i}` }));
  const edges: Array<{ id: string; sourceId: string; targetId: string }> = [];
  for (let i = 1; i < n; i++) {
    const parent = Math.floor(rand() * i);
    edges.push({ id: `e${i}`, sourceId: `n${parent}`, targetId: `n${i}` });
  }
  return createGraph({ mode: 'undirected', nodes, edges });
}

describe('isPlanar', () => {
  it('empty graph is planar', () => {
    expect(isPlanar(createGraph({ mode: 'undirected' }))).toBe(true);
  });

  it('single node is planar', () => {
    expect(
      isPlanar(createGraph({ mode: 'undirected', nodes: [{ id: 'a' }] })),
    ).toBe(true);
  });

  it('K4 is planar', () => {
    expect(isPlanar(createCompleteGraph(4))).toBe(true);
  });

  it('K5 is NOT planar', () => {
    expect(isPlanar(createCompleteGraph(5))).toBe(false);
  });

  it('K3,3 is NOT planar', () => {
    expect(isPlanar(completeBipartite(3, 3))).toBe(false);
  });

  it('K3,3 minus an edge is planar', () => {
    const g = completeBipartite(3, 3);
    // Drop one edge (l0-r0).
    const trimmed = createGraph({
      mode: 'undirected',
      nodes: g.nodes.map((n) => ({ id: n.id })),
      edges: g.edges
        .filter((e) => !(e.sourceId === 'l0' && e.targetId === 'r0'))
        .map((e) => ({
          id: e.id,
          sourceId: e.sourceId,
          targetId: e.targetId,
        })),
    });
    expect(isPlanar(trimmed)).toBe(true);
  });

  it('grid graphs are planar', () => {
    expect(isPlanar(createGridGraph(4, 4))).toBe(true);
    expect(isPlanar(createGridGraph(5, 7))).toBe(true);
  });

  it('a large 30x30 grid is planar (no stack overflow)', () => {
    expect(isPlanar(createGridGraph(30, 30))).toBe(true);
  });

  it('the Petersen graph is NOT planar', () => {
    expect(isPlanar(petersen())).toBe(false);
  });

  it('a random tree is planar', () => {
    expect(isPlanar(randomTree(50, 12345))).toBe(true);
  });

  it('disconnected planar components stay planar', () => {
    // Two K4s side by side.
    const g = createGraph({
      mode: 'undirected',
      nodes: [
        ...['a0', 'a1', 'a2', 'a3'].map((id) => ({ id })),
        ...['b0', 'b1', 'b2', 'b3'].map((id) => ({ id })),
      ],
      edges: (() => {
        const es: Array<{ id: string; sourceId: string; targetId: string }> =
          [];
        let e = 0;
        for (const p of ['a', 'b']) {
          for (let i = 0; i < 4; i++)
            for (let j = i + 1; j < 4; j++)
              es.push({
                id: `e${e++}`,
                sourceId: `${p}${i}`,
                targetId: `${p}${j}`,
              });
        }
        return es;
      })(),
    });
    expect(isPlanar(g)).toBe(true);
  });

  it('a disconnected graph with one non-planar component is NOT planar', () => {
    // A planar triangle component + a K5 component.
    const k5 = createCompleteGraph(5, { idPrefix: 'k' });
    const g = createGraph({
      mode: 'undirected',
      nodes: [
        { id: 'x' },
        { id: 'y' },
        { id: 'z' },
        ...k5.nodes.map((n) => ({ id: n.id })),
      ],
      edges: [
        { id: 't1', sourceId: 'x', targetId: 'y' },
        { id: 't2', sourceId: 'y', targetId: 'z' },
        { id: 't3', sourceId: 'z', targetId: 'x' },
        ...k5.edges.map((e) => ({
          id: e.id,
          sourceId: e.sourceId,
          targetId: e.targetId,
        })),
      ],
    });
    expect(isPlanar(g)).toBe(false);
  });

  it('K5 plus isolated nodes is NOT planar', () => {
    const k5 = createCompleteGraph(5);
    const g = createGraph({
      mode: 'undirected',
      nodes: [...k5.nodes.map((n) => ({ id: n.id })), { id: 'iso1' }, { id: 'iso2' }],
      edges: k5.edges.map((e) => ({
        id: e.id,
        sourceId: e.sourceId,
        targetId: e.targetId,
      })),
    });
    expect(isPlanar(g)).toBe(false);
  });

  it('self-loops and multi-edges do not affect planarity', () => {
    // K4 with a self-loop and a doubled edge is still planar.
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
        { id: 'e3', sourceId: 'a', targetId: 'd' },
        { id: 'e4', sourceId: 'b', targetId: 'c' },
        { id: 'e5', sourceId: 'b', targetId: 'd' },
        { id: 'e6', sourceId: 'c', targetId: 'd' },
        { id: 'loop', sourceId: 'a', targetId: 'a' },
        { id: 'dup', sourceId: 'a', targetId: 'b' },
      ],
    });
    expect(isPlanar(g)).toBe(true);
  });

  it('a sparse random graph is planar or not without throwing', () => {
    // Smoke test: must return a boolean and not crash.
    const g = createRandomGraph(20, 0.1, { seed: 7 });
    expect(typeof isPlanar(g)).toBe('boolean');
  });
});
