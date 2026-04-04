// --- Base interfaces (DRY) ---

export interface EntityRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Shared optional visual/style props for nodes, edges, ports. */
export interface GraphEntity {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  style?: Record<string, string | number>;
}

/** Visual entity base — required position/size. */
export interface VisualGraphEntity {
  x: number;
  y: number;
  width: number;
  height: number;
  style?: Record<string, string | number>;
}

// --- Port types ---

export type PortDirection = 'in' | 'out' | 'inout';

export interface PortConfig<TPortData = any> extends GraphEntity {
  name: string;
  direction?: PortDirection;
  label?: string;
  data?: TPortData;
}

export interface GraphPort<TPortData = any> extends GraphEntity {
  name: string;
  direction: PortDirection;
  label?: string;
  data: TPortData;
}

export interface VisualPort<TPortData = any> extends GraphPort<TPortData> {
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
  TPortData = any,
> {
  id?: string;
  type?: 'directed' | 'undirected';
  initialNodeId?: string;
  nodes?: NodeConfig<TNodeData, TPortData>[];
  edges?: EdgeConfig<TEdgeData>[];
  data?: TGraphData;
  direction?: 'up' | 'down' | 'left' | 'right';
  style?: Record<string, string | number>;
}

export interface NodeConfig<TNodeData = any, TPortData = any>
  extends GraphEntity {
  id: string;
  parentId?: string | null;
  initialNodeId?: string;
  label?: string | null;
  data?: TNodeData;
  ports?: PortConfig<TPortData>[];
  shape?: string;
  color?: string;
}

export interface EdgeConfig<TEdgeData = any> extends GraphEntity {
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
  label?: string | null;
  /**
   * Optional numeric weight for the edge.
   * Used by pathfinding, MST, and other weighted algorithms.
   * When `getWeight` is not provided, algorithms default to `edge.weight ?? 1`.
   */
  weight?: number;
  /** Port name on the source node this edge connects from. */
  sourcePort?: string;
  /** Port name on the target node this edge connects to. */
  targetPort?: string;
  data?: TEdgeData;
  color?: string;
}

// --- Primary types (plain JSON-serializable objects) ---

export interface Graph<
  TNodeData = any,
  TEdgeData = any,
  TGraphData = any,
  TPortData = any,
> {
  id: string;
  type: 'directed' | 'undirected';
  initialNodeId?: string | null;
  nodes: GraphNode<TNodeData, TPortData>[];
  edges: GraphEdge<TEdgeData>[];
  data: TGraphData;
  direction?: 'up' | 'down' | 'left' | 'right';
  style?: Record<string, string | number>;
}

export interface GraphNode<TNodeData = any, TPortData = any>
  extends GraphEntity {
  type: 'node';
  id: string;
  parentId?: string | null;
  initialNodeId?: string | null;
  label?: string | null;
  data: TNodeData;
  ports?: GraphPort<TPortData>[];
  shape?: string;
  color?: string;
}

export interface GraphEdge<TEdgeData = any> extends GraphEntity {
  type: 'edge';
  id: string;
  sourceId: string;
  targetId: string;
  label?: string | null;
  /**
   * Optional numeric weight for the edge.
   * Used by pathfinding, MST, and other weighted algorithms.
   * When `getWeight` is not provided, algorithms default to `edge.weight ?? 1`.
   */
  weight?: number;
  /** Port name on the source node this edge connects from. */
  sourcePort?: string;
  /** Port name on the target node this edge connects to. */
  targetPort?: string;
  data: TEdgeData;
  color?: string;
}

// --- Visual types (required position/size) ---

export interface VisualNode<TNodeData = any, TPortData = any>
  extends GraphNode<TNodeData, TPortData> {
  x: number;
  y: number;
  width: number;
  height: number;
  ports?: VisualPort<TPortData>[];
}

export interface VisualEdge<TEdgeData = any> extends GraphEdge<TEdgeData> {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface VisualGraph<
  TNodeData = any,
  TEdgeData = any,
  TGraphData = any,
  TPortData = any,
> extends Omit<
    Graph<TNodeData, TEdgeData, TGraphData, TPortData>,
    'nodes' | 'edges'
  > {
  nodes: VisualNode<TNodeData, TPortData>[];
  edges: VisualEdge<TEdgeData>[];
  direction: 'up' | 'down' | 'left' | 'right';
}

export interface VisualGraphConfig<
  TNodeData = any,
  TEdgeData = any,
  TGraphData = any,
  TPortData = any,
> extends GraphConfig<TNodeData, TEdgeData, TGraphData, TPortData> {
  direction?: 'up' | 'down' | 'left' | 'right';
}

export interface DeleteNodeOptions {
  reparent?: boolean;
}

export interface EntitiesConfig<
  TNodeData = any,
  TEdgeData = any,
  TPortData = any,
> {
  nodes?: NodeConfig<TNodeData, TPortData>[];
  edges?: EdgeConfig<TEdgeData>[];
}

export interface EntitiesUpdate<
  TNodeData = any,
  TEdgeData = any,
  TPortData = any,
> {
  nodes?: (Partial<Omit<NodeConfig<TNodeData, TPortData>, 'id'>> & {
    id: string;
  })[];
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
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
}

export interface SinglePathOptions<TEdgeData = any> {
  /** Source node ID. Default: graph.initialNodeId, else sole inDegree-0 node */
  from?: string;
  /** Target node ID. Required for single-path queries. */
  to: string;
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
}

export interface AStarOptions<TEdgeData = any> {
  /** Source node ID. */
  from: string;
  /** Target node ID. */
  to: string;
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
  /**
   * Heuristic function estimating cost from a node to the target.
   * Must be admissible (never overestimates the actual cost).
   */
  heuristic: (nodeId: string) => number;
}

// --- Algorithm option types ---

export interface TraversalOptions {
  /** Source node ID. Default: graph.initialNodeId, else sole inDegree-0 node */
  from?: string;
}

export interface MSTOptions<TEdgeData = any> {
  /** Algorithm to use. Default: 'prim'. */
  algorithm?: 'prim' | 'kruskal';
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
}

export interface AllPairsShortestPathsOptions<TEdgeData = any> {
  /** Algorithm to use. Default: 'dijkstra'. */
  algorithm?: 'floyd-warshall' | 'dijkstra';
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
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

// --- Format converter ---

/**
 * A bidirectional converter between `Graph` and a serialized format.
 *
 * Implement this interface to create a custom format converter.
 *
 * @example
 * ```ts
 * const myConverter: GraphFormatConverter<string> = {
 *   to(graph) { return JSON.stringify(graph); },
 *   from(input) { return JSON.parse(input); },
 * };
 * ```
 */
export interface GraphFormatConverter<TSerial, N = any, E = any, G = any> {
  /** Convert a Graph to the serialized format. */
  to(graph: Graph<N, E, G>): TSerial;
  /** Convert from the serialized format to a Graph. */
  from(input: TSerial): Graph<N, E, G>;
}

/**
 * A bidirectional converter between `VisualGraph` and a serialized format.
 *
 * Use this for formats that carry position/size data (e.g. xyflow, cytoscape).
 */
export interface VisualGraphFormatConverter<TSerial, N = any, E = any, G = any> {
  /** Convert a VisualGraph to the serialized format. */
  to(graph: VisualGraph<N, E, G>): TSerial;
  /** Convert from the serialized format to a VisualGraph. */
  from(input: TSerial): VisualGraph<N, E, G>;
}

// --- Walk types ---

export interface WalkOptions<TEdgeData = any> {
  /** Start node ID. Default: graph.initialNodeId, else sole inDegree-0 node */
  from?: string;
  /** Seed for deterministic RNG. Omit for Math.random. */
  seed?: number;
  /** Guard: only traverse edges where filter returns true. */
  filter?: (edge: GraphEdge<TEdgeData>, context: WalkContext) => boolean;
  /** Callback fired after each step. */
  onStep?: (step: GraphStep<any, TEdgeData>, context: WalkContext) => void;
}

export interface WeightedWalkOptions<TEdgeData = any>
  extends WalkOptions<TEdgeData> {
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
}

export interface WalkContext {
  currentNodeId: string;
  visitedNodes: Set<string>;
  visitedEdges: Set<string>;
  stepCount: number;
}

export interface CoverageStats {
  nodeCoverage: number;
  edgeCoverage: number;
  visitedNodes: string[];
  visitedEdges: string[];
  totalSteps: number;
}

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
