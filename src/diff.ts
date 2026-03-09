import type {
  Graph,
  GraphNode,
  GraphEdge,
  NodeConfig,
  EdgeConfig,
  GraphDiff,
  GraphPatch,
} from './types';
import {
  addNode,
  addEdge,
  deleteNode,
  deleteEdge,
  updateNode,
  updateEdge,
} from './graph';

// Internal helpers

function nodeToConfig<N>(node: GraphNode<N>): NodeConfig<N> {
  const config: NodeConfig<N> = { id: node.id };
  if (node.parentId) config.parentId = node.parentId;
  if (node.initialNodeId) config.initialNodeId = node.initialNodeId;
  if (node.label !== '') config.label = node.label;
  if (node.data !== undefined) config.data = node.data;
  if (node.x !== undefined) config.x = node.x;
  if (node.y !== undefined) config.y = node.y;
  if (node.width !== undefined) config.width = node.width;
  if (node.height !== undefined) config.height = node.height;
  if (node.shape !== undefined) config.shape = node.shape;
  if (node.color !== undefined) config.color = node.color;
  if (node.style !== undefined) config.style = node.style;
  return config;
}

function edgeToConfig<E>(edge: GraphEdge<E>): EdgeConfig<E> {
  const config: EdgeConfig<E> = {
    id: edge.id,
    sourceId: edge.sourceId,
    targetId: edge.targetId,
  };
  if (edge.label !== '') config.label = edge.label;
  if (edge.data !== undefined) config.data = edge.data;
  if (edge.x !== undefined) config.x = edge.x;
  if (edge.y !== undefined) config.y = edge.y;
  if (edge.width !== undefined) config.width = edge.width;
  if (edge.height !== undefined) config.height = edge.height;
  if (edge.color !== undefined) config.color = edge.color;
  if (edge.style !== undefined) config.style = edge.style;
  return config;
}

/** Shallow-compare two values, returning true if they differ. */
function differs(a: unknown, b: unknown): boolean {
  if (a === b) return false;
  if (a == null || b == null) return a !== b;
  if (typeof a === 'object' && typeof b === 'object') {
    return JSON.stringify(a) !== JSON.stringify(b);
  }
  return true;
}

const NODE_COMPARE_KEYS = [
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
] as const;

const EDGE_COMPARE_KEYS = [
  'sourceId',
  'targetId',
  'label',
  'data',
  'x',
  'y',
  'width',
  'height',
  'color',
  'style',
] as const;

// Diff functions

/**
 * Compute a structured diff from graph `a` to graph `b` by matching IDs.
 *
 * @example
 * ```ts
 * import { createGraph, getDiff } from '@statelyai/graph';
 *
 * const a = createGraph({ nodes: [{ id: 'n1' }], edges: [] });
 * const b = createGraph({ nodes: [{ id: 'n1', label: 'hello' }, { id: 'n2' }], edges: [] });
 *
 * const diff = getDiff(a, b);
 * // diff.nodes.added → [{ id: 'n2' }]
 * // diff.nodes.updated → [{ id: 'n1', old: { label: '' }, new: { label: 'hello' } }]
 * ```
 */
export function getDiff<N, E>(a: Graph<N, E>, b: Graph<N, E>): GraphDiff<N, E> {
  const aNodeMap = new Map(a.nodes.map((n) => [n.id, n]));
  const bNodeMap = new Map(b.nodes.map((n) => [n.id, n]));
  const aEdgeMap = new Map(a.edges.map((e) => [e.id, e]));
  const bEdgeMap = new Map(b.edges.map((e) => [e.id, e]));

  const diff: GraphDiff<N, E> = {
    nodes: { added: [], removed: [], updated: [] },
    edges: { added: [], removed: [], updated: [] },
  };

  // Nodes
  for (const [id, nodeB] of bNodeMap) {
    const nodeA = aNodeMap.get(id);
    if (!nodeA) {
      diff.nodes.added.push(nodeToConfig(nodeB));
    } else {
      const oldPartial: Partial<GraphNode<N>> = {};
      const newPartial: Partial<GraphNode<N>> = {};
      for (const key of NODE_COMPARE_KEYS) {
        if (differs((nodeA as any)[key], (nodeB as any)[key])) {
          (oldPartial as any)[key] = (nodeA as any)[key];
          (newPartial as any)[key] = (nodeB as any)[key];
        }
      }
      if (Object.keys(oldPartial).length > 0) {
        diff.nodes.updated.push({ id, old: oldPartial, new: newPartial });
      }
    }
  }
  for (const [id, nodeA] of aNodeMap) {
    if (!bNodeMap.has(id)) {
      diff.nodes.removed.push(nodeToConfig(nodeA));
    }
  }

  // Edges
  for (const [id, edgeB] of bEdgeMap) {
    const edgeA = aEdgeMap.get(id);
    if (!edgeA) {
      diff.edges.added.push(edgeToConfig(edgeB));
    } else {
      const oldPartial: Partial<GraphEdge<E>> = {};
      const newPartial: Partial<GraphEdge<E>> = {};
      for (const key of EDGE_COMPARE_KEYS) {
        if (differs((edgeA as any)[key], (edgeB as any)[key])) {
          (oldPartial as any)[key] = (edgeA as any)[key];
          (newPartial as any)[key] = (edgeB as any)[key];
        }
      }
      if (Object.keys(oldPartial).length > 0) {
        diff.edges.updated.push({ id, old: oldPartial, new: newPartial });
      }
    }
  }
  for (const [id, edgeA] of aEdgeMap) {
    if (!bEdgeMap.has(id)) {
      diff.edges.removed.push(edgeToConfig(edgeA));
    }
  }

  return diff;
}

/**
 * Check if a diff has zero changes.
 *
 * @example
 * ```ts
 * import { createGraph, getDiff, isEmptyDiff } from '@statelyai/graph';
 *
 * const g = createGraph({ nodes: [{ id: 'n1' }], edges: [] });
 * const diff = getDiff(g, g);
 * isEmptyDiff(diff); // true
 * ```
 */
export function isEmptyDiff(diff: GraphDiff): boolean {
  return (
    diff.nodes.added.length === 0 &&
    diff.nodes.removed.length === 0 &&
    diff.nodes.updated.length === 0 &&
    diff.edges.added.length === 0 &&
    diff.edges.removed.length === 0 &&
    diff.edges.updated.length === 0
  );
}

/**
 * Invert a diff: swap added/removed, swap old/new in updates.
 *
 * @example
 * ```ts
 * import { createGraph, getDiff, invertDiff } from '@statelyai/graph';
 *
 * const a = createGraph({ nodes: [{ id: 'n1' }], edges: [] });
 * const b = createGraph({ nodes: [{ id: 'n2' }], edges: [] });
 *
 * const diff = getDiff(a, b);
 * const inv = invertDiff(diff);
 * // inv.nodes.added contains n1 (was removed)
 * // inv.nodes.removed contains n2 (was added)
 * ```
 */
export function invertDiff<N, E>(diff: GraphDiff<N, E>): GraphDiff<N, E> {
  return {
    nodes: {
      added: diff.nodes.removed,
      removed: diff.nodes.added,
      updated: diff.nodes.updated.map((c) => ({
        id: c.id,
        old: c.new,
        new: c.old,
      })),
    },
    edges: {
      added: diff.edges.removed,
      removed: diff.edges.added,
      updated: diff.edges.updated.map((c) => ({
        id: c.id,
        old: c.new,
        new: c.old,
      })),
    },
  };
}

// Patch functions

/**
 * Compute an ordered patch list from graph `a` to graph `b`.
 * Order: delete edges → delete nodes → add nodes → add edges → update nodes → update edges.
 *
 * @example
 * ```ts
 * import { createGraph, getPatches } from '@statelyai/graph';
 *
 * const a = createGraph({ nodes: [{ id: 'n1' }], edges: [] });
 * const b = createGraph({ nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [] });
 *
 * const patches = getPatches(a, b);
 * // patches → [{ op: 'addNode', node: { id: 'n2' } }]
 * ```
 */
export function getPatches<N, E>(
  a: Graph<N, E>,
  b: Graph<N, E>,
): GraphPatch<N, E>[] {
  const diff = getDiff(a, b);
  return toPatches(diff);
}

/**
 * **Mutable.** Apply patches to a graph in order.
 * Delegates to addNode/deleteNode/updateNode/addEdge/deleteEdge/updateEdge.
 *
 * @example
 * ```ts
 * import { createGraph, getPatches, applyPatches } from '@statelyai/graph';
 *
 * const a = createGraph({ nodes: [{ id: 'n1' }], edges: [] });
 * const b = createGraph({ nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [] });
 *
 * const patches = getPatches(a, b);
 * applyPatches(a, patches);
 * // a now contains both n1 and n2
 * ```
 */
export function applyPatches<N, E>(
  graph: Graph<N, E>,
  patches: GraphPatch<N, E>[],
): void {
  for (const patch of patches) {
    switch (patch.op) {
      case 'addNode':
        addNode(graph, patch.node);
        break;
      case 'deleteNode': {
        deleteNode(graph, patch.id);
        break;
      }
      case 'updateNode':
        updateNode(graph, patch.id, patch.data);
        break;
      case 'addEdge':
        addEdge(graph, patch.edge);
        break;
      case 'deleteEdge':
        deleteEdge(graph, patch.id);
        break;
      case 'updateEdge':
        updateEdge(graph, patch.id, patch.data);
        break;
    }
  }
}

// Conversion functions

/**
 * Flatten a structured diff into an ordered patch list.
 * Order: add nodes → update edges → delete edges → delete nodes → add edges → update nodes.
 * This avoids cascading deletes removing edges that are being updated,
 * and ensures new nodes exist before edges reference them.
 *
 * @example
 * ```ts
 * import { createGraph, getDiff, toPatches } from '@statelyai/graph';
 *
 * const a = createGraph({ nodes: [{ id: 'n1' }], edges: [] });
 * const b = createGraph({ nodes: [{ id: 'n2' }], edges: [] });
 *
 * const diff = getDiff(a, b);
 * const patches = toPatches(diff);
 * // patches → [{ op: 'addNode', ... }, { op: 'deleteNode', ... }]
 * ```
 */
export function toPatches<N, E>(diff: GraphDiff<N, E>): GraphPatch<N, E>[] {
  const patches: GraphPatch<N, E>[] = [];

  // 1. Add nodes (new nodes needed for updated/added edges)
  for (const node of diff.nodes.added) {
    patches.push({ op: 'addNode', node });
  }

  // 2. Update edges (move endpoints away from deleted nodes before they cascade)
  for (const change of diff.edges.updated) {
    const data: Partial<Omit<EdgeConfig<E>, 'id'>> = {};
    for (const [key, value] of Object.entries(change.new)) {
      (data as any)[key] = value;
    }
    patches.push({ op: 'updateEdge', id: change.id, data });
  }

  // 3. Delete edges
  for (const edge of diff.edges.removed) {
    patches.push({ op: 'deleteEdge', id: edge.id });
  }

  // 4. Delete nodes (safe now — updated edges no longer reference them)
  for (const node of diff.nodes.removed) {
    patches.push({ op: 'deleteNode', id: node.id });
  }

  // 5. Add edges (all referenced nodes exist)
  for (const edge of diff.edges.added) {
    patches.push({ op: 'addEdge', edge });
  }

  // 6. Update nodes
  for (const change of diff.nodes.updated) {
    const data: Partial<Omit<NodeConfig<N>, 'id'>> = {};
    for (const [key, value] of Object.entries(change.new)) {
      (data as any)[key] = value;
    }
    patches.push({ op: 'updateNode', id: change.id, data });
  }

  return patches;
}

/**
 * Group a patch list into a structured diff.
 *
 * @example
 * ```ts
 * import { createGraph, getPatches, toDiff } from '@statelyai/graph';
 *
 * const a = createGraph({ nodes: [{ id: 'n1' }], edges: [] });
 * const b = createGraph({ nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [] });
 *
 * const patches = getPatches(a, b);
 * const diff = toDiff(patches);
 * // diff.nodes.added → [{ id: 'n2' }]
 * ```
 */
export function toDiff<N, E>(patches: GraphPatch<N, E>[]): GraphDiff<N, E> {
  const diff: GraphDiff<N, E> = {
    nodes: { added: [], removed: [], updated: [] },
    edges: { added: [], removed: [], updated: [] },
  };

  for (const patch of patches) {
    switch (patch.op) {
      case 'addNode':
        diff.nodes.added.push(patch.node);
        break;
      case 'deleteNode':
        diff.nodes.removed.push({ id: patch.id } as NodeConfig<N>);
        break;
      case 'updateNode': {
        const newPartial: Partial<GraphNode<N>> = {};
        for (const [key, value] of Object.entries(patch.data)) {
          (newPartial as any)[key] = value;
        }
        diff.nodes.updated.push({ id: patch.id, old: {}, new: newPartial });
        break;
      }
      case 'addEdge':
        diff.edges.added.push(patch.edge);
        break;
      case 'deleteEdge':
        diff.edges.removed.push({ id: patch.id } as EdgeConfig<E>);
        break;
      case 'updateEdge': {
        const newPartial: Partial<GraphEdge<E>> = {};
        for (const [key, value] of Object.entries(patch.data)) {
          (newPartial as any)[key] = value;
        }
        diff.edges.updated.push({ id: patch.id, old: {}, new: newPartial });
        break;
      }
    }
  }

  return diff;
}
