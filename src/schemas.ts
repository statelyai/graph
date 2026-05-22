import * as z from 'zod';
import type { Graph, GraphEdge, GraphNode, GraphPort } from './types';

const StyleSchema = z.record(z.string(), z.union([z.string(), z.number()]));
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

function getDuplicateIndexes<T>(
  items: T[],
  getKey: (item: T) => string | undefined | null,
): Map<string, number[]> {
  const indexesByKey = new Map<string, number[]>();
  items.forEach((item, index) => {
    const key = getKey(item);
    if (key == null) return;
    const indexes = indexesByKey.get(key) ?? [];
    indexes.push(index);
    indexesByKey.set(key, indexes);
  });
  for (const [key, indexes] of indexesByKey) {
    if (indexes.length < 2) indexesByKey.delete(key);
  }
  return indexesByKey;
}

function getGraphInvariantIssues(graph: Graph): GraphValidationIssue[] {
  const issues: GraphValidationIssue[] = [];
  const nodeIndexes = new Map<string, number>();
  const nodesById = new Map<string, GraphNode>();

  for (const [id, indexes] of getDuplicateIndexes(
    graph.nodes,
    (node) => node.id,
  )) {
    for (const index of indexes) {
      issues.push(
        createIssue('duplicate_node_id', `Duplicate node id "${id}"`, [
          'nodes',
          index,
          'id',
        ]),
      );
    }
  }

  for (const [id, indexes] of getDuplicateIndexes(
    graph.edges,
    (edge) => edge.id,
  )) {
    for (const index of indexes) {
      issues.push(
        createIssue('duplicate_edge_id', `Duplicate edge id "${id}"`, [
          'edges',
          index,
          'id',
        ]),
      );
    }
  }

  graph.nodes.forEach((node, index) => {
    nodeIndexes.set(node.id, index);
    nodesById.set(node.id, node);
  });

  if (graph.initialNodeId && !nodeIndexes.has(graph.initialNodeId)) {
    issues.push(
      createIssue(
        'missing_initial_node',
        `Initial node "${graph.initialNodeId}" does not exist`,
        ['initialNodeId'],
      ),
    );
  }

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
    } else if (node.parentId != null && !nodeIndexes.has(node.parentId)) {
      issues.push(
        createIssue(
          'missing_parent',
          `Parent node "${node.parentId}" does not exist`,
          ['nodes', index, 'parentId'],
        ),
      );
    }
    if (node.initialNodeId && !nodeIndexes.has(node.initialNodeId)) {
      issues.push(
        createIssue(
          'missing_node_initial',
          `Initial node "${node.initialNodeId}" does not exist`,
          ['nodes', index, 'initialNodeId'],
        ),
      );
    }
    for (const [name, indexes] of getDuplicateIndexes(
      node.ports ?? [],
      (port) => port.name,
    )) {
      for (const portIndex of indexes) {
        issues.push(
          createIssue(
            'duplicate_port_name',
            `Duplicate port name "${name}" on node "${node.id}"`,
            ['nodes', index, 'ports', portIndex, 'name'],
          ),
        );
      }
    }
  });

  for (const node of graph.nodes) {
    const seen = new Set<string>();
    let current: string | null | undefined = node.parentId;
    while (current != null) {
      if (current === node.id || seen.has(current)) {
        issues.push(
          createIssue(
            'parent_cycle',
            `Node "${node.id}" is part of a parent cycle`,
            ['nodes', nodeIndexes.get(node.id) ?? 0, 'parentId'],
          ),
        );
        break;
      }
      seen.add(current);
      current = nodesById.get(current)?.parentId;
    }
  }

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
    const source = nodesById.get(edge.sourceId);
    const target = nodesById.get(edge.targetId);
    if (!source) {
      issues.push(
        createIssue(
          'missing_source_node',
          `Source node "${edge.sourceId}" does not exist`,
          ['edges', index, 'sourceId'],
        ),
      );
    }
    if (!target) {
      issues.push(
        createIssue(
          'missing_target_node',
          `Target node "${edge.targetId}" does not exist`,
          ['edges', index, 'targetId'],
        ),
      );
    }
    if (
      source &&
      edge.sourcePort !== undefined &&
      !source.ports?.some((port) => port.name === edge.sourcePort)
    ) {
      issues.push(
        createIssue(
          'missing_source_port',
          `Port "${edge.sourcePort}" does not exist on source node "${edge.sourceId}"`,
          ['edges', index, 'sourcePort'],
        ),
      );
    }
    if (
      target &&
      edge.targetPort !== undefined &&
      !target.ports?.some((port) => port.name === edge.targetPort)
    ) {
      issues.push(
        createIssue(
          'missing_target_port',
          `Port "${edge.targetPort}" does not exist on target node "${edge.targetId}"`,
          ['edges', index, 'targetPort'],
        ),
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
