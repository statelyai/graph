import { describe, it, expect } from 'vitest';
import { createGraph, createVisualGraph } from '../../src';
import {
  DEFAULT_NODE_SIZE,
  applyLayoutFrame,
  centerGraph,
  genLayoutTransition,
  getCenteredGraph,
  getGraphWithLayoutFrame,
  getLayoutBounds,
  getNodeSize,
  getTranslatedGraph,
  translateGraph,
} from '../../src/layout';

describe('getNodeSize', () => {
  const node = createGraph({ nodes: [{ id: 'a', width: 40, height: 20 }] })
    .nodes[0];

  it('prefers the measure callback', () => {
    expect(getNodeSize(node, { measure: () => ({ width: 7, height: 9 }) }))
      .toEqual({ width: 7, height: 9 });
  });

  it('falls back to the node dimensions', () => {
    expect(getNodeSize(node)).toEqual({ width: 40, height: 20 });
  });

  it('treats zero/absent sizes as unset and uses the default', () => {
    const bare = createGraph({ nodes: [{ id: 'b' }] }).nodes[0];
    expect(getNodeSize(bare)).toEqual(DEFAULT_NODE_SIZE);
    const zero = createGraph({ nodes: [{ id: 'c', width: 0, height: 0 }] })
      .nodes[0];
    expect(getNodeSize(zero)).toEqual(DEFAULT_NODE_SIZE);
  });
});

describe('applyLayoutFrame', () => {
  it('writes positions in place and leaves missing nodes untouched', () => {
    const g = createGraph({
      nodes: [{ id: 'a', x: 1, y: 1 }, { id: 'b', x: 2, y: 2 }],
    });
    applyLayoutFrame(g, {
      positions: { a: { x: 10, y: 20 } },
      alpha: 0.5,
    });
    expect(g.nodes[0]).toMatchObject({ x: 10, y: 20 });
    expect(g.nodes[1]).toMatchObject({ x: 2, y: 2 });
  });

  it('has an immutable counterpart', () => {
    const source = createGraph({
      nodes: [{ id: 'a', x: 1, y: 1 }, { id: 'b', x: 2, y: 2 }],
    });
    const result = getGraphWithLayoutFrame(source, {
      positions: { a: { x: 10, y: 20 } },
      alpha: 0.5,
    });

    expect(source.nodes[0]).toMatchObject({ x: 1, y: 1 });
    expect(result.nodes[0]).toMatchObject({ x: 10, y: 20 });
    expect(result.nodes[1]).toBe(source.nodes[1]);
  });
});

describe('getLayoutBounds', () => {
  it('covers node rects and edge route points', () => {
    const g = createGraph({
      nodes: [
        { id: 'a', x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', x: 100, y: 50, width: 20, height: 20 },
      ],
      edges: [
        {
          id: 'e',
          sourceId: 'a',
          targetId: 'b',
          points: [
            { x: 5, y: 5 },
            { x: 150, y: -30 },
            { x: 110, y: 60 },
          ],
        },
      ],
    });
    expect(getLayoutBounds(g)).toEqual({
      x: 0,
      y: -30,
      width: 150,
      height: 100,
    });
  });

  it('returns a zero rect for graphs without geometry', () => {
    expect(getLayoutBounds(createGraph({ nodes: [{ id: 'a' }] }))).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});

describe('genLayoutTransition', () => {
  const from = createGraph({
    nodes: [
      { id: 'a', x: 0, y: 0, width: 10, height: 10 },
      { id: 'b', width: 10, height: 10 }, // unpositioned
    ],
  });
  const to = createVisualGraph({
    nodes: [
      { id: 'a', x: 100, y: 50, width: 10, height: 10 },
      { id: 'b', x: 30, y: 40, width: 10, height: 10 },
    ],
  });

  it('interpolates from start to end and returns the target graph', () => {
    const frames = [];
    const gen = genLayoutTransition(from, to, { steps: 4 });
    let step = gen.next();
    while (!step.done) {
      frames.push(step.value);
      step = gen.next();
    }
    expect(step.value).toBe(to);
    expect(frames).toHaveLength(4);
    // last frame lands exactly on the target
    expect(frames[3].positions.a).toEqual({ x: 100, y: 50 });
    expect(frames[3].alpha).toBe(0);
    // intermediate frames are strictly between start and end
    expect(frames[1].positions.a.x).toBeGreaterThan(0);
    expect(frames[1].positions.a.x).toBeLessThan(100);
  });

  it('starts unmatched/unpositioned nodes at their target position', () => {
    const [first] = genLayoutTransition(from, to, { steps: 2 });
    expect(first.positions.b).toEqual({ x: 30, y: 40 });
  });

  it('supports a custom ease', () => {
    const frames = [...genLayoutTransition(from, to, { steps: 2, ease: () => 1 })];
    expect(frames[0].positions.a).toEqual({ x: 100, y: 50 });
  });

  it('drives applyLayoutFrame to morph the live graph', () => {
    const live = createGraph({
      nodes: [{ id: 'a', x: 0, y: 0, width: 10, height: 10 }],
    });
    const target = createVisualGraph({
      nodes: [{ id: 'a', x: 10, y: 10, width: 10, height: 10 }],
    });
    for (const frame of genLayoutTransition(live, target, { steps: 5 })) {
      applyLayoutFrame(live, frame);
    }
    expect(live.nodes[0]).toMatchObject({ x: 10, y: 10 });
  });
});

describe('translateGraph', () => {
  it('shifts nodes, edge points, and edge label rects in place', () => {
    const g = createGraph({
      nodes: [
        { id: 'a', x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', x: 100, y: 50 },
        { id: 'unpositioned' },
      ],
      edges: [
        {
          id: 'e',
          sourceId: 'a',
          targetId: 'b',
          x: 40,
          y: 20,
          points: [
            { x: 5, y: 5 },
            { x: 100, y: 55 },
          ],
        },
      ],
    });
    translateGraph(g, 7, -3);
    expect(g.nodes[0]).toMatchObject({ x: 7, y: -3 });
    expect(g.nodes[1]).toMatchObject({ x: 107, y: 47 });
    expect(g.nodes[2].x).toBeUndefined();
    expect(g.edges[0]).toMatchObject({ x: 47, y: 17 });
    expect(g.edges[0].points).toEqual([
      { x: 12, y: 2 },
      { x: 107, y: 52 },
    ]);
  });

  it('has an immutable counterpart', () => {
    const source = createGraph({
      nodes: [{ id: 'a', x: 0, y: 0 }, { id: 'b', x: 10, y: 10 }],
      edges: [
        {
          id: 'e1',
          sourceId: 'a',
          targetId: 'b',
          points: [{ x: 0, y: 0 }],
        },
      ],
    });
    const result = getTranslatedGraph(source, 5, 7);

    expect(source.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(source.edges[0].points).toEqual([{ x: 0, y: 0 }]);
    expect(result.nodes[0]).toMatchObject({ x: 5, y: 7 });
    expect(result.edges[0].points).toEqual([{ x: 5, y: 7 }]);
  });

  it('leaves parent-relative children and nested-edge geometry alone', () => {
    const g = createGraph({
      nodes: [
        { id: 'parent', x: 10, y: 10, width: 200, height: 200 },
        { id: 'child1', parentId: 'parent', x: 5, y: 5 },
        { id: 'child2', parentId: 'parent', x: 50, y: 5 },
      ],
      edges: [
        {
          id: 'inner',
          sourceId: 'child1',
          targetId: 'child2',
          points: [
            { x: 5, y: 5 },
            { x: 50, y: 5 },
          ],
        },
      ],
    });
    translateGraph(g, 100, 100);
    expect(g.nodes[0]).toMatchObject({ x: 110, y: 110 });
    expect(g.nodes[1]).toMatchObject({ x: 5, y: 5 });
    expect(g.edges[0].points).toEqual([
      { x: 5, y: 5 },
      { x: 50, y: 5 },
    ]);
  });
});

describe('centerGraph', () => {
  it('centers the layout bounds on the rect center', () => {
    const g = createGraph({
      nodes: [
        { id: 'a', x: 0, y: 0, width: 10, height: 10 },
        { id: 'b', x: 90, y: 40, width: 10, height: 10 },
      ],
    });
    centerGraph(g, { x: 0, y: 0, width: 500, height: 300 });
    const bounds = getLayoutBounds(g);
    expect(bounds.x + bounds.width / 2).toBe(250);
    expect(bounds.y + bounds.height / 2).toBe(150);
  });

  it('is a no-op for graphs without geometry', () => {
    const g = createGraph({ nodes: [{ id: 'a' }] });
    centerGraph(g, { x: 0, y: 0, width: 500, height: 300 });
    expect(g.nodes[0].x).toBeUndefined();
  });

  it('has an immutable counterpart', () => {
    const source = createGraph({
      nodes: [{ id: 'a', x: 0, y: 0, width: 10, height: 10 }],
    });
    const result = getCenteredGraph(source, {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
    });

    expect(source.nodes[0]).toMatchObject({ x: 0, y: 0 });
    expect(result.nodes[0]).toMatchObject({ x: 45, y: 45 });
  });
});
