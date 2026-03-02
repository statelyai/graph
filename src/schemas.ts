import * as z from 'zod';

const StyleSchema = z.record(z.string(), z.union([z.string(), z.number()]));

export const NodeSchema = z.object({
  type: z.literal('node'),
  id: z.string(),
  parentId: z.string().nullable().optional(),
  initialNodeId: z.string().nullable().optional(),
  label: z.string(),
  data: z.any(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  shape: z.string().optional(),
  color: z.string().optional(),
  style: StyleSchema.optional(),
});

export const EdgeSchema = z.object({
  type: z.literal('edge'),
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  label: z.string(),
  data: z.any(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  color: z.string().optional(),
  style: StyleSchema.optional(),
});

export const GraphSchema = z.object({
  id: z.string(),
  type: z.enum(['directed', 'undirected']),
  initialNodeId: z.string().nullable(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  data: z.any(),
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  style: StyleSchema.optional(),
});
