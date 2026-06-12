import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src';
import { getElkLayout } from '../../src/layout/elk';
import { getLayoutBounds } from '../../src/layout';

const makeGraph = () =>
  createGraph({
    direction: 'down',
    nodes: [
      { id: 'a', data: { kind: 'start' } },
      { id: 'b' },
      { id: 'c' },
    ],
    edges: [
      {
        id: 'e1',
        sourceId: 'a',
        targetId: 'b',
        label: 'go',
        width: 30,
        height: 12,
        weight: 2,
        mode: 'undirected',
      },
      { id: 'e2', sourceId: 'b', targetId: 'c' },
    ],
  });

describe('getElkLayout', () => {
  it('assigns positions and sizes to every node', async () => {
    const laidOut = await getElkLayout(makeGraph(), {
      measure: () => ({ width: 80, height: 40 }),
    });
    for (const node of laidOut.nodes) {
      expect(node.width).toBe(80);
      expect(node.height).toBe(40);
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    // layered + direction down: b is below a, c below b
    const [a, b, c] = laidOut.nodes;
    expect(b.y).toBeGreaterThan(a.y);
    expect(c.y).toBeGreaterThan(b.y);
  });

  it('captures routed edge points and routing', async () => {
    const laidOut = await getElkLayout(makeGraph());
    for (const edge of laidOut.edges) {
      expect(edge.points).toBeDefined();
      expect(edge.points!.length).toBeGreaterThanOrEqual(2);
      expect(edge.routing).toBe('orthogonal');
    }
    const bounds = getLayoutBounds(laidOut);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);
  });

  it('writes the computed edge label rect onto edge x/y', async () => {
    const laidOut = await getElkLayout(makeGraph());
    const labeled = laidOut.edges.find((e) => e.id === 'e1')!;
    // ELK placed the 30x12 label somewhere within the drawing
    expect(labeled.width).toBe(30);
    expect(labeled.height).toBe(12);
    const bounds = getLayoutBounds(laidOut);
    expect(labeled.x).toBeGreaterThanOrEqual(bounds.x - 1);
    expect(labeled.x).toBeLessThanOrEqual(bounds.x + bounds.width + 1);
  });

  it('preserves non-geometry fields', async () => {
    const laidOut = await getElkLayout(makeGraph());
    expect(laidOut.nodes[0].data).toEqual({ kind: 'start' });
    const e1 = laidOut.edges.find((e) => e.id === 'e1')!;
    expect(e1.weight).toBe(2);
    expect(e1.mode).toBe('undirected');
    expect(e1.label).toBe('go');
  });

  it('lays out compound graphs with parent-relative child coordinates', async () => {
    const compound = createGraph({
      nodes: [
        { id: 'p' },
        { id: 'p1', parentId: 'p' },
        { id: 'p2', parentId: 'p' },
        { id: 'out' },
      ],
      edges: [
        { id: 'i', sourceId: 'p1', targetId: 'p2' },
        { id: 'o', sourceId: 'p', targetId: 'out' },
      ],
    });
    const laidOut = await getElkLayout(compound);
    const parent = laidOut.nodes.find((n) => n.id === 'p')!;
    const child = laidOut.nodes.find((n) => n.id === 'p1')!;
    expect(child.parentId).toBe('p');
    // relative coords: child fits inside the parent's own box
    expect(child.x + child.width).toBeLessThanOrEqual(parent.width + 1);
    expect(child.y + child.height).toBeLessThanOrEqual(parent.height + 1);
  });

  it('is deterministic', async () => {
    const first = await getElkLayout(makeGraph());
    const second = await getElkLayout(makeGraph());
    expect(second).toEqual(first);
  });

  it('passes raw layoutOptions through (spacing grows the drawing)', async () => {
    const tight = await getElkLayout(makeGraph(), { spacing: { layer: 10 } });
    const loose = await getElkLayout(makeGraph(), { spacing: { layer: 200 } });
    expect(getLayoutBounds(loose).height).toBeGreaterThan(
      getLayoutBounds(tight).height,
    );
  });

  it('maps constraints.layer to ELK partitions', async () => {
    // Fan a→b, a→c: unconstrained layered puts b and c in the same layer;
    // partitioning b=1, c=2 forces c into a later layer than b.
    const layers: Record<string, number> = { a: 0, b: 1, c: 2 };
    const make = () =>
      createGraph({
        direction: 'down',
        nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
        edges: [
          { id: 'e1', sourceId: 'a', targetId: 'b' },
          { id: 'e2', sourceId: 'a', targetId: 'c' },
        ],
      });
    const free = await getElkLayout(make());
    const freeById = Object.fromEntries(free.nodes.map((n) => [n.id, n]));
    expect(freeById.c.y).toBe(freeById.b.y);

    const constrained = await getElkLayout(make(), {
      constraints: { layer: (node) => layers[node.id] },
    });
    const byId = Object.fromEntries(constrained.nodes.map((n) => [n.id, n]));
    expect(byId.a.y).toBeLessThan(byId.b.y);
    expect(byId.b.y).toBeLessThan(byId.c.y);
  });
});
