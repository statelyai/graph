import type {
  ElkNode,
  ElkExtendedEdge,
  ElkLabel,
} from 'elkjs/lib/elk-api';
import type {
  Graph,
  VisualGraph,
  VisualNode,
  VisualEdge,
  VisualGraphFormatConverter,
} from '../../types';
import { getChildren } from '../../queries';

export type {
  ElkNode,
  ElkExtendedEdge,
  ElkEdge,
  ElkEdgeSection,
  ElkLabel,
  ElkPort,
  ElkPoint,
  ElkShape,
  ElkGraphElement,
  ElkPrimitiveEdge,
  LayoutOptions,
} from 'elkjs/lib/elk-api';

// --- Direction mapping ---

const DIRECTION_TO_ELK: Record<string, string> = {
  down: 'DOWN',
  up: 'UP',
  right: 'RIGHT',
  left: 'LEFT',
};

const ELK_TO_DIRECTION: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  DOWN: 'down',
  UP: 'up',
  RIGHT: 'right',
  LEFT: 'left',
};

// --- toELK ---

function convertEdge(edge: VisualEdge): ElkExtendedEdge {
  const elkEdge: ElkExtendedEdge = {
    id: edge.id,
    sources: [edge.sourceId],
    targets: [edge.targetId],
  };
  if (edge.label) {
    elkEdge.labels = [{ text: edge.label }];
  }
  return elkEdge;
}

function convertNode(graph: VisualGraph, node: VisualNode): ElkNode {
  const elkNode: ElkNode = {
    id: node.id,
    x: node.x,
    y: node.y,
    width: node.width,
    height: node.height,
  };
  if (node.label) {
    elkNode.labels = [{ text: node.label }];
  }

  const children = getChildren(graph as Graph, node.id) as VisualNode[];
  if (children.length > 0) {
    elkNode.children = children.map((child) => convertNode(graph, child));

    // Edges where both source and target are within this compound node
    const descendantIds = new Set<string>();
    collectDescendants(graph, node.id, descendantIds);
    const innerEdges = graph.edges.filter(
      (e) => descendantIds.has(e.sourceId) && descendantIds.has(e.targetId),
    );
    if (innerEdges.length > 0) {
      elkNode.edges = innerEdges.map(convertEdge);
    }
  }

  return elkNode;
}

function collectDescendants(
  graph: VisualGraph,
  nodeId: string,
  set: Set<string>,
): void {
  const children = getChildren(graph as Graph, nodeId);
  for (const child of children) {
    set.add(child.id);
    collectDescendants(graph, child.id, set);
  }
}

/**
 * Converts a visual graph to ELK JSON format.
 *
 * @example
 * ```ts
 * import { createVisualGraph } from '@statelyai/graph';
 * import { toELK } from '@statelyai/graph/elk';
 *
 * const graph = createVisualGraph({
 *   nodes: [
 *     { id: 'a', x: 0, y: 0, width: 100, height: 50 },
 *     { id: 'b', x: 200, y: 0, width: 100, height: 50 },
 *   ],
 *   edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
 * });
 *
 * const elk = toELK(graph);
 * // { id: '', children: [...], edges: [...] }
 * ```
 */
export function toELK(graph: VisualGraph): ElkNode {
  const root: ElkNode = { id: graph.id };

  const elkDir = DIRECTION_TO_ELK[graph.direction];
  if (elkDir) {
    root.layoutOptions = { 'elk.direction': elkDir };
  }

  // Root-level nodes (no parent)
  const roots = getChildren(graph as Graph, null) as VisualNode[];
  if (roots.length > 0) {
    root.children = roots.map((node) => convertNode(graph, node));
  }

  // Root-level edges: edges not fully contained within any compound node
  const allInnerEdgeIds = new Set<string>();
  for (const node of graph.nodes) {
    const children = getChildren(graph as Graph, node.id);
    if (children.length > 0) {
      const descendantIds = new Set<string>();
      collectDescendants(graph, node.id, descendantIds);
      for (const edge of graph.edges) {
        if (descendantIds.has(edge.sourceId) && descendantIds.has(edge.targetId)) {
          allInnerEdgeIds.add(edge.id);
        }
      }
    }
  }

  const rootEdges = graph.edges.filter((e) => !allInnerEdgeIds.has(e.id));
  if (rootEdges.length > 0) {
    root.edges = rootEdges.map(convertEdge);
  }

  return root;
}

// --- fromELK ---

function flattenElkNodes(
  elkNode: ElkNode,
  parentId: string | null,
  nodes: VisualNode[],
  edges: VisualEdge[],
  edgeIdx: { value: number },
): void {
  if (elkNode.children) {
    for (const child of elkNode.children) {
      const label =
        (child.labels as ElkLabel[] | undefined)?.[0]?.text ?? '';
      const node: VisualNode = {
        type: 'node',
        id: child.id,
        parentId,
        initialNodeId: null,
        label,
        data: undefined as any,
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? 0,
        height: child.height ?? 0,
      };
      nodes.push(node);
      flattenElkNodes(child, child.id, nodes, edges, edgeIdx);
    }
  }

  if (elkNode.edges) {
    for (const elkEdge of elkNode.edges as ElkExtendedEdge[]) {
      for (const source of elkEdge.sources) {
        for (const target of elkEdge.targets) {
          const edge: VisualEdge = {
            type: 'edge',
            id: elkEdge.id ?? `e${edgeIdx.value++}`,
            sourceId: source,
            targetId: target,
            label: (elkEdge.labels as ElkLabel[] | undefined)?.[0]?.text ?? '',
            data: undefined as any,
            x: 0,
            y: 0,
            width: 0,
            height: 0,
          };
          edges.push(edge);
        }
      }
    }
  }
}

/**
 * Parses an ELK JSON node into a visual graph.
 *
 * @example
 * ```ts
 * import { fromELK } from '@statelyai/graph/elk';
 *
 * const graph = fromELK({
 *   id: 'root',
 *   children: [
 *     { id: 'a', x: 0, y: 0, width: 100, height: 50 },
 *     { id: 'b', x: 200, y: 0, width: 100, height: 50 },
 *   ],
 *   edges: [{ id: 'e1', sources: ['a'], targets: ['b'] }],
 * });
 *
 * graph.nodes; // [{id: 'a', x: 0, y: 0, ...}, {id: 'b', x: 200, ...}]
 * graph.edges; // [{sourceId: 'a', targetId: 'b', ...}]
 * ```
 */
export function fromELK(elkRoot: ElkNode): VisualGraph {
  const nodes: VisualNode[] = [];
  const edges: VisualEdge[] = [];
  const edgeIdx = { value: 0 };

  flattenElkNodes(elkRoot, null, nodes, edges, edgeIdx);

  // Deduplicate edges by id (same edge may appear at compound and root level)
  const seenEdges = new Map<string, VisualEdge>();
  for (const edge of edges) {
    if (!seenEdges.has(edge.id)) {
      seenEdges.set(edge.id, edge);
    }
  }

  const elkDir = elkRoot.layoutOptions?.['elk.direction'];
  const direction: VisualGraph['direction'] =
    (elkDir ? ELK_TO_DIRECTION[elkDir] : undefined) ?? 'down';

  return {
    id: elkRoot.id,
    type: 'directed',
    initialNodeId: null,
    nodes,
    edges: [...seenEdges.values()],
    data: undefined as any,
    direction,
  };
}

/**
 * Bidirectional converter for ELK JSON format.
 *
 * @example
 * ```ts
 * import { elkConverter } from '@statelyai/graph/elk';
 *
 * const elk = elkConverter.to(graph);
 * const roundTripped = elkConverter.from(elk);
 * ```
 */
export const elkConverter: VisualGraphFormatConverter<ElkNode> = {
  to: toELK,
  from: fromELK,
};
