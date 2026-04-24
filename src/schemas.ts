import * as z from 'zod';
import type { Graph, GraphEdge, GraphNode, GraphPort } from './types';

const StyleSchema = z.record(z.string(), z.union([z.string(), z.number()]));
const PortDirectionSchema = z.enum(['in', 'out', 'inout']);

export const PortSchema = z.object({
  name: z.string(),
  direction: PortDirectionSchema.optional(),
  label: z.string().optional(),
  data: z.any(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  style: StyleSchema.optional(),
});

export const NodeSchema = z.object({
  type: z.literal('node'),
  id: z.string(),
  parentId: z.string().nullable().optional(),
  initialNodeId: z.string().nullable().optional(),
  label: z.string().nullable().optional(),
  data: z.any(),
  x: z.number().optional(),
  y: z.number().optional(),
  width: z.number().optional(),
  height: z.number().optional(),
  shape: z.string().optional(),
  color: z.string().optional(),
  style: StyleSchema.optional(),
  ports: z.array(PortSchema).optional(),
});

export const EdgeSchema = z.object({
  type: z.literal('edge'),
  id: z.string(),
  sourceId: z.string(),
  targetId: z.string(),
  label: z.string().nullable().optional(),
  weight: z.number().optional(),
  sourcePort: z.string().optional(),
  targetPort: z.string().optional(),
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
  initialNodeId: z.string().nullable().optional(),
  nodes: z.array(NodeSchema),
  edges: z.array(EdgeSchema),
  data: z.any(),
  direction: z.enum(['up', 'down', 'left', 'right']).optional(),
  style: StyleSchema.optional(),
});

export interface GraphValidationIssue {
  code: string;
  message: string;
  path: Array<string | number>;
}

function getValidationIssues<T>(
  schema: z.ZodType<T>,
  value: unknown,
): GraphValidationIssue[] {
  const result = schema.safeParse(value);

  if (result.success) {
    return [];
  }

  return result.error.issues.map((issue) => ({
    code: issue.code,
    message: issue.message,
    path: issue.path.map((segment) =>
      typeof segment === 'symbol' ? String(segment) : segment,
    ),
  }));
}

export function isGraphPort(value: unknown): value is GraphPort {
  return PortSchema.safeParse(value).success;
}

export function isGraphNode(value: unknown): value is GraphNode {
  return NodeSchema.safeParse(value).success;
}

export function isGraphEdge(value: unknown): value is GraphEdge {
  return EdgeSchema.safeParse(value).success;
}

export function isGraph(value: unknown): value is Graph {
  return GraphSchema.safeParse(value).success;
}

export function getGraphPortIssues(value: unknown): GraphValidationIssue[] {
  return getValidationIssues(PortSchema, value);
}

export function getGraphNodeIssues(value: unknown): GraphValidationIssue[] {
  return getValidationIssues(NodeSchema, value);
}

export function getGraphEdgeIssues(value: unknown): GraphValidationIssue[] {
  return getValidationIssues(EdgeSchema, value);
}

export function getGraphIssues(value: unknown): GraphValidationIssue[] {
  return getValidationIssues(GraphSchema, value);
}
