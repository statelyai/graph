// --- Visual base ---

export interface EntityRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

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
  direction?: 'up' | 'down' | 'left' | 'right';
  style?: Record<string, string | number>;
}

export interface NodeConfig<TNodeData = any> {
  id: string;
  parentId?: string | null;
  initialNodeId?: string;
  label?: string;
  data?: TNodeData;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  shape?: string;
  color?: string;
  style?: Record<string, string | number>;
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
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  style?: Record<string, string | number>;
}

// --- Primary types (plain JSON-serializable objects) ---

export interface Graph<TNodeData = any, TEdgeData = any, TGraphData = any> {
  id: string;
  type: 'directed' | 'undirected';
  initialNodeId: string | null;
  nodes: GraphNode<TNodeData>[];
  edges: GraphEdge<TEdgeData>[];
  data: TGraphData;
  direction?: 'up' | 'down' | 'left' | 'right';
  style?: Record<string, string | number>;
}

export interface GraphNode<TNodeData = any> {
  type: 'node';
  id: string;
  parentId: string | null;
  initialNodeId: string | null;
  label: string;
  data: TNodeData;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  shape?: string;
  color?: string;
  style?: Record<string, string | number>;
}

export interface GraphEdge<TEdgeData = any> {
  type: 'edge';
  id: string;
  sourceId: string;
  targetId: string;
  label: string;
  data: TEdgeData;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  color?: string;
  style?: Record<string, string | number>;
}

// --- Visual types (required position/size) ---

export interface VisualNode<TNodeData = any>
  extends Omit<GraphNode<TNodeData>, keyof EntityRect>, EntityRect {
  shape: string;
}

export interface VisualEdge<TEdgeData = any>
  extends Omit<GraphEdge<TEdgeData>, keyof EntityRect>, EntityRect {}

export interface VisualGraph<
  TNodeData = any,
  TEdgeData = any,
  TGraphData = any,
> extends Omit<Graph<TNodeData, TEdgeData, TGraphData>, 'nodes' | 'edges'> {
  nodes: VisualNode<TNodeData>[];
  edges: VisualEdge<TEdgeData>[];
  direction: 'up' | 'down' | 'left' | 'right';
}

export interface VisualGraphConfig<
  TNodeData = any,
  TEdgeData = any,
  TGraphData = any,
> extends GraphConfig<TNodeData, TEdgeData, TGraphData> {
  direction?: 'up' | 'down' | 'left' | 'right';
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

export interface SinglePathOptions<TEdgeData = any> {
  /** Source node ID. Default: graph.initialNodeId, else sole inDegree-0 node */
  from?: string;
  /** Target node ID. Required for single-path queries. */
  to: string;
  /** Edge weight function. Default: every edge = 1. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
}

// --- Algorithm option types ---

export interface TraversalOptions {
  /** Source node ID. Default: graph.initialNodeId, else sole inDegree-0 node */
  from?: string;
}

export interface MSTOptions<TEdgeData = any> {
  /** Algorithm to use. Default: 'prim'. */
  algorithm?: 'prim' | 'kruskal';
  /** Edge weight function. Default: every edge = 1. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
}

export interface AllPairsShortestPathsOptions<TEdgeData = any> {
  /** Algorithm to use. Default: 'dijkstra'. */
  algorithm?: 'floyd-warshall' | 'dijkstra';
  /** Edge weight function. Default: every edge = 1. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
}

// --- Diff types (read-only summary) ---

export interface NodeChange<TNodeData = any> {
  id: string;
  old: Partial<GraphNode<TNodeData>>;
  new: Partial<GraphNode<TNodeData>>;
}

export interface EdgeChange<TEdgeData = any> {
  id: string;
  old: Partial<GraphEdge<TEdgeData>>;
  new: Partial<GraphEdge<TEdgeData>>;
}

export interface GraphDiff<TNodeData = any, TEdgeData = any> {
  nodes: {
    added: NodeConfig<TNodeData>[];
    removed: NodeConfig<TNodeData>[];
    updated: NodeChange<TNodeData>[];
  };
  edges: {
    added: EdgeConfig<TEdgeData>[];
    removed: EdgeConfig<TEdgeData>[];
    updated: EdgeChange<TEdgeData>[];
  };
}

// --- Patch types (operational) ---

export type GraphPatch<TNodeData = any, TEdgeData = any> =
  | { op: 'addNode'; node: NodeConfig<TNodeData>; description?: string }
  | {
      op: 'updateNode';
      id: string;
      data: Partial<Omit<NodeConfig<TNodeData>, 'id'>>;
      description?: string;
    }
  | { op: 'deleteNode'; id: string; description?: string }
  | { op: 'addEdge'; edge: EdgeConfig<TEdgeData>; description?: string }
  | {
      op: 'updateEdge';
      id: string;
      data: Partial<Omit<EdgeConfig<TEdgeData>, 'id'>>;
      description?: string;
    }
  | { op: 'deleteEdge'; id: string; description?: string };

// --- Transition exploration options ---

export interface TransitionOptions<TState, TEvent> {
  /** Initial state to begin BFS exploration from. */
  initialState: TState;
  /** Events to try at each state. Array or function of state. */
  events: TEvent[] | ((state: TState) => TEvent[]);
  /** Serialize state to unique string for node dedup. Default: JSON.stringify */
  serializeState?: (state: TState) => string;
  /** Serialize event to string for edge labels/IDs. Default: JSON.stringify */
  serializeEvent?: (event: TEvent) => string;
  /** Max BFS iterations before throwing. Default: Infinity */
  limit?: number;
  /** When true, node is kept but outgoing transitions are not explored. */
  stopWhen?: (state: TState) => boolean;
  /** Optional graph ID. */
  id?: string;
}
