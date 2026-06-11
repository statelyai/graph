import { describe, it, expect } from 'vitest';
import { toXYFlow, fromXYFlow } from '../../src/formats/xyflow';
import type { VisualGraph } from '../../src/types';
import { expectFixtureRoundTrip } from './fixture-roundtrip';

const sampleGraph: VisualGraph = {
  id: '',
  mode: 'directed',
  initialNodeId: null,
  direction: 'down',
  nodes: [
    {
      type: 'node',
      id: 'a',
      parentId: null,
      initialNodeId: null,
      label: 'A',
      data: { weight: 1 },
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      shape: 'custom',
    },
    {
      type: 'node',
      id: 'b',
      parentId: null,
      initialNodeId: null,
      label: 'B',
      data: undefined,
      x: 200,
      y: 100,
      width: 80,
      height: 40,
    },
    {
      type: 'node',
      id: 'c',
      parentId: 'a',
      initialNodeId: null,
      label: 'Child',
      data: undefined,
      x: 30,
      y: 40,
      width: 60,
      height: 30,
    },
  ],
  edges: [
    {
      type: 'edge',
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      label: 'link',
      data: { cost: 3 },
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    },
  ],
  data: undefined as any,
};

describe('xyflow', () => {
  it('toXYFlow() produces correct structure', () => {
    const flow = toXYFlow(sampleGraph);
    expect(flow.nodes).toHaveLength(3);
    expect(flow.edges).toHaveLength(1);

    const nodeA = flow.nodes.find((n) => n.id === 'a');
    expect(nodeA?.position).toEqual({ x: 10, y: 20 });
    expect(nodeA?.width).toBe(100);
    expect(nodeA?.height).toBe(50);
    expect(nodeA?.type).toBe('custom');

    const nodeC = flow.nodes.find((n) => n.id === 'c');
    expect(nodeC?.parentId).toBe('a');

    expect(flow.edges[0].source).toBe('a');
    expect(flow.edges[0].target).toBe('b');
    // EdgeBase has no label field; label is stored in data
    expect((flow.edges[0].data as any)?.label).toBe('link');
  });

  it('fromXYFlow() parses nodes and edges', () => {
    const graph = fromXYFlow({
      nodes: [
        { id: 'x', position: { x: 5, y: 10 }, data: { foo: 1 }, width: 50, height: 25 },
        { id: 'y', position: { x: 100, y: 200 }, data: {}, type: 'input' },
      ],
      edges: [{ id: 'e0', source: 'x', target: 'y', data: { label: 'go' } }],
    });

    expect(graph.nodes).toHaveLength(2);
    expect(graph.edges).toHaveLength(1);

    const nodeX = graph.nodes.find((n) => n.id === 'x');
    expect(nodeX?.x).toBe(5);
    expect(nodeX?.y).toBe(10);
    expect(nodeX?.width).toBe(50);
    expect(nodeX?.height).toBe(25);
    expect(nodeX?.data).toEqual({ foo: 1 });

    const nodeY = graph.nodes.find((n) => n.id === 'y');
    expect(nodeY?.shape).toBe('input');
    expect(nodeY?.width).toBe(0);
    expect(nodeY?.height).toBe(0);

    expect(graph.edges[0].sourceId).toBe('x');
    expect(graph.edges[0].targetId).toBe('y');
    expect(graph.edges[0].label).toBe('go');
    expect(graph.direction).toBe('down');
  });

  it('fromXYFlow() uses measured dimensions when available', () => {
    const graph = fromXYFlow({
      nodes: [
        {
          id: 'a',
          position: { x: 0, y: 0 },
          data: {},
          width: 50,
          initialWidth: 40,
          measured: { width: 120, height: 60 },
        },
      ],
      edges: [],
    });

    expect(graph.nodes[0].width).toBe(120);
    expect(graph.nodes[0].height).toBe(60);
  });

  it('fromXYFlow() falls back to initialWidth/initialHeight', () => {
    const graph = fromXYFlow({
      nodes: [
        {
          id: 'a',
          position: { x: 0, y: 0 },
          data: {},
          initialWidth: 40,
          initialHeight: 20,
        },
      ],
      edges: [],
    });

    expect(graph.nodes[0].width).toBe(40);
    expect(graph.nodes[0].height).toBe(20);
  });

  it('round-trips a visual graph', () => {
    const flow = toXYFlow(sampleGraph);
    const parsed = fromXYFlow(flow);

    expect(parsed.nodes).toHaveLength(3);
    expect(parsed.edges).toHaveLength(1);

    const nodeA = parsed.nodes.find((n) => n.id === 'a');
    expect(nodeA?.x).toBe(10);
    expect(nodeA?.y).toBe(20);
    expect(nodeA?.shape).toBe('custom');
    expect(nodeA?.data).toEqual({ weight: 1 });

    const nodeC = parsed.nodes.find((n) => n.id === 'c');
    expect(nodeC?.parentId).toBe('a');

    expect(parsed.edges[0].sourceId).toBe('a');
    expect(parsed.edges[0].targetId).toBe('b');
    expect(parsed.edges[0].label).toBe('link');
  });

  it('round-trips graph metadata through reserved data fields', () => {
    expectFixtureRoundTrip(
      (graph) => fromXYFlow(toXYFlow(graph as VisualGraph)),
      {
        graphKeys: ['initialNodeId', 'data', 'direction', 'style'],
        nodeKeys: [
          'parentId',
          'initialNodeId',
          'label',
          'data',
          'x',
          'y',
          'width',
          'height',
          'shape',
          'color',
          'style',
          'ports',
        ],
        edgeKeys: [
          'label',
          'weight',
          'data',
          'x',
          'y',
          'width',
          'height',
          'color',
          'style',
          'sourcePort',
          'targetPort',
        ],
      },
    );
  });

  it('throws on null/undefined input', () => {
    expect(() => fromXYFlow(null as any)).toThrow('XYFlow: expected an object');
    expect(() => fromXYFlow(undefined as any)).toThrow(
      'XYFlow: expected an object',
    );
  });

  it('throws on missing nodes/edges arrays', () => {
    expect(() => fromXYFlow({} as any)).toThrow(
      'XYFlow: "nodes" must be an array',
    );
    expect(() => fromXYFlow({ nodes: [] } as any)).toThrow(
      'XYFlow: "edges" must be an array',
    );
  });

  it('handles empty flow', () => {
    const graph = fromXYFlow({ nodes: [], edges: [] });
    expect(graph.nodes).toHaveLength(0);
    expect(graph.edges).toHaveLength(0);
  });
});

describe('xyflow parent ordering', () => {
  const baseNode = {
    type: 'node' as const,
    initialNodeId: null,
    label: '',
    data: undefined,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  };

  it('emits parent nodes before their children regardless of authored order', () => {
    // React Flow requires parents to precede children in the nodes array.
    const graph: VisualGraph = {
      id: '',
      mode: 'directed',
      initialNodeId: null,
      direction: 'down',
      nodes: [
        { ...baseNode, id: 'grandchild', parentId: 'child' },
        { ...baseNode, id: 'child', parentId: 'parent' },
        { ...baseNode, id: 'sibling', parentId: 'parent' },
        { ...baseNode, id: 'parent', parentId: null },
      ],
      edges: [],
      data: undefined,
    };
    const flow = toXYFlow(graph);
    const ids = flow.nodes.map((n) => n.id);
    expect(ids.indexOf('parent')).toBeLessThan(ids.indexOf('child'));
    expect(ids.indexOf('parent')).toBeLessThan(ids.indexOf('sibling'));
    expect(ids.indexOf('child')).toBeLessThan(ids.indexOf('grandchild'));
    // Stable within the constraint: child was authored before sibling.
    expect(ids.indexOf('child')).toBeLessThan(ids.indexOf('sibling'));
    // Round-trip keeps every node.
    const out = fromXYFlow(flow);
    expect(out.nodes.map((n) => n.id).sort()).toEqual([
      'child',
      'grandchild',
      'parent',
      'sibling',
    ]);
    expect(out.nodes.find((n) => n.id === 'child')?.parentId).toBe('parent');
  });

  it('keeps authored order for nodes in a parentId cycle instead of hanging', () => {
    const graph: VisualGraph = {
      id: '',
      mode: 'directed',
      initialNodeId: null,
      direction: 'down',
      nodes: [
        { ...baseNode, id: 'a', parentId: 'b' },
        { ...baseNode, id: 'b', parentId: 'a' },
        { ...baseNode, id: 'root', parentId: null },
      ],
      edges: [],
      data: undefined,
    };
    const flow = toXYFlow(graph);
    expect(flow.nodes.map((n) => n.id)).toEqual(['root', 'a', 'b']);
  });
});

describe('xyflow undefined data', () => {
  it('round-trips data: undefined without leaking internal metadata', () => {
    const graph: VisualGraph = {
      id: '',
      mode: 'directed',
      initialNodeId: null,
      direction: 'down',
      nodes: [
        {
          type: 'node',
          id: 'a',
          parentId: null,
          initialNodeId: null,
          label: '',
          data: undefined,
          x: 0,
          y: 0,
          width: 10,
          height: 10,
        },
        {
          type: 'node',
          id: 'b',
          parentId: null,
          initialNodeId: null,
          label: '',
          data: undefined,
          x: 0,
          y: 0,
          width: 10,
          height: 10,
        },
      ],
      edges: [
        {
          type: 'edge',
          id: 'e1',
          sourceId: 'a',
          targetId: 'b',
          label: '',
          data: undefined,
          x: 0,
          y: 0,
          width: 0,
          height: 0,
        },
      ],
      data: undefined,
    };
    const out = fromXYFlow(toXYFlow(graph));
    expect(out.nodes[0].data).toBeUndefined();
    expect(out.edges[0].data).toBeUndefined();
  });
});
