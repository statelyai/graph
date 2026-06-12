import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src';
import { getCytoscapeLayout } from '../../src/layout/cytoscape';

const makeGraph = () =>
  createGraph({
    direction: 'down',
    nodes: [{ id: 'a', data: { kind: 'start' } }, { id: 'b' }, { id: 'c' }],
    edges: [
      {
        id: 'e1',
        sourceId: 'a',
        targetId: 'b',
        label: 'go',
        weight: 2,
        mode: 'undirected',
      },
      { id: 'e2', sourceId: 'b', targetId: 'c' },
    ],
  });

describe('getCytoscapeLayout', () => {
  it('grid: positions every node finitely and distinctly with resolved sizes', async () => {
    const laidOut = await getCytoscapeLayout(makeGraph(), {
      name: 'grid',
      measure: () => ({ width: 80, height: 40 }),
    });
    for (const node of laidOut.nodes) {
      expect(node.width).toBe(80);
      expect(node.height).toBe(40);
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    const positions = laidOut.nodes.map((n) => `${n.x},${n.y}`);
    expect(new Set(positions).size).toBe(laidOut.nodes.length);
  });

  it('breadthfirst: puts the root above its children', async () => {
    const tree = createGraph({
      nodes: [{ id: 'root' }, { id: 'left' }, { id: 'right' }],
      edges: [
        { id: 'e1', sourceId: 'root', targetId: 'left' },
        { id: 'e2', sourceId: 'root', targetId: 'right' },
      ],
    });
    const laidOut = await getCytoscapeLayout(tree, {
      name: 'breadthfirst',
      layoutOptions: { roots: ['root'] },
    });
    const root = laidOut.nodes.find((n) => n.id === 'root')!;
    const left = laidOut.nodes.find((n) => n.id === 'left')!;
    const right = laidOut.nodes.find((n) => n.id === 'right')!;
    expect(root.y).toBeLessThan(left.y);
    expect(root.y).toBeLessThan(right.y);
  });

  it('cose: completes with finite positions and no coincident node rects', async () => {
    const laidOut = await getCytoscapeLayout(makeGraph(), {
      name: 'cose',
      measure: () => ({ width: 80, height: 40 }),
    });
    for (const node of laidOut.nodes) {
      expect(Number.isFinite(node.x)).toBe(true);
      expect(Number.isFinite(node.y)).toBe(true);
    }
    for (let i = 0; i < laidOut.nodes.length; i++) {
      for (let j = i + 1; j < laidOut.nodes.length; j++) {
        const a = laidOut.nodes[i];
        const b = laidOut.nodes[j];
        expect(a.x !== b.x || a.y !== b.y).toBe(true);
      }
    }
  });

  it('feeds node dimensions to the engine (wider nodes spread further)', async () => {
    const centerGap = async (width: number) => {
      const laidOut = await getCytoscapeLayout(makeGraph(), {
        name: 'grid',
        layoutOptions: { rows: 1 },
        measure: () => ({ width, height: 40 }),
      });
      const centers = laidOut.nodes
        .map((n) => n.x + n.width / 2)
        .sort((a, b) => a - b);
      return centers[1] - centers[0];
    };
    expect(await centerGap(200)).toBeGreaterThan(await centerGap(20));
  });

  it('lays out compound graphs: child inside parent rect (absolute coords)', async () => {
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
    const laidOut = await getCytoscapeLayout(compound, {
      name: 'grid',
      measure: () => ({ width: 60, height: 30 }),
    });
    const parent = laidOut.nodes.find((n) => n.id === 'p')!;
    const child = laidOut.nodes.find((n) => n.id === 'p1')!;
    expect(child.parentId).toBe('p');
    // parent gets cytoscape's computed compound size, surrounding children
    expect(child.x).toBeGreaterThanOrEqual(parent.x - 1);
    expect(child.y).toBeGreaterThanOrEqual(parent.y - 1);
    expect(child.x + child.width).toBeLessThanOrEqual(
      parent.x + parent.width + 1,
    );
    expect(child.y + child.height).toBeLessThanOrEqual(
      parent.y + parent.height + 1,
    );
  });

  it('passes raw layoutOptions through (grid rows: 1 ⇒ one row)', async () => {
    const laidOut = await getCytoscapeLayout(makeGraph(), {
      name: 'grid',
      layoutOptions: { rows: 1 },
      measure: () => ({ width: 80, height: 40 }),
    });
    const ys = new Set(laidOut.nodes.map((n) => n.y));
    expect(ys.size).toBe(1);
  });

  it('locks isFixed nodes at their current position', async () => {
    const graph = createGraph({
      nodes: [{ id: 'a', x: 500, y: 480, width: 80, height: 40 }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    const laidOut = await getCytoscapeLayout(graph, {
      name: 'grid',
      isFixed: (node) => node.id === 'a',
    });
    const a = laidOut.nodes.find((n) => n.id === 'a')!;
    expect(a.x).toBe(500);
    expect(a.y).toBe(480);
  });

  it('preserves non-geometry fields', async () => {
    const laidOut = await getCytoscapeLayout(makeGraph(), { name: 'grid' });
    expect(laidOut.direction).toBe('down');
    expect(laidOut.nodes[0].data).toEqual({ kind: 'start' });
    const e1 = laidOut.edges.find((e) => e.id === 'e1')!;
    expect(e1.weight).toBe(2);
    expect(e1.mode).toBe('undirected');
    expect(e1.label).toBe('go');
  });

  it('grid is deterministic', async () => {
    const first = await getCytoscapeLayout(makeGraph(), { name: 'grid' });
    const second = await getCytoscapeLayout(makeGraph(), { name: 'grid' });
    expect(second).toEqual(first);
  });
});
