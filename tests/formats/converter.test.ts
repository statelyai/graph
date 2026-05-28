import { describe, it, expect } from 'vitest';
import {
  createFormatConverter,
  adjacencyListConverter,
  edgeListConverter,
} from '../../src/formats/converter';
import { graphmlConverter } from '../../src/formats/graphml';
import type { Graph, GraphFormatConverter } from '../../src/types';

const sampleGraph: Graph = {
  id: 'test',
  mode: 'directed',
  initialNodeId: null,
  nodes: [
    { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'A', data: undefined },
    { type: 'node', id: 'b', parentId: null, initialNodeId: null, label: 'B', data: undefined },
    { type: 'node', id: 'c', parentId: null, initialNodeId: null, label: '', data: undefined },
  ],
  edges: [
    { type: 'edge', id: 'e1', sourceId: 'a', targetId: 'b', label: '', data: undefined },
    { type: 'edge', id: 'e2', sourceId: 'b', targetId: 'c', label: '', data: undefined },
  ],
  data: undefined,
};

describe('createFormatConverter', () => {
  it('creates a converter from to/from functions', () => {
    const converter = createFormatConverter<string>(
      (graph) => JSON.stringify(graph),
      (input) => JSON.parse(input),
    );

    const serialized = converter.to(sampleGraph);
    const deserialized = converter.from(serialized);

    expect(deserialized.id).toBe('test');
    expect(deserialized.nodes).toHaveLength(3);
    expect(deserialized.edges).toHaveLength(2);
  });

  it('returned object satisfies GraphFormatConverter', () => {
    const converter: GraphFormatConverter<string> = createFormatConverter(
      (graph) => JSON.stringify(graph),
      (input) => JSON.parse(input),
    );

    expect(typeof converter.to).toBe('function');
    expect(typeof converter.from).toBe('function');
  });
});

describe('adjacencyListConverter', () => {
  it('round-trips graph structure', () => {
    const adj = adjacencyListConverter.to(sampleGraph);

    expect(adj).toEqual({
      a: ['b'],
      b: ['c'],
      c: [],
    });

    const graph = adjacencyListConverter.from(adj);
    expect(graph.mode).toBe('directed');
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
  });
});

describe('edgeListConverter', () => {
  it('round-trips graph structure', () => {
    const edges = edgeListConverter.to(sampleGraph);

    expect(edges).toEqual([
      ['a', 'b'],
      ['b', 'c'],
    ]);

    const graph = edgeListConverter.from(edges);
    expect(graph.mode).toBe('directed');
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
  });
});

describe('graphmlConverter', () => {
  it('round-trips graph through XML', () => {
    const xml = graphmlConverter.to(sampleGraph);
    expect(xml).toContain('<graphml');

    const graph = graphmlConverter.from(xml);
    expect(graph.id).toBe('test');
    expect(graph.mode).toBe('directed');
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
  });
});

describe('custom converter (third-party example)', () => {
  it('allows implementing GraphFormatConverter for a custom format', () => {
    // Simulates a third-party CSV-like format
    const csvConverter: GraphFormatConverter<string> = {
      to(graph) {
        return graph.edges
          .map((e) => `${e.sourceId},${e.targetId}`)
          .join('\n');
      },
      from(input) {
        const edges = input
          .split('\n')
          .filter(Boolean)
          .map((line, i) => {
            const [sourceId, targetId] = line.split(',');
            return {
              type: 'edge' as const,
              id: `e${i}`,
              sourceId,
              targetId,
              label: '',
              data: undefined as any,
            };
          });

        const nodeIds = new Set<string>();
        for (const e of edges) {
          nodeIds.add(e.sourceId);
          nodeIds.add(e.targetId);
        }

        return {
          id: '',
          mode: 'directed',
          initialNodeId: null,
          nodes: [...nodeIds].map((id) => ({
            type: 'node' as const,
            id,
            parentId: null,
            initialNodeId: null,
            label: '',
            data: undefined as any,
          })),
          edges,
          data: undefined as any,
        };
      },
    };

    const csv = csvConverter.to(sampleGraph);
    expect(csv).toBe('a,b\nb,c');

    const graph = csvConverter.from(csv);
    expect(graph.nodes).toHaveLength(3);
    expect(graph.edges).toHaveLength(2);
    expect(graph.edges[0].sourceId).toBe('a');
    expect(graph.edges[0].targetId).toBe('b');
  });
});
