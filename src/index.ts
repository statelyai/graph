// Types
export type {
  EntityRect,
  GraphMode,
  GraphEntity,
  VisualGraphEntity,
  PortDirection,
  PortConfig,
  GraphPort,
  VisualPort,
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
  NodeUpdate,
  EdgeUpdate,
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
  VisualGraphFormatConverter,
  WalkOptions,
  WeightedWalkOptions,
  WalkContext,
  CoverageStats,
} from './types';
export type {
  IterativeCentralityOptions,
  HITSResult,
  GirvanNewmanOptions,
  LabelPropagationOptions,
  IsomorphismOptions,
  LouvainOptions,
  MaxFlowOptions,
  MaxFlowResult,
  DominatorTreeOptions,
} from './algorithms';

// Factory & helpers
export {
  createGraph,
  createGraphNode,
  createGraphEdge,
  createGraphPort,
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

// Mode helpers
export { getEdgeMode, isEdgeDirected } from './mode';

// Validation
export { getGraphIssues } from './validate';
export type { GraphIssue } from './validate';

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
  getEdgesBetween,
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
  getPort,
  getPorts,
  getEdgesByPort,
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
  getDegreeCentrality,
  getInDegreeCentrality,
  getOutDegreeCentrality,
  getClosenessCentrality,
  getBetweennessCentrality,
  getPageRank,
  getHITS,
  getEigenvectorCentrality,
  getLabelPropagationCommunities,
  genGirvanNewmanCommunities,
  getGirvanNewmanCommunities,
  getGreedyModularityCommunities,
  getModularity,
  getBridges,
  getArticulationPoints,
  getBiconnectedComponents,
  isIsomorphic,
  getLouvainCommunities,
  getMaxFlow,
  getDominatorTree,
  getTransitiveReduction,
} from './algorithms';

// Equivalence
export {
  areEntitiesEqual,
  isLayoutEqual,
  isNonLayoutEqual,
  LAYOUT_KEYS,
} from './equivalence';

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
