import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src';
import { getColaLayout } from '../../src/layout/webcola';

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
      { id: 'loop', sourceId: 'd', targetId: 'd' }, // self-loops are skipped by the solver
    ],
  });

describe('getColaLayout', () => {
  it('is deterministic for the same seed', () => {
    const first = getColaLayout(makeGraph(), { seed: 42 });
    const second = getColaLayout(makeGraph(), { seed: 42 });
    expect(second).toEqual(first);
  });

  it('differs across seeds', () => {
    const first = getColaLayout(makeGraph(), { seed: 1 });
    const second = getColaLayout(makeGraph(), { seed: 2 });
    expect(second).not.toEqual(first);
  });

  it('positions every node finitely', () => {
    const laidOut = getColaLayout(makeGraph(), { seed: 7 });
    for (const node of laidOut.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
      expect(node.width).toBeGreaterThan(0);
      expect(node.height).toBeGreaterThan(0);
    }
  });

  it('avoids overlaps in a small dense graph', () => {
    const ids = ['a', 'b', 'c', 'd', 'e', 'f'];
    const g = createGraph({
      nodes: ids.map((id) => ({ id, width: 80, height: 40 })),
      // dense: every pair linked with a short ideal distance
      edges: ids.flatMap((s, i) =>
        ids.slice(i + 1).map((t) => ({
          id: `${s}-${t}`,
          sourceId: s,
          targetId: t,
        })),
      ),
    });
    const laidOut = getColaLayout(g, { seed: 5, linkDistance: 10 });
    for (let i = 0; i < laidOut.nodes.length; i++) {
      for (let j = i + 1; j < laidOut.nodes.length; j++) {
        const a = laidOut.nodes[i];
        const b = laidOut.nodes[j];
        const overlapX =
          a.x < b.x + b.width - 1e-6 && b.x < a.x + a.width - 1e-6;
        const overlapY =
          a.y < b.y + b.height - 1e-6 && b.y < a.y + a.height - 1e-6;
        expect(overlapX && overlapY).toBe(false);
      }
    }
  });

  it('pins fixed nodes at their current position (within tolerance)', () => {
    const g = createGraph({
      nodes: [
        { id: 'pinned', x: 100, y: 200, width: 10, height: 10 },
        { id: 'free' },
      ],
      edges: [{ id: 'e', sourceId: 'pinned', targetId: 'free' }],
    });
    const laidOut = getColaLayout(g, {
      seed: 3,
      isFixed: (node) => node.id === 'pinned',
    });
    const pinned = laidOut.nodes.find((n) => n.id === 'pinned')!;
    const free = laidOut.nodes.find((n) => n.id === 'free')!;
    // cola locks fixed nodes in the descent but uses a large finite weight
    // during overlap projection — pinning is near-exact, not bit-exact
    expect(pinned.x).toBeCloseTo(100, 1);
    expect(pinned.y).toBeCloseTo(200, 1);
    expect(free.x).not.toBeCloseTo(100, 1);
  });

  it("flowLayout separates source above target for direction 'down'", () => {
    const g = createGraph({
      nodes: [{ id: 'top' }, { id: 'mid' }, { id: 'bottom' }],
      edges: [
        { id: 'e1', sourceId: 'top', targetId: 'mid' },
        { id: 'e2', sourceId: 'mid', targetId: 'bottom' },
      ],
    });
    const laidOut = getColaLayout(g, {
      seed: 9,
      direction: 'down',
      spacing: { layer: 40 },
    });
    const centerY = (id: string) => {
      const node = laidOut.nodes.find((n) => n.id === id)!;
      return node.y + node.height / 2;
    };
    expect(centerY('mid') - centerY('top')).toBeGreaterThanOrEqual(40 - 1e-6);
    expect(centerY('bottom') - centerY('mid')).toBeGreaterThanOrEqual(
      40 - 1e-6,
    );
  });

  it('preserves non-geometry fields', () => {
    const laidOut = getColaLayout(makeGraph(), { seed: 42 });
    expect(laidOut.nodes[0].data).toEqual({ n: 1 });
    expect(laidOut.edges[0].weight).toBe(2);
    expect(laidOut.edges).toHaveLength(4);
  });
});
