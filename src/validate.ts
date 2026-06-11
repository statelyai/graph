import type { Graph, GraphNode } from './types';

/**
 * A structural problem found in a graph by {@link getGraphIssues}.
 */
export interface GraphIssue {
  /** Stable machine-readable code, e.g. `'duplicate-node-id'`. */
  code: string;
  /** What is wrong, which entity is affected, and how to fix it. */
  message: string;
  /** Location of the offending value, e.g. `['nodes', 0, 'id']`. */
  path?: (string | number)[];
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

/**
 * Returns the parent cycles in a graph's hierarchy, each cycle reported once
 * as the list of node ids forming the cycle (cycle members only — nodes whose
 * ancestry merely *leads into* a cycle are not included).
 */
function getParentCycles(nodesById: Map<string, GraphNode>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  for (const startId of nodesById.keys()) {
    if (visited.has(startId)) continue;
    const path: string[] = [];
    const positions = new Map<string, number>();
    let currentId: string | null | undefined = startId;
    while (
      currentId != null &&
      !visited.has(currentId) &&
      nodesById.has(currentId)
    ) {
      const position = positions.get(currentId);
      if (position !== undefined) {
        cycles.push(path.slice(position));
        break;
      }
      positions.set(currentId, path.length);
      path.push(currentId);
      currentId = nodesById.get(currentId)!.parentId;
    }
    for (const id of path) visited.add(id);
  }
  return cycles;
}

/**
 * Validates the structural invariants of a graph and returns the issues
 * found, or `[]` when the graph is valid. Pure — never throws, never mutates.
 *
 * This is the recommended gate for untrusted or imported graphs (e.g. parsed
 * from a file or received over the wire) before handing them to queries and
 * algorithms: the mutation APIs (`addNode`, `addEdge`, `updateNode`, …)
 * validate incrementally, but `createGraph` does **not** — it accepts
 * dangling `parentId`/edge references and even `parentId` cycles as-is.
 *
 * For Zod-based shape validation of arbitrary unknown values, see
 * `validateGraph` in `@statelyai/graph/schemas` (which reuses these checks).
 *
 * Issue codes: `duplicate-node-id`, `duplicate-edge-id`,
 * `missing-initial-node`, `missing-parent`, `missing-node-initial`,
 * `duplicate-port-name`, `parent-cycle`, `dangling-edge-endpoint`,
 * `missing-source-port`, `missing-target-port`.
 *
 * @example
 * ```ts
 * const graph = createGraph({
 *   nodes: [{ id: 'a', parentId: 'ghost' }],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 * getGraphIssues(graph);
 * // => [
 * //   { code: 'missing-parent', message: '...', path: ['nodes', 0, 'parentId'] },
 * //   { code: 'dangling-edge-endpoint', message: '...', path: ['edges', 0, 'targetId'] },
 * // ]
 * ```
 */
export function getGraphIssues(graph: Graph): GraphIssue[] {
  const issues: GraphIssue[] = [];
  const nodeIndexes = new Map<string, number>();
  const nodesById = new Map<string, GraphNode>();
  graph.nodes.forEach((node, index) => {
    nodeIndexes.set(node.id, index);
    nodesById.set(node.id, node);
  });

  for (const [id, indexes] of getDuplicateIndexes(
    graph.nodes,
    (node) => node.id,
  )) {
    for (const index of indexes) {
      issues.push({
        code: 'duplicate-node-id',
        message: `Duplicate node id "${id}". Node ids must be unique; rename or remove the duplicates.`,
        path: ['nodes', index, 'id'],
      });
    }
  }

  for (const [id, indexes] of getDuplicateIndexes(
    graph.edges,
    (edge) => edge.id,
  )) {
    for (const index of indexes) {
      issues.push({
        code: 'duplicate-edge-id',
        message: `Duplicate edge id "${id}". Edge ids must be unique; rename or remove the duplicates.`,
        path: ['edges', index, 'id'],
      });
    }
  }

  if (graph.initialNodeId && !nodesById.has(graph.initialNodeId)) {
    issues.push({
      code: 'missing-initial-node',
      message: `Graph initialNodeId references missing node "${graph.initialNodeId}". Add that node or update the graph's initialNodeId.`,
      path: ['initialNodeId'],
    });
  }

  graph.nodes.forEach((node, index) => {
    if (node.parentId != null && !nodesById.has(node.parentId)) {
      issues.push({
        code: 'missing-parent',
        message: `Node "${node.id}" has parentId "${node.parentId}", which does not exist. Add that node or remove the parentId.`,
        path: ['nodes', index, 'parentId'],
      });
    }
    if (node.initialNodeId && !nodesById.has(node.initialNodeId)) {
      issues.push({
        code: 'missing-node-initial',
        message: `Node "${node.id}" has initialNodeId "${node.initialNodeId}", which does not exist. Add that node or remove the initialNodeId.`,
        path: ['nodes', index, 'initialNodeId'],
      });
    }
    for (const [name, portIndexes] of getDuplicateIndexes(
      node.ports ?? [],
      (port) => port.name,
    )) {
      for (const portIndex of portIndexes) {
        issues.push({
          code: 'duplicate-port-name',
          message: `Duplicate port name "${name}" on node "${node.id}". Port names must be unique per node; rename or remove the duplicates.`,
          path: ['nodes', index, 'ports', portIndex, 'name'],
        });
      }
    }
  });

  for (const cycle of getParentCycles(nodesById)) {
    const chain = [...cycle, cycle[0]].join(' → ');
    issues.push({
      code: 'parent-cycle',
      message: `Parent cycle detected: ${chain}. Break the cycle by changing the parentId of one of these nodes.`,
      path: ['nodes', nodeIndexes.get(cycle[0]) ?? 0, 'parentId'],
    });
  }

  graph.edges.forEach((edge, index) => {
    const source = nodesById.get(edge.sourceId);
    const target = nodesById.get(edge.targetId);
    if (!source) {
      issues.push({
        code: 'dangling-edge-endpoint',
        message: `Edge "${edge.id}" has sourceId "${edge.sourceId}", which references a missing node. Add that node or fix the edge's sourceId.`,
        path: ['edges', index, 'sourceId'],
      });
    }
    if (!target) {
      issues.push({
        code: 'dangling-edge-endpoint',
        message: `Edge "${edge.id}" has targetId "${edge.targetId}", which references a missing node. Add that node or fix the edge's targetId.`,
        path: ['edges', index, 'targetId'],
      });
    }
    if (
      source &&
      edge.sourcePort !== undefined &&
      !source.ports?.some((port) => port.name === edge.sourcePort)
    ) {
      issues.push({
        code: 'missing-source-port',
        message: `Edge "${edge.id}" has sourcePort "${edge.sourcePort}", but source node "${edge.sourceId}" has no port with that name. Add the port or fix the edge's sourcePort.`,
        path: ['edges', index, 'sourcePort'],
      });
    }
    if (
      target &&
      edge.targetPort !== undefined &&
      !target.ports?.some((port) => port.name === edge.targetPort)
    ) {
      issues.push({
        code: 'missing-target-port',
        message: `Edge "${edge.id}" has targetPort "${edge.targetPort}", but target node "${edge.targetId}" has no port with that name. Add the port or fix the edge's targetPort.`,
        path: ['edges', index, 'targetPort'],
      });
    }
  });

  return issues;
}
