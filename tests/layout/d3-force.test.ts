import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src';
import { applyLayoutFrame } from '../../src/layout';
import { genForceLayout, getForceLayout } from '../../src/layout/d3-force';

const makeGraph = () =>
  createGraph({
    nodes: [
      { id: 'a', data: { n: 1 } },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
    ],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b', weight: 2 },
      { id: 'e2', sourceId: 'b', targetId: 'c' },
      { id: 'e3', sourceId: 'c', targetId: 'a' },
      { id: 'loop', sourceId: 'd', targetId: 'd' }, // self-loops are skipped by forces
    ],
  });

describe('genForceLayout / getForceLayout', () => {
  it('is deterministic for the same seed', () => {
    const first = getForceLayout(makeGraph(), { seed: 42 });
    const second = getForceLayout(makeGraph(), { seed: 42 });
    expect(second).toEqual(first);
  });

  it('differs across seeds', () => {
    const first = getForceLayout(makeGraph(), { seed: 1 });
    const second = getForceLayout(makeGraph(), { seed: 2 });
    expect(second).not.toEqual(first);
  });

  it('yields frames with cooling alpha and applies via applyLayoutFrame', () => {
    const g = makeGraph();
    const alphas: number[] = [];
    let frames = 0;
    for (const frame of genForceLayout(g, { seed: 7, iterations: 50 })) {
      alphas.push(frame.alpha);
      applyLayoutFrame(g, frame);
      frames++;
    }
    expect(frames).toBe(50);
    expect(alphas.at(-1)!).toBeLessThan(alphas[0]);
    // last frame's positions are on the graph
    for (const node of g.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
  });

  it('pins fixed nodes at their current position', () => {
    const g = createGraph({
      nodes: [
        { id: 'pinned', x: 100, y: 200, width: 10, height: 10 },
        { id: 'free' },
      ],
      edges: [{ id: 'e', sourceId: 'pinned', targetId: 'free' }],
    });
    const laidOut = getForceLayout(g, {
      seed: 3,
      isFixed: (node) => node.id === 'pinned',
    });
    const pinned = laidOut.nodes.find((n) => n.id === 'pinned')!;
    expect(pinned.x).toBeCloseTo(100, 6);
    expect(pinned.y).toBeCloseTo(200, 6);
  });

  it('separates connected nodes to roughly the link distance', () => {
    const laidOut = getForceLayout(makeGraph(), {
      seed: 11,
      linkDistance: 120,
    });
    const center = (id: string) => {
      const node = laidOut.nodes.find((n) => n.id === id)!;
      return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    };
    const a = center('a');
    const b = center('b');
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    expect(distance).toBeGreaterThan(20);
    expect(distance).toBeLessThan(600);
  });

  it('preserves non-geometry fields in the settled graph', () => {
    const laidOut = getForceLayout(makeGraph(), { seed: 42 });
    expect(laidOut.nodes[0].data).toEqual({ n: 1 });
    expect(laidOut.edges[0].weight).toBe(2);
    expect(laidOut.edges).toHaveLength(4);
  });
});
