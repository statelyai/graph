// Types
export type {
  Graph,
  GraphNode,
  GraphEdge,
  GraphConfig,
  NodeConfig,
  EdgeConfig,
  DeleteNodeOptions,
  EntitiesConfig,
  EntitiesUpdate,
  GraphStep,
  GraphPath,
  PathOptions,
  SinglePathOptions,
  TraversalOptions,
  MSTOptions,
  AllPairsShortestPathsOptions,
} from './types';

// Factory & helpers
export {
  createGraph,
  getNode,
  getEdge,
  hasNode,
  hasEdge,
} from './graph';

// Mutable single operations
export {
  addNode,
  addEdge,
  deleteNode,
  deleteEdge,
  updateNode,
  updateEdge,
} from './graph';

// Mutable batch operations
export {
  addEntities,
  deleteEntities,
  updateEntities,
} from './graph';

// Class wrapper
export { GraphInstance } from './graph';

// Indexing
export { invalidateIndex } from './indexing';

// Schemas
export { GraphSchema, NodeSchema, EdgeSchema } from './schemas';

// Queries
export {
  neighbors,
  successors,
  predecessors,
  degree,
  inDegree,
  outDegree,
  edgesOf,
  inEdges,
  outEdges,
  edgeBetween,
  children,
  parent,
  ancestors,
  descendants,
  roots,
  getSources,
  getSinks,
} from './queries';

// Algorithms
export {
  bfs,
  dfs,
  isAcyclic,
  connectedComponents,
  topologicalSort,
  hasPath,
  isConnected,
  isTree,
  getShortestPath,
  getShortestPaths,
  genShortestPaths,
  getSimplePath,
  getSimplePaths,
  genSimplePaths,
  getStronglyConnectedComponents,
  getCycles,
  genCycles,
  getPreorder,
  getPostorder,
  getPreorders,
  getPostorders,
  genPreorders,
  genPostorders,
  getMinimumSpanningTree,
  getAllPairsShortestPaths,
} from './algorithms';

// Transforms
export { flatten } from './transforms';

// Formats
export {
  toGraphML,
  fromGraphML,
  toDOT,
  toAdjacencyList,
  fromAdjacencyList,
  toEdgeList,
  fromEdgeList,
} from './formats';
