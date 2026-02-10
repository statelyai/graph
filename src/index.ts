// Types
export type {
  Positioned,
  Graph,
  GraphNode,
  GraphEdge,
  GraphConfig,
  NodeConfig,
  EdgeConfig,
  VisualGraph,
  VisualNode,
  VisualEdge,
  VisualGraphConfig,
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
  NodeChange,
  EdgeChange,
  GraphDiff,
  GraphPatch,
} from './types';

// Factory & helpers
export {
  createGraph,
  createVisualGraph,
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
  getNeighbors,
  getSuccessors,
  getPredecessors,
  getDegree,
  getInDegree,
  getOutDegree,
  getEdgesOf,
  getInEdges,
  getOutEdges,
  getEdgeBetween,
  getChildren,
  getParent,
  getAncestors,
  getDescendants,
  getRoots,
  isCompound,
  isLeaf,
  getDepth,
  getSiblings,
  getLCA,
  getSources,
  getSinks,
} from './queries';

// Algorithms
export {
  bfs,
  dfs,
  isAcyclic,
  getConnectedComponents,
  getTopologicalSort,
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

// Diff & Patches
export {
  getDiff,
  isEmptyDiff,
  invertDiff,
  getPatches,
  applyPatches,
  invertPatch,
  invertPatches,
  toPatches,
  toDiff,
} from './diff';

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
