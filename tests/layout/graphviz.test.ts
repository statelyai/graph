import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src/graph';
import { getLayoutBounds } from '../../src/layout';
import { getGraphvizLayout } from '../../src/layout/graphviz';
import type { EntityRect, VisualNode } from '../../src/types';

const MEASURE = () => ({ width: 120, height: 60 });

function createChainGraph() {
  return createGraph({
    id: 'chain',
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [
      { id: 'e1', sourceId: 'a', targetId: 'b' },
      { id: 'e2', sourceId: 'b', targetId: 'c' },
    ],
  });
}

function rectsOverlap(a: VisualNode, b: VisualNode): boolean {
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function isInside(rect: EntityRect, bounds: EntityRect): boolean {
  return (
    rect.x >= bounds.x &&
    rect.y >= bounds.y &&
    rect.x + rect.width <= bounds.x + bounds.width &&
    rect.y + rect.height <= bounds.y + bounds.height
  );
}

describe('getGraphvizLayout', () => {
  it('positions a 3-node chain: sizes applied, inside bounds, no overlaps, rankdir respected', async () => {
    const laidOut = await getGraphvizLayout(createChainGraph(), {
      direction: 'down',
      measure: MEASURE,
    });

    const bounds = getLayoutBounds(laidOut);
    expect(bounds.width).toBeGreaterThan(0);
    expect(bounds.height).toBeGreaterThan(0);

    for (const node of laidOut.nodes) {
      expect(node.width).toBeCloseTo(120, 0);
      expect(node.height).toBeCloseTo(60, 0);
      expect(isInside(node, bounds)).toBe(true);
    }

    // No overlapping nodes.
    for (let i = 0; i < laidOut.nodes.length; i++) {
      for (let j = i + 1; j < laidOut.nodes.length; j++) {
        expect(rectsOverlap(laidOut.nodes[i], laidOut.nodes[j])).toBe(false);
      }
    }

    // rankdir TB: successive ranks have increasing y.
    const byId = new Map(laidOut.nodes.map((n) => [n.id, n]));
    expect(byId.get('a')!.y).toBeLessThan(byId.get('b')!.y);
    expect(byId.get('b')!.y).toBeLessThan(byId.get('c')!.y);
  });

  it('routes edges: points (endpoints near nodes) and routing "splines"', async () => {
    const laidOut = await getGraphvizLayout(createChainGraph(), {
      measure: MEASURE,
    });
    const bounds = getLayoutBounds(laidOut);
    const byId = new Map(laidOut.nodes.map((n) => [n.id, n]));

    for (const edge of laidOut.edges) {
      expect(edge.routing).toBe('splines');
      expect(edge.points).toBeDefined();
      expect(edge.points!.length).toBeGreaterThanOrEqual(2);

      // All route points inside the layout bounds.
      for (const point of edge.points!) {
        expect(point.x).toBeGreaterThanOrEqual(bounds.x);
        expect(point.x).toBeLessThanOrEqual(bounds.x + bounds.width);
        expect(point.y).toBeGreaterThanOrEqual(bounds.y);
        expect(point.y).toBeLessThanOrEqual(bounds.y + bounds.height);
      }

      // First point near the source node, last near the target node.
      const near = (p: { x: number; y: number }, n: VisualNode) =>
        p.x >= n.x - 5 &&
        p.x <= n.x + n.width + 5 &&
        p.y >= n.y - 5 &&
        p.y <= n.y + n.height + 5;
      expect(near(edge.points![0], byId.get(edge.sourceId)!)).toBe(true);
      expect(
        near(edge.points![edge.points!.length - 1], byId.get(edge.targetId)!),
      ).toBe(true);
    }
  });

  it('writes a labeled edge label position to edge.x/y within bounds', async () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', label: 'go' }],
    });
    const laidOut = await getGraphvizLayout(graph, { measure: MEASURE });
    const bounds = getLayoutBounds(laidOut);
    const edge = laidOut.edges[0];

    // Label lies between the two nodes, inside the layout bounds.
    expect(edge.x).toBeGreaterThanOrEqual(bounds.x);
    expect(edge.x).toBeLessThanOrEqual(bounds.x + bounds.width);
    expect(edge.y).toBeGreaterThanOrEqual(bounds.y);
    expect(edge.y).toBeLessThanOrEqual(bounds.y + bounds.height);
    const [a, b] = laidOut.nodes;
    expect(edge.y).toBeGreaterThan(Math.min(a.y, b.y));
    expect(edge.y).toBeLessThan(Math.max(a.y + a.height, b.y + b.height));
  });

  it('engine "neato" runs and differs from "dot"', async () => {
    const graph = createChainGraph();
    const dotOut = await getGraphvizLayout(graph, { measure: MEASURE });
    const neatoOut = await getGraphvizLayout(graph, {
      engine: 'neato',
      measure: MEASURE,
    });

    const positions = (g: typeof dotOut) =>
      g.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
    expect(positions(neatoOut)).not.toEqual(positions(dotOut));
  });

  it('is deterministic: same input twice yields identical output', async () => {
    const first = await getGraphvizLayout(createChainGraph(), {
      measure: MEASURE,
    });
    const second = await getGraphvizLayout(createChainGraph(), {
      measure: MEASURE,
    });
    expect(second).toEqual(first);
  });

  it('throws a descriptive error for compound graphs', async () => {
    const graph = createGraph({
      nodes: [{ id: 'parent' }, { id: 'child', parentId: 'parent' }],
      edges: [],
    });
    await expect(getGraphvizLayout(graph)).rejects.toThrow(
      /compound graphs are not supported.*"child".*getElkLayout.*flatten/s,
    );
  });

  it('preserves all non-geometry fields', async () => {
    const graph = createGraph({
      id: 'preserved',
      mode: 'directed',
      initialNodeId: 'a',
      data: { meta: true },
      style: { theme: 'dark' },
      nodes: [
        {
          id: 'a',
          label: 'Node A',
          data: { kind: 'start' },
          shape: 'ellipse',
          color: 'red',
          style: { stroke: 'blue' },
          ports: [{ name: 'out1', direction: 'out', data: { p: 1 } }],
        },
        { id: 'b', label: 'Node B', data: [1, 2, 3] },
      ],
      edges: [
        {
          id: 'e1',
          sourceId: 'a',
          targetId: 'b',
          label: 'go',
          weight: 7,
          mode: 'undirected',
          sourcePort: 'out1',
          data: { via: 'wire' },
          color: 'green',
          style: { dashed: true },
        },
      ],
    });

    const laidOut = await getGraphvizLayout(graph, { measure: MEASURE });

    expect(laidOut.id).toBe('preserved');
    expect(laidOut.mode).toBe('directed');
    expect(laidOut.initialNodeId).toBe('a');
    expect(laidOut.data).toEqual({ meta: true });
    expect(laidOut.style).toEqual({ theme: 'dark' });

    const strip = (entity: Record<string, any>) => {
      const { x, y, width, height, points, routing, ports, ...rest } = entity;
      return rest;
    };
    const stripNode = (node: Record<string, any>) => ({
      ...strip(node),
      ...(node.ports && { ports: node.ports.map(strip) }),
    });

    expect(laidOut.nodes.map(stripNode)).toEqual(
      graph.nodes.map(stripNode),
    );
    expect(laidOut.edges.map(strip)).toEqual(graph.edges.map(strip));
  });
});
