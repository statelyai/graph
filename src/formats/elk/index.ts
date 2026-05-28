import type {
  ElkNode,
  ElkExtendedEdge,
  ElkLabel,
  ElkPort,
} from 'elkjs/lib/elk-api';
import type {
  Graph,
  VisualGraph,
  VisualNode,
  VisualEdge,
  VisualPort,
  VisualGraphFormatConverter,
} from '../../types';
import { getChildren } from '../../queries';

const STATELYAI_METADATA_KEY = 'statelyai.metadata';

interface ElkMetadata {
  graph?: Partial<VisualGraph>;
  node?: Partial<VisualNode>;
  port?: Partial<VisualPort>;
  edge?: Partial<VisualEdge>;
}

function addMetadata<T extends { layoutOptions?: Record<string, unknown> }>(
  target: T,
  metadata: ElkMetadata,
): T {
  target.layoutOptions = {
    ...(target.layoutOptions ?? {}),
    [STATELYAI_METADATA_KEY]: JSON.stringify(metadata),
  };
  return target;
}

function readMetadata(value: {
  layoutOptions?: Record<string, unknown>;
}): ElkMetadata | undefined {
  const raw = value.layoutOptions?.[STATELYAI_METADATA_KEY];
  if (typeof raw !== 'string') return undefined;
  try {
    return JSON.parse(raw) as ElkMetadata;
  } catch {
    return undefined;
  }
}

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
    sources: [edge.sourcePort ?? edge.sourceId],
    targets: [edge.targetPort ?? edge.targetId],
  };
  if (edge.label) {
    elkEdge.labels = [{ text: edge.label }];
  }
  return addMetadata(elkEdge, {
    edge: {
      sourceId: edge.sourceId,
      targetId: edge.targetId,
      sourcePort: edge.sourcePort,
      targetPort: edge.targetPort,
      label: edge.label,
      data: edge.data,
      weight: edge.weight,
      color: edge.color,
      style: edge.style,
      x: edge.x,
      y: edge.y,
      width: edge.width,
      height: edge.height,
    },
  });
}

function convertPort(port: VisualPort): ElkPort {
  const elkPort: ElkPort = {
    id: port.name,
    x: port.x,
    y: port.y,
    width: port.width,
    height: port.height,
  };
  if (port.label) {
    elkPort.labels = [{ text: port.label }];
  }
  if (port.direction !== 'inout') {
    elkPort.layoutOptions = {
      'org.eclipse.elk.port.side':
        port.direction === 'in' ? 'WEST' : 'EAST',
    };
  }
  return addMetadata(elkPort, {
    port: {
      data: port.data,
      style: port.style,
    },
  });
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
  if (node.ports && node.ports.length > 0) {
    elkNode.ports = node.ports.map(convertPort);
  }
  addMetadata(elkNode, {
    node: {
      initialNodeId: node.initialNodeId,
      data: node.data,
      shape: node.shape,
      color: node.color,
      style: node.style,
    },
  });

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
  addMetadata(root, {
    graph: {
      id: graph.id,
      mode: graph.mode,
      initialNodeId: graph.initialNodeId,
      data: graph.data,
      direction: graph.direction,
      style: graph.style,
    },
  });

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
  portOwner: Map<string, string>,
): void {
  if (elkNode.children) {
    for (const child of elkNode.children) {
      const label =
        (child.labels as ElkLabel[] | undefined)?.[0]?.text ?? '';
      const metadata = readMetadata(child)?.node;
      const node: VisualNode = {
        type: 'node',
        id: child.id,
        parentId,
        initialNodeId:
          metadata && 'initialNodeId' in metadata
            ? (metadata.initialNodeId as string | null)
            : null,
        label,
        data:
          metadata && 'data' in metadata
            ? metadata.data
            : (undefined as any),
        x: child.x ?? 0,
        y: child.y ?? 0,
        width: child.width ?? 0,
        height: child.height ?? 0,
        ...(metadata?.shape !== undefined && { shape: metadata.shape }),
        ...(metadata?.color !== undefined && { color: metadata.color }),
        ...(metadata?.style !== undefined && { style: metadata.style }),
      };
      // Parse ELK ports
      if (child.ports && child.ports.length > 0) {
        node.ports = (child.ports as ElkPort[]).map((elkPort): VisualPort => {
          portOwner.set(elkPort.id, child.id);
          const metadata = readMetadata(elkPort)?.port;
          const sideOpt =
            elkPort.layoutOptions?.['org.eclipse.elk.port.side'];
          let direction: 'in' | 'out' | 'inout' = 'inout';
          if (sideOpt === 'WEST') direction = 'in';
          else if (sideOpt === 'EAST') direction = 'out';
          return {
            name: elkPort.id,
            direction,
            label:
              (elkPort.labels as ElkLabel[] | undefined)?.[0]?.text,
            data:
              metadata && 'data' in metadata
                ? metadata.data
                : (undefined as any),
            x: elkPort.x ?? 0,
            y: elkPort.y ?? 0,
            width: elkPort.width ?? 0,
            height: elkPort.height ?? 0,
            ...(metadata?.style !== undefined && { style: metadata.style }),
          };
        });
      }
      nodes.push(node);
      flattenElkNodes(child, child.id, nodes, edges, edgeIdx, portOwner);
    }
  }

  if (elkNode.edges) {
    for (const elkEdge of elkNode.edges as ElkExtendedEdge[]) {
      for (const source of elkEdge.sources) {
        for (const target of elkEdge.targets) {
          // Resolve: if source/target is a port ID, map to node + port
          const metadata = readMetadata(elkEdge)?.edge;
          const sourceNodeId = portOwner.get(source);
          const targetNodeId = portOwner.get(target);
          const edge: VisualEdge = {
            type: 'edge',
            id: elkEdge.id ?? `e${edgeIdx.value++}`,
            sourceId: metadata?.sourceId ?? sourceNodeId ?? source,
            targetId: metadata?.targetId ?? targetNodeId ?? target,
            label:
              metadata && 'label' in metadata
                ? (metadata.label as string | null)
                : ((elkEdge.labels as ElkLabel[] | undefined)?.[0]?.text ?? ''),
            data:
              metadata && 'data' in metadata
                ? metadata.data
                : (undefined as any),
            x: metadata?.x ?? 0,
            y: metadata?.y ?? 0,
            width: metadata?.width ?? 0,
            height: metadata?.height ?? 0,
            ...(metadata?.weight !== undefined && { weight: metadata.weight }),
            ...(metadata?.color !== undefined && { color: metadata.color }),
            ...(metadata?.style !== undefined && { style: metadata.style }),
          };
          if (metadata && 'sourcePort' in metadata) {
            edge.sourcePort = metadata.sourcePort;
          } else if (sourceNodeId) edge.sourcePort = source;
          if (metadata && 'targetPort' in metadata) {
            edge.targetPort = metadata.targetPort;
          } else if (targetNodeId) edge.targetPort = target;
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
  const portOwner = new Map<string, string>();

  flattenElkNodes(elkRoot, null, nodes, edges, edgeIdx, portOwner);

  // Deduplicate edges by id (same edge may appear at compound and root level)
  const seenEdges = new Map<string, VisualEdge>();
  for (const edge of edges) {
    if (!seenEdges.has(edge.id)) {
      seenEdges.set(edge.id, edge);
    }
  }

  const elkDir = elkRoot.layoutOptions?.['elk.direction'];
  const graphMetadata = readMetadata(elkRoot)?.graph;
  const direction: VisualGraph['direction'] =
    (graphMetadata?.direction as VisualGraph['direction'] | undefined) ??
    (elkDir ? ELK_TO_DIRECTION[elkDir] : undefined) ??
    'down';

  return {
    id: graphMetadata?.id ?? elkRoot.id,
    mode: graphMetadata?.mode ?? 'directed',
    initialNodeId:
      graphMetadata && 'initialNodeId' in graphMetadata
        ? (graphMetadata.initialNodeId as string | null)
        : null,
    nodes,
    edges: [...seenEdges.values()],
    data:
      graphMetadata && 'data' in graphMetadata
        ? graphMetadata.data
        : (undefined as any),
    direction,
    ...(graphMetadata?.style !== undefined && { style: graphMetadata.style }),
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
