// --- Config types (input, lenient) ---

export interface GraphConfig<
  TNodeData = any,
  TEdgeData = any,
  TGraphData = any,
> {
  id?: string;
  type?: 'directed' | 'undirected';
  initialNodeId?: string;
  nodes?: NodeConfig<TNodeData>[];
  edges?: EdgeConfig<TEdgeData>[];
  data?: TGraphData;
}

export interface NodeConfig<TNodeData = any> {
  id: string;
  parentId?: string | null;
  initialNodeId?: string;
  label?: string;
  data?: TNodeData;
}

export interface EdgeConfig<TEdgeData = any> {
  /**
   * The id of the edge.
   */
  id: string;
  /**
   * The id of the source node.
   */
  sourceId: string;
  /**
   * The id of the target node.
   */
  targetId: string;
  /**
   * The label of the edge.
   */
  label?: string;
  data?: TEdgeData;
}

// --- Primary types (plain JSON-serializable objects) ---

export interface Graph<TNodeData = any, TEdgeData = any, TGraphData = any> {
  id: string;
  type: 'directed' | 'undirected';
  initialNodeId: string | null;
  nodes: GraphNode<TNodeData>[];
  edges: GraphEdge<TEdgeData>[];
  data: TGraphData;
}

export interface GraphNode<TNodeData = any> {
  type: 'node';
  id: string;
  parentId: string | null;
  initialNodeId: string | null;
  label: string;
  data: TNodeData;
}

export interface GraphEdge<TEdgeData = any> {
  type: 'edge';
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  data: TEdgeData;
}

export interface DeleteNodeOptions {
  reparent?: boolean;
}

export interface EntitiesConfig<TNodeData = any, TEdgeData = any> {
  nodes?: NodeConfig<TNodeData>[];
  edges?: EdgeConfig<TEdgeData>[];
}

export interface EntitiesUpdate<TNodeData = any, TEdgeData = any> {
  nodes?: (Partial<Omit<NodeConfig<TNodeData>, 'id'>> & { id: string })[];
  edges?: (Partial<Omit<EdgeConfig<TEdgeData>, 'id'>> & { id: string })[];
}

// --- Path types ---

export interface GraphStep<TNodeData = any, TEdgeData = any> {
  /** Edge traversed to reach this node */
  edge: GraphEdge<TEdgeData>;
  /** Node reached after traversing the edge */
  node: GraphNode<TNodeData>;
}

export interface GraphPath<TNodeData = any, TEdgeData = any> {
  /** The source node where this path begins. */
  source: GraphNode<TNodeData>;
  /** Ordered steps from source to target.
   *  `path.steps.at(-1)?.node` is the final/target node.
   *  Empty steps = source-only path. */
  steps: GraphStep<TNodeData, TEdgeData>[];
}

export interface PathOptions<TEdgeData = any> {
  /** Source node ID. Default: graph.initialNodeId, else sole inDegree-0 node */
  from?: string;
  /** Target node ID. If omitted → paths to all reachable nodes */
  to?: string;
  /** Edge weight function. Default: every edge = 1. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
}
