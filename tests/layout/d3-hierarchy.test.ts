import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src';
import { getTidyTreeLayout } from '../../src/layout/d3-hierarchy';

const SIZE = { width: 60, height: 30 };
const measure = () => ({ ...SIZE });

const makeTree = () =>
  createGraph({
    nodes: [{ id: 'a', data: { n: 1 } }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b', weight: 3 },
      { id: 'e2', sourceId: 'a', targetId: 'c' },
    ],
  });

const centerX = (n: { x: number; width: number }) => n.x + n.width / 2;
const centerY = (n: { y: number; height: number }) => n.y + n.height / 2;

describe('getTidyTreeLayout', () => {
  it('places the parent above its children (direction down)', () => {
    const laidOut = getTidyTreeLayout(makeTree(), { measure });
    const [a, b, c] = laidOut.nodes;
    expect(centerY(a)).toBeLessThan(centerY(b));
    expect(centerY(a)).toBeLessThan(centerY(c));
    // Tidy tree centers the parent over its children
    expect(centerX(a)).toBeCloseTo((centerX(b) + centerX(c)) / 2);
  });

  it('keeps siblings from overlapping (disjoint x-ranges)', () => {
    const laidOut = getTidyTreeLayout(makeTree(), { measure });
    const [b, c] = [...laidOut.nodes.slice(1)].sort((m, n) => m.x - n.x);
    expect(b.x + b.width).toBeLessThanOrEqual(c.x);
  });

  it('transposes for direction right', () => {
    const laidOut = getTidyTreeLayout(makeTree(), {
      direction: 'right',
      measure,
    });
    const [a, b, c] = laidOut.nodes;
    expect(centerX(a)).toBeLessThan(centerX(b));
    expect(centerX(a)).toBeLessThan(centerX(c));
    // Siblings spread along y instead, without overlapping
    const [top, bottom] = [b, c].sort((m, n) => m.y - n.y);
    expect(top.y + top.height).toBeLessThanOrEqual(bottom.y);
  });

  it('lays out multiple roots as a forest', () => {
    const forest = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'c', targetId: 'd' },
      ],
    });
    const laidOut = getTidyTreeLayout(forest, { measure });
    // Synthetic root is dropped — only the original nodes remain
    expect(laidOut.nodes.map((n) => n.id)).toEqual(['a', 'b', 'c', 'd']);
    for (const node of laidOut.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    // Both roots sit on the same (top) layer; the two trees don't overlap
    const [a, , c] = laidOut.nodes;
    expect(centerY(a)).toBeCloseTo(centerY(c));
    expect(centerX(a)).not.toBeCloseTo(centerX(c));
  });

  it('throws a descriptive error when the graph is cyclic with no root', () => {
    const cyclic = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'a' },
      ],
    });
    expect(() => getTidyTreeLayout(cyclic)).toThrowError(
      /getTidyTreeLayout: no tree root found .* cyclic.* options\.rootId/s,
    );
    // An explicit rootId resolves it
    const laidOut = getTidyTreeLayout(cyclic, { rootId: 'a', measure });
    const [a, b] = laidOut.nodes;
    expect(centerY(a)).toBeLessThan(centerY(b));
  });

  it('preserves extra non-tree edges untouched', () => {
    const withCross = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
        { id: 'cross', sourceId: 'b', targetId: 'c', label: 'extra' },
      ],
    });
    const laidOut = getTidyTreeLayout(withCross, { measure });
    expect(laidOut.edges).toHaveLength(3);
    const cross = laidOut.edges.find((e) => e.id === 'cross')!;
    expect(cross.sourceId).toBe('b');
    expect(cross.targetId).toBe('c');
    expect(cross.label).toBe('extra');
    // Tidy tree does not route edges
    expect(cross.points).toBeUndefined();
  });

  it('preserves non-geometry fields and is deterministic', () => {
    const first = getTidyTreeLayout(makeTree(), { measure });
    expect(first.nodes[0].data).toEqual({ n: 1 });
    expect(first.edges[0].weight).toBe(3);
    expect(getTidyTreeLayout(makeTree(), { measure })).toEqual(first);
  });
});
