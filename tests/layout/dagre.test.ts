import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src';
import { getDagreLayout } from '../../src/layout/dagre';

const makeGraph = () =>
  createGraph({
    nodes: [{ id: 'a', data: { n: 1 } }, { id: 'b' }, { id: 'c' }],
    edges: [
      {
        id: 'e1',
        sourceId: 'a',
        targetId: 'b',
        label: 'go',
        width: 40,
        height: 14,
        weight: 3,
      },
      { id: 'e2', sourceId: 'b', targetId: 'c' },
    ],
  });

describe('getDagreLayout', () => {
  it('positions ranks along the requested direction', () => {
    const down = getDagreLayout(makeGraph(), {
      measure: () => ({ width: 60, height: 30 }),
    });
    const [a, b, c] = down.nodes;
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);

    const right = getDagreLayout(makeGraph(), { direction: 'right' });
    const [ra, rb, rc] = right.nodes;
    expect(rb.x).toBeGreaterThan(ra.x);
    expect(rc.x).toBeGreaterThan(rb.x);
  });

  it('produces polyline edge points', () => {
    const laidOut = getDagreLayout(makeGraph());
    for (const edge of laidOut.edges) {
      expect(edge.points).toBeDefined();
      expect(edge.points!.length).toBeGreaterThanOrEqual(2);
      expect(edge.routing).toBe('polyline');
    }
  });

  it('returns the edge label rect as top-left on edge x/y', () => {
    const laidOut = getDagreLayout(makeGraph());
    const labeled = laidOut.edges.find((e) => e.id === 'e1')!;
    expect(labeled.width).toBe(40);
    expect(labeled.height).toBe(14);
    // Label sits between the two nodes it connects (top-left converted)
    const [a, b] = laidOut.nodes;
    expect(labeled.y + labeled.height / 2).toBeGreaterThan(a.y);
    expect(labeled.y + labeled.height / 2).toBeLessThan(b.y + b.height);
  });

  it('keeps parallel edges distinct (multigraph)', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'p1', sourceId: 'a', targetId: 'b' },
        { id: 'p2', sourceId: 'a', targetId: 'b' },
      ],
    });
    const laidOut = getDagreLayout(g);
    expect(laidOut.edges).toHaveLength(2);
    expect(laidOut.edges[0].points).toBeDefined();
    expect(laidOut.edges[1].points).toBeDefined();
  });

  it('handles compound graphs via setParent', () => {
    const compound = createGraph({
      nodes: [
        { id: 'p' },
        { id: 'p1', parentId: 'p' },
        { id: 'out' },
      ],
      edges: [{ id: 'e', sourceId: 'p1', targetId: 'out' }],
    });
    const laidOut = getDagreLayout(compound);
    expect(laidOut.nodes.find((n) => n.id === 'p1')?.parentId).toBe('p');
    for (const node of laidOut.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
    }
  });

  it('preserves non-geometry fields and is deterministic', () => {
    const first = getDagreLayout(makeGraph());
    expect(first.nodes[0].data).toEqual({ n: 1 });
    expect(first.edges[0].weight).toBe(3);
    expect(getDagreLayout(makeGraph())).toEqual(first);
  });
});
