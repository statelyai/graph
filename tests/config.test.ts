import { describe, it, expect } from 'vitest';
import { toNodeConfig, toEdgeConfig } from '../src/config';
import { createGraphNode, createGraphEdge } from '../src/graph';
import type { GraphNode, GraphEdge } from '../src/types';

describe('toNodeConfig', () => {
  it('round-trips a full-featured node through createGraphNode', () => {
    const node: GraphNode = createGraphNode({
      id: 'n1',
      parentId: 'p1',
      initialNodeId: 'c1',
      label: 'Node One',
      data: { kind: 'state', nested: { deep: true } },
      ports: [
        {
          name: 'in1',
          direction: 'in',
          label: 'Input',
          data: { signal: 'clk' },
          x: 1,
          y: 2,
          width: 3,
          height: 4,
          style: { fill: 'red' },
        },
        { name: 'out1', direction: 'out' },
      ],
      x: 10,
      y: 20,
      width: 100,
      height: 50,
      shape: 'rect',
      color: 'blue',
      style: { stroke: 'black', strokeWidth: 2 },
    });

    const roundTripped = createGraphNode(toNodeConfig(node));
    expect(roundTripped).toEqual(node);
  });

  it('round-trips a minimal node', () => {
    const node = createGraphNode({ id: 'min' });
    expect(createGraphNode(toNodeConfig(node))).toEqual(node);
  });

  it('deep-copies ports — mutating the config does not affect the source node', () => {
    const node = createGraphNode({
      id: 'n1',
      ports: [{ name: 'p1', direction: 'in' }],
    });

    const config = toNodeConfig(node);
    config.ports![0].name = 'mutated';
    config.ports![0].direction = 'out';

    expect(node.ports![0].name).toBe('p1');
    expect(node.ports![0].direction).toBe('in');
  });

  it('keeps absent optional fields absent', () => {
    const node = createGraphNode({ id: 'n1' });
    const config = toNodeConfig(node);

    expect(config).toEqual({ id: 'n1' });
    expect('parentId' in config).toBe(false);
    expect('initialNodeId' in config).toBe(false);
    expect('ports' in config).toBe(false);
    expect('x' in config).toBe(false);
    expect('shape' in config).toBe(false);
    expect('style' in config).toBe(false);
  });
});

describe('toEdgeConfig', () => {
  it('round-trips a full-featured edge through createGraphEdge', () => {
    const edge: GraphEdge = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      label: 'Edge One',
      data: { event: 'CLICK', nested: { deep: true } },
      weight: 3.5,
      mode: 'undirected',
      sourcePort: 'out1',
      targetPort: 'in1',
      x: 5,
      y: 6,
      width: 7,
      height: 8,
      color: 'green',
      style: { dashed: true },
    });

    const roundTripped = createGraphEdge(toEdgeConfig(edge));
    expect(roundTripped).toEqual(edge);
  });

  it('round-trips a minimal edge', () => {
    const edge = createGraphEdge({ id: 'e1', sourceId: 'a', targetId: 'b' });
    expect(createGraphEdge(toEdgeConfig(edge))).toEqual(edge);
  });

  it('keeps absent optional fields absent', () => {
    const edge = createGraphEdge({ id: 'e1', sourceId: 'a', targetId: 'b' });
    const config = toEdgeConfig(edge);

    expect(config).toEqual({ id: 'e1', sourceId: 'a', targetId: 'b' });
    expect('weight' in config).toBe(false);
    expect('mode' in config).toBe(false);
    expect('sourcePort' in config).toBe(false);
    expect('targetPort' in config).toBe(false);
    expect('x' in config).toBe(false);
    expect('color' in config).toBe(false);
    expect('style' in config).toBe(false);
  });
});
