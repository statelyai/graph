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
  getShortestPaths,
  getSimplePaths,
} from './algorithms';

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
