import { describe, it, expect, expectTypeOf } from 'vitest';
import * as z from 'zod';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  GraphSchema,
  NodeSchema,
  EdgeSchema,
  getGraphEdgeIssues,
  getGraphIssues,
  getGraphNodeIssues,
  getGraphPortIssues,
  isGraph,
  isGraphEdge,
  isGraphNode,
  isGraphPort,
  validateGraph,
} from '../src/schemas';
import { createGraph } from '../src/graph';
import type { GraphNode, GraphEdge, Graph } from '../src/types';
import { getFullyFeaturedGraphFixture } from './fixtures';

describe('Zod schemas', () => {
  it('NodeSchema validates a valid node', () => {
    const result = NodeSchema.safeParse({
      type: 'node',
      id: 'n1',
      parentId: null,
      initialNodeId: null,
      label: 'Test',
      data: { color: 'red' },
      ports: [{ name: 'out', direction: 'out', data: { kind: 'result' } }],
    });
    expect(result.success).toBe(true);
  });

  it('NodeSchema rejects missing id', () => {
    const result = NodeSchema.safeParse({
      type: 'node',
      parentId: null,
      label: 'Test',
    });
    expect(result.success).toBe(false);
  });

  it('EdgeSchema validates a valid edge', () => {
    const result = EdgeSchema.safeParse({
      type: 'edge',
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      sourcePort: 'out',
      targetPort: 'in',
      label: '',
      data: null,
    });
    expect(result.success).toBe(true);
  });

  it('GraphSchema validates a valid graph', () => {
    const result = GraphSchema.safeParse({
      id: 'g1',
      mode: 'directed',
      initialNodeId: null,
      nodes: [
        { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'A', data: null },
      ],
      edges: [],
      data: null,
    });
    expect(result.success).toBe(true);
  });

  it('GraphSchema validates createGraph() defaults', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });

    expect(GraphSchema.safeParse(graph).success).toBe(true);
  });

  it('GraphSchema rejects invalid mode', () => {
    const result = GraphSchema.safeParse({
      id: 'g1',
      mode: 'mixed',
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });

  it('schemas preserve all known graph fields from the fully featured fixture', () => {
    const graph = getFullyFeaturedGraphFixture();

    expect(graph.nodes[1].ports?.[0]?.name).toBe('out');
    expect(graph.edges[0].sourcePort).toBe('out');
    expect(NodeSchema.parse(graph.nodes[0])).toEqual(graph.nodes[0]);
    expect(EdgeSchema.parse(graph.edges[0])).toEqual(graph.edges[0]);
    expect(GraphSchema.parse(graph)).toEqual(graph);
  });

  it('NodeSchema stays in sync with GraphNode type', () => {
    expectTypeOf<z.infer<typeof NodeSchema>>().toMatchTypeOf<GraphNode>();
    expectTypeOf<GraphNode>().toMatchTypeOf<z.infer<typeof NodeSchema>>();
    expectTypeOf<keyof z.infer<typeof NodeSchema>>().toEqualTypeOf<keyof GraphNode>();
  });

  it('EdgeSchema stays in sync with GraphEdge type', () => {
    expectTypeOf<z.infer<typeof EdgeSchema>>().toMatchTypeOf<GraphEdge>();
    expectTypeOf<GraphEdge>().toMatchTypeOf<z.infer<typeof EdgeSchema>>();
    expectTypeOf<keyof z.infer<typeof EdgeSchema>>().toEqualTypeOf<keyof GraphEdge>();
  });

  it('GraphSchema stays in sync with Graph type', () => {
    expectTypeOf<z.infer<typeof GraphSchema>>().toMatchTypeOf<Graph>();
    expectTypeOf<Graph>().toMatchTypeOf<z.infer<typeof GraphSchema>>();
    expectTypeOf<keyof z.infer<typeof GraphSchema>>().toEqualTypeOf<keyof Graph>();
  });

  it('produces JSON Schema via z.toJSONSchema()', () => {
    const jsonSchema = z.toJSONSchema(GraphSchema);
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toHaveProperty('id');
    expect(jsonSchema.properties).toHaveProperty('nodes');
    expect(jsonSchema.properties).toHaveProperty('edges');
  });

  it('generated JSON schemas stay in sync with port fields', () => {
    const nodeJsonSchema = JSON.parse(
      readFileSync(join(process.cwd(), 'schemas/node.schema.json'), 'utf8'),
    ) as {
      properties: Record<string, unknown>;
    };
    const edgeJsonSchema = JSON.parse(
      readFileSync(join(process.cwd(), 'schemas/edge.schema.json'), 'utf8'),
    ) as {
      properties: Record<string, unknown>;
    };

    expect(nodeJsonSchema.properties).toHaveProperty('ports');
    expect(edgeJsonSchema.properties).toHaveProperty('sourcePort');
    expect(edgeJsonSchema.properties).toHaveProperty('targetPort');
  });

  it('exposes non-Zod validation helpers', () => {
    const graph = getFullyFeaturedGraphFixture();

    expect(isGraph(graph)).toBe(true);
    expect(isGraphNode(graph.nodes[1])).toBe(true);
    expect(isGraphEdge(graph.edges[0])).toBe(true);
    expect(isGraphPort(graph.nodes[1].ports?.[0])).toBe(true);
    expect(getGraphIssues(graph)).toEqual([]);
  });

  it('validateGraph() combines shape and graph invariant validation', () => {
    const graph = {
      id: 'g1',
      mode: 'directed',
      initialNodeId: 'missing-initial',
      nodes: [
        {
          type: 'node',
          id: 'a',
          parentId: null,
          initialNodeId: null,
          label: null,
          data: null,
          ports: [
            { name: 'out', direction: 'out', data: null },
            { name: 'out', direction: 'in', data: null },
          ],
        },
        {
          type: 'node',
          id: 'a',
          parentId: 'missing-parent',
          initialNodeId: null,
          label: null,
          data: null,
        },
      ],
      edges: [
        {
          type: 'edge',
          id: 'e1',
          sourceId: 'a',
          targetId: 'missing-target',
          sourcePort: 'missing-port',
          label: null,
          data: null,
        },
      ],
      data: null,
    };

    expect(validateGraph(graph).map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'missing_initial_node',
        'duplicate_node_id',
        'duplicate_port_name',
        'missing_parent',
        'missing_target_node',
        'missing_source_port',
      ]),
    );
    expect(isGraph(graph)).toBe(false);
  });

  it('validateGraph() reports parent cycles', () => {
    const graph = {
      id: 'g1',
      mode: 'directed',
      initialNodeId: null,
      nodes: [
        {
          type: 'node',
          id: 'a',
          parentId: 'b',
          initialNodeId: null,
          label: null,
          data: null,
        },
        {
          type: 'node',
          id: 'b',
          parentId: 'a',
          initialNodeId: null,
          label: null,
          data: null,
        },
      ],
      edges: [],
      data: null,
    };

    expect(validateGraph(graph).map((issue) => issue.code)).toContain(
      'parent_cycle',
    );
  });

  it('reports simplified validation issues', () => {
    expect(getGraphIssues({ id: 'g' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['nodes'],
        }),
        expect.objectContaining({
          path: ['edges'],
        }),
      ]),
    );
    expect(getGraphNodeIssues({ type: 'node' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['id'],
        }),
      ]),
    );
    expect(getGraphEdgeIssues({ type: 'edge', id: 'e1' })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['sourceId'],
        }),
        expect.objectContaining({
          path: ['targetId'],
        }),
      ]),
    );
    expect(getGraphPortIssues({})).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ['name'],
        }),
      ]),
    );
  });
});
