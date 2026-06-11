import * as z from 'zod';
import type { Graph, GraphEdge, GraphNode, GraphPort } from './types';
import {
  getGraphIssues as getStructuralGraphIssues,
  type GraphIssue,
} from './validate';

const StyleSchema = z.record(
  z.string(),
  z.union([z.string(), z.number(), z.boolean()]),
);

const ModeSchema = z.enum(['directed', 'undirected', 'bidirectional']);
const PortDirectionSchema = z.enum(['in', 'out', 'inout']);

export const PortSchema = z.object({
  name: z.string(),
  direction: PortDirectionSchema,
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
  mode: ModeSchema.optional(),
  points: z
    .array(z.object({ x: z.number(), y: z.number() }))
    .optional(),
  routing: z.enum(['polyline', 'orthogonal', 'splines']).optional(),
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
  mode: ModeSchema,
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
  return validateGraph(value).length === 0;
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
  return validateGraph(value);
}

function createIssue(
  code: string,
  message: string,
  path: Array<string | number>,
): GraphValidationIssue {
  return { code, message, path };
}

/** Maps structural issue codes from `validate.ts` to this module's codes. */
const STRUCTURAL_CODE_MAP: Record<string, string> = {
  'duplicate-node-id': 'duplicate_node_id',
  'duplicate-edge-id': 'duplicate_edge_id',
  'missing-initial-node': 'missing_initial_node',
  'missing-parent': 'missing_parent',
  'missing-node-initial': 'missing_node_initial',
  'duplicate-port-name': 'duplicate_port_name',
  'parent-cycle': 'parent_cycle',
  'missing-source-port': 'missing_source_port',
  'missing-target-port': 'missing_target_port',
};

function toValidationIssue(issue: GraphIssue): GraphValidationIssue {
  const path = issue.path ?? [];
  let code = STRUCTURAL_CODE_MAP[issue.code] ?? issue.code;
  if (issue.code === 'dangling-edge-endpoint') {
    code =
      path[path.length - 1] === 'sourceId'
        ? 'missing_source_node'
        : 'missing_target_node';
  }
  return { code, message: issue.message, path };
}

function getGraphInvariantIssues(graph: Graph): GraphValidationIssue[] {
  // Structural invariants (dangling references, duplicates, cycles, ports)
  // are delegated to getGraphIssues() in validate.ts.
  const issues = getStructuralGraphIssues(graph).map(toValidationIssue);

  // Empty-string ids pass the structural checks above (they are treated as
  // ordinary, possibly-dangling references) but are rejected here.
  graph.nodes.forEach((node, index) => {
    if (node.id === '') {
      issues.push(
        createIssue('empty_node_id', 'Node id must be a non-empty string', [
          'nodes',
          index,
          'id',
        ]),
      );
    }
    if (node.parentId === '') {
      issues.push(
        createIssue(
          'empty_parent_id',
          'Node parentId must be a non-empty string',
          ['nodes', index, 'parentId'],
        ),
      );
    }
  });

  graph.edges.forEach((edge, index) => {
    if (edge.id === '') {
      issues.push(
        createIssue('empty_edge_id', 'Edge id must be a non-empty string', [
          'edges',
          index,
          'id',
        ]),
      );
    }
  });

  return issues;
}

export function validateGraph(value: unknown): GraphValidationIssue[] {
  const shapeResult = GraphSchema.safeParse(value);
  if (!shapeResult.success) {
    return shapeResult.error.issues.map((issue) => ({
      code: issue.code,
      message: issue.message,
      path: issue.path.map((segment) =>
        typeof segment === 'symbol' ? String(segment) : segment,
      ),
    }));
  }
  return getGraphInvariantIssues(shapeResult.data as Graph);
}
