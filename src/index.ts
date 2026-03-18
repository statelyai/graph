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
  AStarOptions,
  TraversalOptions,
  MSTOptions,
  AllPairsShortestPathsOptions,
  NodeChange,
  EdgeChange,
  GraphDiff,
  GraphPatch,
  TransitionOptions,
  GraphFormatConverter,
  WalkOptions,
  WeightedWalkOptions,
  WalkContext,
  CoverageStats,
} from './types';

// Factory & helpers
export {
  createGraph,
  createGraphNode,
  createGraphEdge,
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
  getRelativeDistanceMap,
  getRelativeDistance,
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
  getAStarPath,
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
export { flatten, getSubgraph, reverseGraph } from './transforms';

// Walks (MBT)
export {
  genRandomWalk,
  genWeightedRandomWalk,
  genQuickRandomWalk,
  genPredefinedWalk,
  takeSteps,
  takeUntilNode,
  takeUntilEdge,
  takeUntilNodeCoverage,
  takeUntilEdgeCoverage,
  getCoverage,
} from './walks';

// Formats — use subpath imports: @statelyai/graph/dot, @statelyai/graph/mermaid, etc.
// Only createFormatConverter is re-exported from the main entry for convenience.
export { createFormatConverter } from './formats/converter';
