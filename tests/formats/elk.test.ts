import { describe, it, expect } from 'vitest';
import { toELK, fromELK } from '../../src/formats/elk';
import { getFormatSupportEntry } from '../../src/formats/support';
import type { VisualGraph } from '../../src/types';
import { expectFixtureRoundTrip } from './fixture-roundtrip';

const flatGraph: VisualGraph = {
  id: 'test',
  mode: 'directed',
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
  mode: 'directed',
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

const sharedPortNameGraph: VisualGraph = {
  id: 'ports',
  mode: 'directed',
  initialNodeId: null,
  direction: 'down',
  nodes: [
    {
      type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'A', data: undefined, x: 0, y: 0, width: 100, height: 50,
      ports: [{ name: 'p', direction: 'out', data: undefined, x: 100, y: 25, width: 8, height: 8 }],
    },
    {
      type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'B', data: undefined, x: 200, y: 0, width: 100, height: 50,
      ports: [{ name: 'p', direction: 'in', data: undefined, x: 0, y: 25, width: 8, height: 8 }],
    },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', sourcePort: 'p', targetPort: 'p', label: '', data: undefined, x: 0, y: 0, width: 0, height: 0 },
  ],
  data: undefined,
};

/** Removes all statelyai metadata blobs, simulating external ELK input. */
function stripMetadata(elkNode: any): void {
  if (elkNode.layoutOptions) {
    delete elkNode.layoutOptions['statelyai.metadata'];
    if (Object.keys(elkNode.layoutOptions).length === 0) {
      delete elkNode.layoutOptions;
    }
  }
  for (const child of elkNode.children ?? []) stripMetadata(child);
  for (const port of elkNode.ports ?? []) stripMetadata(port);
  for (const edge of elkNode.edges ?? []) stripMetadata(edge);
}

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

  describe('ports', () => {
    it('emits globally-unique port ids qualified by node id', () => {
      const elk = toELK(sharedPortNameGraph);
      const a = elk.children!.find((n) => n.id === 'a')!;
      const b = elk.children!.find((n) => n.id === 'b')!;
      expect(a.ports![0].id).toBe('a__p');
      expect(b.ports![0].id).toBe('b__p');
      // All ids in the document are unique
      const ids = [
        elk.id,
        ...elk.children!.map((n) => n.id),
        ...elk.children!.flatMap((n) => (n.ports ?? []).map((p) => p.id)),
        ...elk.edges!.map((e) => e.id),
      ];
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('references qualified port ids in edge sources/targets', () => {
      const elk = toELK(sharedPortNameGraph);
      expect(elk.edges![0].sources).toEqual(['a__p']);
      expect(elk.edges![0].targets).toEqual(['b__p']);
    });

    it('round-trips port names when two nodes share a port name', () => {
      const parsed = fromELK(toELK(sharedPortNameGraph));
      const a = parsed.nodes.find((n) => n.id === 'a')!;
      const b = parsed.nodes.find((n) => n.id === 'b')!;
      expect(a.ports![0].name).toBe('p');
      expect(b.ports![0].name).toBe('p');
      expect(parsed.edges[0]).toMatchObject({
        sourceId: 'a',
        targetId: 'b',
        sourcePort: 'p',
        targetPort: 'p',
      });
    });

    it('resolves correct endpoints for shared port names when metadata is stripped', () => {
      const elk = toELK(sharedPortNameGraph);
      stripMetadata(elk);
      const parsed = fromELK(elk);
      expect(parsed.edges).toHaveLength(1);
      expect(parsed.edges[0].sourceId).toBe('a');
      expect(parsed.edges[0].targetId).toBe('b');
      // Port references stay consistent with the parsed node port names
      const a = parsed.nodes.find((n) => n.id === 'a')!;
      const b = parsed.nodes.find((n) => n.id === 'b')!;
      expect(a.ports!.map((p) => p.name)).toContain(parsed.edges[0].sourcePort);
      expect(b.ports!.map((p) => p.name)).toContain(parsed.edges[0].targetPort);
    });

    it('resolves correct endpoints for external ELK input with ports and no metadata', () => {
      const parsed = fromELK({
        id: 'root',
        children: [
          { id: 'a', ports: [{ id: 'a_out' }] },
          { id: 'b', ports: [{ id: 'b_in' }] },
        ],
        edges: [{ id: 'e1', sources: ['a_out'], targets: ['b_in'] }],
      });
      const a = parsed.nodes.find((n) => n.id === 'a')!;
      expect(a.ports![0].name).toBe('a_out');
      expect(parsed.edges[0]).toMatchObject({
        sourceId: 'a',
        targetId: 'b',
        sourcePort: 'a_out',
        targetPort: 'b_in',
      });
    });

    it('documents document-unique port ids in the support matrix', () => {
      const elk = getFormatSupportEntry('elk');
      expect(elk?.features.ports).toBe('full');
      const notes = elk?.notes.join('\n') ?? '';
      expect(notes).toContain('document-unique');
      expect(notes).not.toContain('mis-resolve');
    });

    it('still parses old self-produced format (bare port ids + metadata blobs)', () => {
      // Output shape produced before port ids were node-qualified.
      const oldFormat = {
        id: 'old',
        layoutOptions: {
          'elk.direction': 'DOWN',
          'statelyai.metadata': JSON.stringify({
            graph: { id: 'old', mode: 'directed', initialNodeId: null, direction: 'down' },
          }),
        },
        children: [
          {
            id: 'a',
            x: 0, y: 0, width: 100, height: 50,
            ports: [
              {
                id: 'out',
                x: 100, y: 25, width: 8, height: 8,
                layoutOptions: {
                  'org.eclipse.elk.port.side': 'EAST',
                  'statelyai.metadata': JSON.stringify({ port: {} }),
                },
              },
            ],
          },
          { id: 'b', x: 200, y: 0, width: 100, height: 50 },
        ],
        edges: [
          {
            id: 'e1',
            sources: ['out'],
            targets: ['b'],
            layoutOptions: {
              'statelyai.metadata': JSON.stringify({
                edge: { sourceId: 'a', targetId: 'b', sourcePort: 'out', label: '' },
              }),
            },
          },
        ],
      };
      const parsed = fromELK(oldFormat);
      const a = parsed.nodes.find((n) => n.id === 'a')!;
      expect(a.ports![0].name).toBe('out');
      expect(parsed.edges[0]).toMatchObject({
        sourceId: 'a',
        targetId: 'b',
        sourcePort: 'out',
      });
      expect(parsed.edges[0].targetPort).toBeUndefined();
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
