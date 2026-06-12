import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src';
import { getForceAtlas2Layout } from '../../src/layout/forceatlas2';

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

describe('getForceAtlas2Layout', () => {
  it('is deterministic for the same seed', () => {
    const first = getForceAtlas2Layout(makeGraph(), { seed: 42 });
    const second = getForceAtlas2Layout(makeGraph(), { seed: 42 });
    expect(second).toEqual(first);
  });

  it('differs across seeds', () => {
    const first = getForceAtlas2Layout(makeGraph(), { seed: 1 });
    const second = getForceAtlas2Layout(makeGraph(), { seed: 2 });
    expect(second).not.toEqual(first);
  });

  it('gives every node finite positions and sizes', () => {
    const laidOut = getForceAtlas2Layout(makeGraph(), { seed: 7 });
    expect(laidOut.nodes).toHaveLength(4);
    for (const node of laidOut.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
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
    const laidOut = getForceAtlas2Layout(g, {
      seed: 3,
      isFixed: (node) => node.id === 'pinned',
    });
    const pinned = laidOut.nodes.find((n) => n.id === 'pinned')!;
    expect(pinned.x).toBeCloseTo(100, 6);
    expect(pinned.y).toBeCloseTo(200, 6);
  });

  it('keeps connected nodes reasonably near each other', () => {
    const laidOut = getForceAtlas2Layout(makeGraph(), {
      seed: 11,
      iterations: 200,
    });
    const center = (id: string) => {
      const node = laidOut.nodes.find((n) => n.id === id)!;
      return { x: node.x + node.width / 2, y: node.y + node.height / 2 };
    };
    const a = center('a');
    const b = center('b');
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    expect(distance).toBeGreaterThan(0);
    expect(distance).toBeLessThan(2000); // generous sanity bound
  });

  it('preserves non-geometry fields', () => {
    const laidOut = getForceAtlas2Layout(makeGraph(), { seed: 42 });
    expect(laidOut.nodes[0].data).toEqual({ n: 1 });
    expect(laidOut.edges[0].weight).toBe(2);
    expect(laidOut.edges).toHaveLength(4);
  });
});
