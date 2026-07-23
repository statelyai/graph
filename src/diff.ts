import type {
  Graph,
  GraphNode,
  GraphEdge,
  NodeConfig,
  EdgeConfig,
  NodeUpdate,
  EdgeUpdate,
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
import { toNodeConfig, toEdgeConfig } from './config';

// Internal helpers

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
  'ports',
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
  'weight',
  'mode',
  'sourcePort',
  'targetPort',
  'points',
  'routing',
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
      diff.nodes.added.push(toNodeConfig(nodeB));
    } else {
      const oldPartial: Partial<GraphNode<N>> = {};
      const newPartial: Partial<GraphNode<N>> = {};
      for (const key of NODE_COMPARE_KEYS) {
        // Normalize absent → null so diffs stay JSON-serializable and a
        // removed optional field round-trips through patches (null unsets).
        const oldValue = (nodeA as any)[key] ?? null;
        const newValue = (nodeB as any)[key] ?? null;
        if (differs(oldValue, newValue)) {
          (oldPartial as any)[key] = oldValue;
          (newPartial as any)[key] = newValue;
        }
      }
      if (Object.keys(oldPartial).length > 0) {
        diff.nodes.updated.push({ id, old: oldPartial, new: newPartial });
      }
    }
  }
  for (const [id, nodeA] of aNodeMap) {
    if (!bNodeMap.has(id)) {
      diff.nodes.removed.push(toNodeConfig(nodeA));
    }
  }

  // Edges
  for (const [id, edgeB] of bEdgeMap) {
    const edgeA = aEdgeMap.get(id);
    if (!edgeA) {
      diff.edges.added.push(toEdgeConfig(edgeB));
    } else {
      const oldPartial: Partial<GraphEdge<E>> = {};
      const newPartial: Partial<GraphEdge<E>> = {};
      for (const key of EDGE_COMPARE_KEYS) {
        // Normalize absent → null (see node comparison above)
        const oldValue = (edgeA as any)[key] ?? null;
        const newValue = (edgeB as any)[key] ?? null;
        if (differs(oldValue, newValue)) {
          (oldPartial as any)[key] = oldValue;
          (newPartial as any)[key] = newValue;
        }
      }
      if (Object.keys(oldPartial).length > 0) {
        diff.edges.updated.push({ id, old: oldPartial, new: newPartial });
      }
    }
  }
  for (const [id, edgeA] of aEdgeMap) {
    if (!bEdgeMap.has(id)) {
      diff.edges.removed.push(toEdgeConfig(edgeA));
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
 * import { createGraph, getDiff, getInvertedDiff } from '@statelyai/graph';
 *
 * const a = createGraph({ nodes: [{ id: 'n1' }], edges: [] });
 * const b = createGraph({ nodes: [{ id: 'n2' }], edges: [] });
 *
 * const diff = getDiff(a, b);
 * const inv = getInvertedDiff(diff);
 * // inv.nodes.added contains n1 (was removed)
 * // inv.nodes.removed contains n2 (was added)
 * ```
 */
export function getInvertedDiff<N, E>(diff: GraphDiff<N, E>): GraphDiff<N, E> {
  // Deep copy (graphs are JSON-serializable by contract) so nested values
  // (ports, style, data) are not shared between the input and the inverse.
  return {
    nodes: {
      added: diff.nodes.removed.map((c) => structuredClone(c)),
      removed: diff.nodes.added.map((c) => structuredClone(c)),
      updated: diff.nodes.updated.map((c) => ({
        id: c.id,
        old: structuredClone(c.new),
        new: structuredClone(c.old),
      })),
    },
    edges: {
      added: diff.edges.removed.map((c) => structuredClone(c)),
      removed: diff.edges.added.map((c) => structuredClone(c)),
      updated: diff.edges.updated.map((c) => ({
        id: c.id,
        old: structuredClone(c.new),
        new: structuredClone(c.old),
      })),
    },
  };
}

/**
 * @deprecated Use {@link getInvertedDiff}.
 */
export function invertDiff<N, E>(diff: GraphDiff<N, E>): GraphDiff<N, E> {
  return getInvertedDiff(diff);
}

// Patch functions

/**
 * Compute an ordered patch list from graph `a` to graph `b`.
 * Order (see {@link toPatches}): add nodes → update edges → delete edges →
 * delete nodes → add edges → update nodes.
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
 * Return a graph copy with patches applied in order.
 * Unchanged nodes and edges are structurally shared with `graph`.
 */
export function getPatchedGraph<N = any, E = any, G = any, P = any>(
  graph: Graph<N, E, G, P>,
  patches: GraphPatch<N, E>[],
): Graph<N, E, G, P> {
  const next: Graph<N, E, G, P> = {
    ...graph,
    nodes: [...graph.nodes],
    edges: [...graph.edges],
  };
  updateGraphWithPatches(next, patches);
  return next;
}

/**
 * **Mutable.** Apply patches to a graph in order.
 * Delegates to addNode/deleteNode/updateNode/addEdge/deleteEdge/updateEdge.
 *
 * @example
 * ```ts
 * import { createGraph, getPatches, updateGraphWithPatches } from '@statelyai/graph';
 *
 * const a = createGraph({ nodes: [{ id: 'n1' }], edges: [] });
 * const b = createGraph({ nodes: [{ id: 'n1' }, { id: 'n2' }], edges: [] });
 *
 * const patches = getPatches(a, b);
 * updateGraphWithPatches(a, patches);
 * // a now contains both n1 and n2
 * ```
 */
export function updateGraphWithPatches<N, E>(
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

/**
 * @deprecated Use {@link updateGraphWithPatches}.
 */
export function applyPatches<N, E>(
  graph: Graph<N, E>,
  patches: GraphPatch<N, E>[],
): void {
  updateGraphWithPatches(graph, patches);
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
    const data: EdgeUpdate<E> = {};
    for (const [key, value] of Object.entries(change.new)) {
      // Absent fields appear as undefined when a diff was hand-built;
      // map to null so the update unsets the field (JSON-safe).
      (data as any)[key] = value ?? null;
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
    const data: NodeUpdate<N> = {};
    for (const [key, value] of Object.entries(change.new)) {
      // Absent fields appear as undefined when a diff was hand-built;
      // map to null so the update unsets the field (JSON-safe).
      (data as any)[key] = value ?? null;
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
