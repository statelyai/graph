import { describe, it, expect, expectTypeOf } from 'vitest';
import * as z from 'zod';
import { GraphSchema, NodeSchema, EdgeSchema } from '../src/schemas';
import type { GraphNode, GraphEdge, Graph } from '../src/types';

describe('Zod schemas', () => {
  it('NodeSchema validates a valid node', () => {
    const result = NodeSchema.safeParse({
      type: 'node',
      id: 'n1',
      parentId: null,
      initialNodeId: null,
      label: 'Test',
      data: { color: 'red' },
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
      label: '',
      data: null,
    });
    expect(result.success).toBe(true);
  });

  it('GraphSchema validates a valid graph', () => {
    const result = GraphSchema.safeParse({
      id: 'g1',
      type: 'directed',
      initialNodeId: null,
      nodes: [
        { type: 'node', id: 'a', parentId: null, initialNodeId: null, label: 'A', data: null },
      ],
      edges: [],
      data: null,
    });
    expect(result.success).toBe(true);
  });

  it('GraphSchema rejects invalid type', () => {
    const result = GraphSchema.safeParse({
      id: 'g1',
      type: 'mixed',
      nodes: [],
      edges: [],
    });
    expect(result.success).toBe(false);
  });

  it('NodeSchema stays in sync with GraphNode type', () => {
    expectTypeOf<z.infer<typeof NodeSchema>>().toMatchTypeOf<GraphNode>();
    expectTypeOf<GraphNode>().toMatchTypeOf<z.infer<typeof NodeSchema>>();
  });

  it('EdgeSchema stays in sync with GraphEdge type', () => {
    expectTypeOf<z.infer<typeof EdgeSchema>>().toMatchTypeOf<GraphEdge>();
    expectTypeOf<GraphEdge>().toMatchTypeOf<z.infer<typeof EdgeSchema>>();
  });

  it('GraphSchema stays in sync with Graph type', () => {
    expectTypeOf<z.infer<typeof GraphSchema>>().toMatchTypeOf<Graph>();
    expectTypeOf<Graph>().toMatchTypeOf<z.infer<typeof GraphSchema>>();
  });

  it('produces JSON Schema via z.toJSONSchema()', () => {
    const jsonSchema = z.toJSONSchema(GraphSchema);
    expect(jsonSchema.type).toBe('object');
    expect(jsonSchema.properties).toHaveProperty('id');
    expect(jsonSchema.properties).toHaveProperty('nodes');
    expect(jsonSchema.properties).toHaveProperty('edges');
  });
});
