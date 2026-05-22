import { describe, it, expect } from 'vitest';
import { toELK, fromELK } from '../../src/formats/elk';
import type { VisualGraph } from '../../src/types';
import { expectFixtureRoundTrip } from './fixture-roundtrip';

const flatGraph: VisualGraph = {
  id: 'test',
  type: 'directed',
  initialNodeId: null,
  direction: 'down',
  nodes: [
    { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'A', data: undefined, x: 0, y: 0, width: 100, height: 50 },
    { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'B', data: undefined, x: 200, y: 0, width: 100, height: 50 },
    { type: 'node', id: 'c', parentId: null, initialNodeId: null, label: 'C', data: undefined, x: 400, y: 0, width: 100, height: 50 },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: 'go', data: undefined, x: 0, y: 0, width: 0, height: 0 },
    { type: 'edge', id: 'e2', sourceId: 'b', targetId: 'c', label: '', data: undefined, x: 0, y: 0, width: 0, height: 0 },
  ],
  data: undefined,
};

const compoundGraph: VisualGraph = {
  id: 'compound',
  type: 'directed',
  initialNodeId: null,
  direction: 'down',
  nodes: [
    { type: 'node', id: 'parent', parentId: null, initialNodeId: null, label: 'Parent', data: undefined, x: 0, y: 0, width: 300, height: 200 },
    { type: 'node', id: 'child1', parentId: 'parent', initialNodeId: null, label: 'Child 1', data: undefined, x: 10, y: 10, width: 100, height: 50 },
    { type: 'node', id: 'child2', parentId: 'parent', initialNodeId: null, label: 'Child 2', data: undefined, x: 150, y: 10, width: 100, height: 50 },
    { type: 'node', id: 'outside', parentId: null, initialNodeId: null, label: 'Outside', data: undefined, x: 400, y: 0, width: 100, height: 50 },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'child1', targetId: 'child2', label: '', data: undefined, x: 0, y: 0, width: 0, height: 0 },
    { type: 'edge', id: 'e2', sourceId: 'parent', targetId: 'outside', label: 'exit', data: undefined, x: 0, y: 0, width: 0, height: 0 },
  ],
  data: undefined,
};

describe('ELK', () => {
  describe('toELK', () => {
    it('converts flat graph', () => {
      const elk = toELK(flatGraph);
      expect(elk.id).toBe('test');
      expect(elk.children).toHaveLength(3);
      expect(elk.children![0].id).toBe('a');
      expect(elk.children![0].labels).toEqual([{ text: 'A' }]);
      expect(elk.edges).toHaveLength(2);
      expect(elk.edges![0]).toMatchObject({
        id: 'e1',
        sources: ['a'],
        targets: ['b'],
        labels: [{ text: 'go' }],
      });
    });

    it('omits labels array for edges without label', () => {
      const elk = toELK(flatGraph);
      expect(elk.edges![1]).toMatchObject({
        id: 'e2',
        sources: ['b'],
        targets: ['c'],
      });
    });

    it('converts compound graph with hierarchy', () => {
      const elk = toELK(compoundGraph);
      expect(elk.id).toBe('compound');
      expect(elk.layoutOptions).toMatchObject({ 'elk.direction': 'DOWN' });

      // Root has parent + outside nodes
      expect(elk.children).toHaveLength(2);
      const parentElk = elk.children!.find((n) => n.id === 'parent')!;
      expect(parentElk.children).toHaveLength(2);
      expect(parentElk.children![0].id).toBe('child1');

      // Inner edge (child1 -> child2) on parent node
      expect(parentElk.edges).toHaveLength(1);
      expect(parentElk.edges![0].sources).toEqual(['child1']);
      expect(parentElk.edges![0].targets).toEqual(['child2']);

      // Outer edge (parent -> outside) on root
      expect(elk.edges).toHaveLength(1);
      expect(elk.edges![0].sources).toEqual(['parent']);
      expect(elk.edges![0].targets).toEqual(['outside']);
    });

    it('preserves position/size', () => {
      const elk = toELK(flatGraph);
      const node = elk.children![0];
      expect(node.x).toBe(0);
      expect(node.y).toBe(0);
      expect(node.width).toBe(100);
      expect(node.height).toBe(50);
    });
  });

  describe('fromELK', () => {
    it('returns a VisualGraph with direction', () => {
      const graph = fromELK({
        id: 'root',
        children: [{ id: 'a' }],
      });
      expect(graph.direction).toBe('down');
    });

    it('parses flat ELK graph', () => {
      const graph = fromELK({
        id: 'root',
        children: [{ id: 'a' }, { id: 'b' }],
        edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
      });
      expect(graph.id).toBe('root');
      expect(graph.nodes).toHaveLength(2);
      expect(graph.edges).toHaveLength(1);
      expect(graph.edges[0].sourceId).toBe('a');
      expect(graph.edges[0].targetId).toBe('b');
    });

    it('parses compound ELK graph', () => {
      const graph = fromELK({
        id: 'root',
        layoutOptions: { 'elk.direction': 'RIGHT' },
        children: [
          {
            id: 'parent',
            children: [{ id: 'c1' }, { id: 'c2' }],
            edges: [{ id: 'inner', sources: ['c1'], targets: ['c2'] }],
          },
        ],
        edges: [],
      });
      expect(graph.direction).toBe('right');
      expect(graph.nodes).toHaveLength(3);
      const c1 = graph.nodes.find((n) => n.id === 'c1')!;
      expect(c1.parentId).toBe('parent');
      expect(graph.edges).toHaveLength(1);
    });

    it('handles labels', () => {
      const graph = fromELK({
        id: 'root',
        children: [
          { id: 'a', labels: [{ text: 'Node A' }] },
        ],
        edges: [
          { id: 'e1', sources: ['a'], targets: ['a'], labels: [{ text: 'self' }] },
        ],
      });
      expect(graph.nodes[0].label).toBe('Node A');
      expect(graph.edges[0].label).toBe('self');
    });

    it('preserves position data', () => {
      const graph = fromELK({
        id: 'root',
        children: [{ id: 'a', x: 5, y: 10, width: 50, height: 30 }],
      });
      const node = graph.nodes[0];
      expect(node.x).toBe(5);
      expect(node.y).toBe(10);
      expect(node.width).toBe(50);
      expect(node.height).toBe(30);
    });

    it('defaults position to 0 when missing', () => {
      const graph = fromELK({
        id: 'root',
        children: [{ id: 'a' }],
      });
      const node = graph.nodes[0];
      expect(node.x).toBe(0);
      expect(node.y).toBe(0);
      expect(node.width).toBe(0);
      expect(node.height).toBe(0);
    });
  });

  describe('round-trip', () => {
    it('round-trips flat graph', () => {
      const elk = toELK(flatGraph);
      const parsed = fromELK(elk);
      expect(parsed.id).toBe('test');
      expect(parsed.nodes).toHaveLength(3);
      expect(parsed.edges).toHaveLength(2);
      expect(parsed.nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    });

    it('round-trips compound graph', () => {
      const elk = toELK(compoundGraph);
      const parsed = fromELK(elk);
      expect(parsed.id).toBe('compound');
      expect(parsed.direction).toBe('down');
      expect(parsed.nodes).toHaveLength(4);
      expect(parsed.edges).toHaveLength(2);
      const child1 = parsed.nodes.find((n) => n.id === 'child1')!;
      expect(child1.parentId).toBe('parent');
    });

    it('round-trips visual graph metadata through ELK layout options', () => {
      expectFixtureRoundTrip((graph) => fromELK(toELK(graph as VisualGraph)), {
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
      });
    });
  });
});
