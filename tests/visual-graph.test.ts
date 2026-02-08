import { describe, it, expect } from 'vitest';
import {
  createGraph,
  createVisualGraph,
} from '../src/graph';
import { toDOT } from '../src/formats/dot';
import { toGraphML } from '../src/formats/graphml';
import { hasPath } from '../src/algorithms';
import type { VisualGraph, VisualNode, VisualEdge } from '../src/types';

describe('createVisualGraph', () => {
  it('defaults position/size to 0 on nodes and edges', () => {
    const g = createVisualGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });

    expect(g.nodes[0].x).toBe(0);
    expect(g.nodes[0].y).toBe(0);
    expect(g.nodes[0].width).toBe(0);
    expect(g.nodes[0].height).toBe(0);
    expect(g.nodes[0].shape).toBe('rectangle');

    expect(g.edges[0].x).toBe(0);
    expect(g.edges[0].y).toBe(0);
    expect(g.edges[0].width).toBe(0);
    expect(g.edges[0].height).toBe(0);
  });

  it('preserves provided position/size values', () => {
    const g = createVisualGraph({
      nodes: [{ id: 'a', x: 10, y: 20, width: 100, height: 50 }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'a', x: 5, y: 15, width: 30, height: 10 }],
    });

    expect(g.nodes[0].x).toBe(10);
    expect(g.nodes[0].y).toBe(20);
    expect(g.nodes[0].width).toBe(100);
    expect(g.nodes[0].height).toBe(50);

    expect(g.edges[0].x).toBe(5);
    expect(g.edges[0].y).toBe(15);
    expect(g.edges[0].width).toBe(30);
    expect(g.edges[0].height).toBe(10);
  });

  it('defaults direction to down', () => {
    const g = createVisualGraph();
    expect(g.direction).toBe('down');
  });

  it('accepts custom direction', () => {
    const g = createVisualGraph({ direction: 'right' });
    expect(g.direction).toBe('right');
  });

  it('preserves shape on nodes', () => {
    const g = createVisualGraph({
      nodes: [{ id: 'a', shape: 'diamond' }],
    });
    expect(g.nodes[0].shape).toBe('diamond');
  });

  it('preserves color on nodes and edges', () => {
    const g = createVisualGraph({
      nodes: [{ id: 'a', color: '#ff0000' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', color: 'blue' }],
    });
    expect(g.nodes[0].color).toBe('#ff0000');
    expect(g.edges[0].color).toBe('blue');
  });

  it('preserves style on nodes and edges', () => {
    const g = createVisualGraph({
      nodes: [{ id: 'a', style: { 'font-size': 14 } }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', style: { opacity: 0.5 } }],
    });
    expect(g.nodes[0].style).toEqual({ 'font-size': 14 });
    expect(g.edges[0].style).toEqual({ opacity: 0.5 });
  });

  it('node.x etc. are required (not optional) on return type', () => {
    const g = createVisualGraph({
      nodes: [{ id: 'a' }],
      edges: [],
    });
    // These should compile without optional chaining:
    const x: number = g.nodes[0].x;
    const y: number = g.nodes[0].y;
    const w: number = g.nodes[0].width;
    const h: number = g.nodes[0].height;
    const shape: string = g.nodes[0].shape;
    expect(x).toBe(0);
    expect(y).toBe(0);
    expect(w).toBe(0);
    expect(h).toBe(0);
    expect(shape).toBe('rectangle');
  });
});

describe('createGraph with visual fields', () => {
  it('passes through visual fields when provided', () => {
    const g = createGraph({
      nodes: [{ id: 'a', x: 10, y: 20, shape: 'ellipse', color: 'red' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'a', color: 'blue' }],
      direction: 'left',
    });
    expect(g.nodes[0].x).toBe(10);
    expect(g.nodes[0].y).toBe(20);
    expect(g.nodes[0].shape).toBe('ellipse');
    expect(g.nodes[0].color).toBe('red');
    expect(g.edges[0].color).toBe('blue');
    expect(g.direction).toBe('left');
  });

  it('omits visual fields when not provided', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }],
    });
    expect(g.nodes[0].x).toBeUndefined();
    expect(g.nodes[0].shape).toBeUndefined();
    expect(g.direction).toBeUndefined();
  });
});

describe('visual graph + algorithms compatibility', () => {
  it('VisualGraph is accepted by algorithms that take Graph', () => {
    const g = createVisualGraph({
      nodes: [
        { id: 'a', x: 0, y: 0 },
        { id: 'b', x: 100, y: 0 },
        { id: 'c', x: 200, y: 0 },
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });

    // hasPath accepts Graph — VisualGraph should work
    expect(hasPath(g, 'a', 'c')).toBe(true);
    expect(hasPath(g, 'c', 'a')).toBe(false);
  });
});

describe('toDOT with visual properties', () => {
  it('emits rankdir from direction', () => {
    const g = createVisualGraph({
      id: 'test',
      direction: 'right',
      nodes: [{ id: 'a' }],
    });
    const dot = toDOT(g);
    expect(dot).toContain('rankdir=LR');
  });

  it('emits shape on nodes', () => {
    const g = createGraph({
      id: 'test',
      nodes: [{ id: 'a', shape: 'diamond' }],
    });
    const dot = toDOT(g);
    expect(dot).toContain('shape=diamond');
  });

  it('maps rectangle shape to box', () => {
    const g = createGraph({
      id: 'test',
      nodes: [{ id: 'a', shape: 'rectangle' }],
    });
    const dot = toDOT(g);
    expect(dot).toContain('shape=box');
  });

  it('emits fillcolor from node color', () => {
    const g = createGraph({
      id: 'test',
      nodes: [{ id: 'a', color: '#ff0000' }],
    });
    const dot = toDOT(g);
    expect(dot).toContain('fillcolor="#ff0000"');
    expect(dot).toContain('style=filled');
  });

  it('emits color on edges', () => {
    const g = createGraph({
      id: 'test',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', color: 'red' }],
    });
    const dot = toDOT(g);
    expect(dot).toContain('color="red"');
  });

  it('direction mapping: down=TB, up=BT, left=RL, right=LR', () => {
    for (const [dir, rankdir] of [
      ['down', 'TB'],
      ['up', 'BT'],
      ['left', 'RL'],
      ['right', 'LR'],
    ] as const) {
      const g = createGraph({ id: 'test', direction: dir, nodes: [{ id: 'a' }] });
      expect(toDOT(g)).toContain(`rankdir=${rankdir}`);
    }
  });
});

describe('toGraphML with visual properties', () => {
  it('emits position/size as data elements on nodes', () => {
    const g = createVisualGraph({
      id: 'test',
      nodes: [{ id: 'a', x: 10, y: 20, width: 100, height: 50 }],
    });
    const xml = toGraphML(g);
    expect(xml).toContain('key="x"');
    expect(xml).toContain('key="y"');
    expect(xml).toContain('key="width"');
    expect(xml).toContain('key="height"');
  });

  it('emits shape and color on nodes', () => {
    const g = createGraph({
      id: 'test',
      nodes: [{ id: 'a', shape: 'ellipse', color: 'blue' }],
    });
    const xml = toGraphML(g);
    expect(xml).toContain('key="shape"');
    expect(xml).toContain('key="color"');
  });

  it('emits color on edges', () => {
    const g = createGraph({
      id: 'test',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', color: 'red' }],
    });
    const xml = toGraphML(g);
    expect(xml).toContain('key="color"');
  });
});
