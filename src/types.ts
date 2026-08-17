// --- Base interfaces (DRY) ---

/**
 * Directedness of a graph or an individual edge.
 *
 * - `'directed'` — edge points from source to target.
 * - `'undirected'` — edge has no direction; traversable both ways.
 * - `'bidirectional'` — edge points both ways (arrows on both ends).
 *
 * Set at the graph level as the default ({@link Graph.mode}); individual edges
 * may override it ({@link GraphEdge.mode}).
 */
export type GraphMode = 'directed' | 'undirected' | 'bidirectional';

export interface EntityRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A 2D point, used for edge routing waypoints. */
export interface Point {
  x: number;
  y: number;
}

/**
 * How an edge's {@link GraphEdge.points} should be interpreted by renderers:
 *
 * - `'polyline'` — straight segments through the points.
 * - `'orthogonal'` — axis-aligned segments (ELK layered routing).
 * - `'splines'` — bezier control points (Graphviz convention: 3n+1 chained
 *   cubic curves, tail → head).
 */
export type EdgeRouting = 'polyline' | 'orthogonal' | 'splines';

/** Shared optional visual/style props for nodes, edges, ports. */
export interface GraphEntity {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  style?: Record<string, string | number | boolean>;
}

/** Visual entity base — required position/size. */
export interface VisualGraphEntity {
  x: number;
  y: number;
  width: number;
  height: number;
  style?: Record<string, string | number | boolean>;
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
  /** Default directedness for all edges. Defaults to `'directed'`. */
  mode?: GraphMode;
  initialNodeId?: string | null;
  nodes?: NodeConfig<TNodeData, TPortData>[];
  edges?: EdgeConfig<TEdgeData>[];
  data?: TGraphData;
  direction?: 'up' | 'down' | 'left' | 'right';
  style?: Record<string, string | number | boolean>;
}

export interface NodeConfig<TNodeData = any, TPortData = any>
  extends GraphEntity {
  id: string;
  parentId?: string | null;
  initialNodeId?: string | null;
  label?: string | null;
  data?: TNodeData;
  ports?: PortConfig<TPortData>[];
  shape?: string;
  color?: string;
}

/**
 * Note on edge geometry: an edge's `x`/`y`/`width`/`height` are canonically
 * the **label rect** (top-left + size). Layout adapters write computed edge
 * label positions here, and engines that need label dimensions as input
 * (dagre, ELK) read `width`/`height`. The edge's *route* lives in
 * {@link EdgeConfig.points}.
 */
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
  /**
   * Per-edge directedness override. When absent, the edge inherits the graph's
   * {@link GraphConfig.mode}.
   */
  mode?: GraphMode;
  /**
   * Edge route waypoints (including endpoints, tail → head), as computed by a
   * layout engine. Interpretation is governed by {@link EdgeConfig.routing}.
   */
  points?: Point[];
  /** How {@link EdgeConfig.points} should be interpreted. Default: polyline. */
  routing?: EdgeRouting;
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
  /** Default directedness for all edges. */
  mode: GraphMode;
  initialNodeId?: string | null;
  nodes: GraphNode<TNodeData, TPortData>[];
  edges: GraphEdge<TEdgeData>[];
  data: TGraphData;
  direction?: 'up' | 'down' | 'left' | 'right';
  style?: Record<string, string | number | boolean>;
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

/**
 * Note on edge geometry: an edge's `x`/`y`/`width`/`height` are canonically
 * the **label rect** (top-left + size); the edge's *route* lives in
 * {@link GraphEdge.points}. See {@link EdgeConfig} for details.
 */
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
  /**
   * Per-edge directedness override. When absent, the edge inherits the graph's
   * {@link Graph.mode}.
   */
  mode?: GraphMode;
  /**
   * Edge route waypoints (including endpoints, tail → head), as computed by a
   * layout engine. Interpretation is governed by {@link GraphEdge.routing}.
   */
  points?: Point[];
  /** How {@link GraphEdge.points} should be interpreted. Default: polyline. */
  routing?: EdgeRouting;
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

// --- Update types (input, lenient) ---

/**
 * Update payload for {@link updateNode}/`updateEntities`.
 *
 * Optional fields (`x`, `y`, `width`, `height`, `shape`, `color`, `style`,
 * `ports`) accept `null` to **unset** the field. `undefined` (or omitting the
 * key) leaves the field unchanged. `null` is used for unsetting so update
 * payloads stay JSON-serializable.
 */
export interface NodeUpdate<TNodeData = any, TPortData = any> {
  parentId?: string | null;
  initialNodeId?: string | null;
  label?: string | null;
  data?: TNodeData;
  /** New ports for the node, or `null` to remove all ports. */
  ports?: PortConfig<TPortData>[] | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  shape?: string | null;
  color?: string | null;
  style?: Record<string, string | number | boolean> | null;
}

/**
 * Update payload for {@link updateEdge}/`updateEntities`.
 *
 * Optional fields (`weight`, `mode`, `sourcePort`, `targetPort`, `x`, `y`,
 * `width`, `height`, `color`, `style`) accept `null` to **unset** the field.
 * `undefined` (or omitting the key) leaves the field unchanged. `null` is
 * used for unsetting so update payloads stay JSON-serializable.
 */
export interface EdgeUpdate<TEdgeData = any> {
  sourceId?: string;
  targetId?: string;
  label?: string | null;
  data?: TEdgeData;
  weight?: number | null;
  mode?: GraphMode | null;
  /** Port name on the source node, or `null` to clear the port reference. */
  sourcePort?: string | null;
  /** Port name on the target node, or `null` to clear the port reference. */
  targetPort?: string | null;
  /** Edge route waypoints, or `null` to clear the route. */
  points?: Point[] | null;
  routing?: EdgeRouting | null;
  x?: number | null;
  y?: number | null;
  width?: number | null;
  height?: number | null;
  color?: string | null;
  style?: Record<string, string | number | boolean> | null;
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
  nodes?: (NodeUpdate<TNodeData, TPortData> & { id: string })[];
  edges?: (EdgeUpdate<TEdgeData> & { id: string })[];
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

export type PathContainment = 'prefix' | 'contiguous';

export type PathCoverageTarget =
  | { type: 'node'; nodeId: string }
  | { type: 'edge'; edgeId: string }
  | { type: 'subpath'; edgeIds: string[]; sourceId?: string };

export type PathCoverageKind =
  | 'nodes'
  | 'edges'
  | 'edge-pairs'
  | 'maximal-simple-paths';

export interface PathCoverageStats {
  nodeCoverage: number;
  edgeCoverage: number;
  coveredNodeIds: string[];
  coveredEdgeIds: string[];
  coveredTargets: PathCoverageTarget[];
  uncoveredTargets: PathCoverageTarget[];
  totalSteps: number;
}

export interface PathReductionOptions {
  /** Default: `'contiguous'`. */
  containment?: PathContainment;
}

export interface CoveragePreservingPathsOptions {
  targets: PathCoverageTarget[];
  /** Default: `'greedy'`. Exact selection is exponential in path count. */
  strategy?: 'greedy' | 'exact';
  /** Maximum candidate paths accepted by exact selection. Default: 24. */
  exactLimit?: number;
}

export interface EdgeCoveragePathsOptions<
  TEdgeData = any,
  TNodeData = any,
> {
  /** Allowed path sources. Default: graph initial/root source. */
  from?: NodeSelector<TNodeData>;
  /** Optional allowed path destinations. Without this, paths end at the covered edge. */
  to?: NodeSelector<TNodeData>;
  /** Non-negative edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
  /** Candidate-set reduction. Default: `'greedy'`. */
  reduce?: false | 'prefix' | 'greedy' | 'exact';
  /** Maximum candidates accepted by exact reduction. Default: 24. */
  exactLimit?: number;
}

export interface EdgeCoveragePathsResult<
  TNodeData = any,
  TEdgeData = any,
> {
  paths: GraphPath<TNodeData, TEdgeData>[];
  coveredEdgeIds: string[];
  uncoveredEdgeIds: string[];
  totalWeight: number;
  /** Individual access paths are shortest; the complete path set is heuristic. */
  optimal: false;
}

export interface ShortestSimplePathsOptions<TEdgeData = any> {
  from: string;
  to: string;
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
  /** Maximum paths to yield/return. Omit to enumerate every simple path by cost. */
  limit?: number;
}

export interface EulerianPathOptions {
  /** Required start node. Otherwise inferred from graph degree and initial node. */
  from?: string;
}

export type NodeSelector<TNodeData = any> =
  | string
  | ((node: GraphNode<TNodeData>) => boolean);

export interface PathOptions<TEdgeData = any, TNodeData = any> {
  /** Source node ID or predicate. Predicates fan out from every matching node. Default: graph.initialNodeId, else sole inDegree-0 node. */
  from?: NodeSelector<TNodeData>;
  /** Target node ID. If omitted → paths to all reachable nodes */
  to?: string;
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
  /** Algorithm to use. Default: 'dijkstra'. Use 'bellman-ford' for negative weights. */
  algorithm?: 'dijkstra' | 'bellman-ford';
}

export interface SinglePathOptions<TEdgeData = any, TNodeData = any> {
  /** Source node ID or predicate. For multiple matches, returns the globally shortest path; graph order breaks ties. Default: graph.initialNodeId, else sole inDegree-0 node. */
  from?: NodeSelector<TNodeData>;
  /** Target node ID. Required for single-path queries. */
  to: string;
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
  /** Algorithm to use. Default: 'dijkstra'. Use 'bellman-ford' for negative weights. */
  algorithm?: 'dijkstra' | 'bellman-ford';
}

export interface AStarOptions<TEdgeData = any, TNodeData = any> {
  /** Source node ID or predicate. For multiple matches, returns the globally shortest path; graph order breaks ties. */
  from: NodeSelector<TNodeData>;
  /** Target node ID. */
  to: string;
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
  /**
   * Heuristic function estimating cost from a node to the target.
   * Must return a finite number and be admissible (never overestimates the
   * actual cost).
   */
  heuristic: (nodeId: string) => number;
}

// --- Algorithm option types ---

export interface TraversalOptions {
  /** Source node ID. Default: graph.initialNodeId, else sole inDegree-0 node */
  from?: string;
}

export type TraversalDirection = 'outgoing' | 'incoming' | 'undirected';

/** Options for lazy breadth-first and depth-first graph traversal. */
export interface TraversalSearchOptions {
  /** One or more source node IDs. Unknown IDs are ignored. */
  from: string | readonly string[];
  /** Edge direction to follow. Default: `'outgoing'`. */
  direction?: TraversalDirection;
  /** Maximum edge distance from a source. Default: `Infinity`. */
  radius?: number;
}

/** Options for eager postorder traversal with optional start-node inference. */
export interface PostorderOptions
  extends Omit<TraversalSearchOptions, 'from'> {
  /** One or more source node IDs. Defaults to the graph's inferred source. */
  from?: TraversalSearchOptions['from'];
}

export interface MSTOptions<TEdgeData = any> {
  /** Algorithm to use. Default: 'prim'. */
  algorithm?: 'prim' | 'kruskal';
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
}

export interface AllPairsShortestPathsOptions<TEdgeData = any> {
  /** Algorithm to use. Default: 'dijkstra'. Use 'bellman-ford' for negative weights. */
  algorithm?: 'floyd-warshall' | 'dijkstra' | 'bellman-ford';
  /** Edge weight function. Default: `(e) => e.weight ?? 1`. */
  getWeight?: (edge: GraphEdge<TEdgeData>) => number;
  /**
   * Abort signal, checked once per source node (dijkstra/bellman-ford) or per
   * intermediate node `k` (floyd-warshall). Throws `signal.reason`.
   */
  signal?: AbortSignal;
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
      data: NodeUpdate<TNodeData>;
      description?: string;
    }
  | { op: 'deleteNode'; id: string; description?: string }
  | { op: 'addEdge'; edge: EdgeConfig<TEdgeData>; description?: string }
  | {
      op: 'updateEdge';
      id: string;
      data: EdgeUpdate<TEdgeData>;
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
