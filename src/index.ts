// Types
export type {
  EntityRect as Positioned,
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
  TransitionOptions,
  GraphFormatConverter,
} from './types';

// Factory & helpers
export {
  createGraph,
  createVisualGraph,
  createGraphFromTransition,
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
export { addEntities, deleteEntities, updateEntities } from './graph';

// Class wrapper
export { GraphInstance } from './graph';

// Indexing
export { invalidateIndex } from './indexing';


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
  joinPaths,
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
  toPatches,
  toDiff,
} from './diff';

// Transforms
export { flatten } from './transforms';

// Formats (dep-free only; GraphML requires @statelyai/graph/formats/graphml)
export {
  toDOT,
  toAdjacencyList,
  fromAdjacencyList,
  toEdgeList,
  fromEdgeList,
  createFormatConverter,
  adjacencyListConverter,
  edgeListConverter,
} from './formats';
