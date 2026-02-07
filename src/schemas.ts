import * as z from 'zod';

export const NodeSchema = z.object({
  type: z.literal('node'),
  id: z.string(),
  parentId: z.string().nullable(),
  initialNodeId: z.string().nullable(),
  label: z.string(),
  data: z.any(),
});

export const EdgeSchema = z.object({
  type: z.literal('edge'),
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  label: z.string(),
  data: z.any(),
});

export const GraphSchema = z.object({
  id: z.string(),
  type: z.enum(['directed', 'undirected']),
  initialNodeId: z.string().nullable(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  data: z.any(),
});
