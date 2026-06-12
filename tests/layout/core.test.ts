import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src';
import {
  DEFAULT_NODE_SIZE,
  applyLayoutFrame,
  getLayoutBounds,
  getNodeSize,
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
