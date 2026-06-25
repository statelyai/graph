// Types
export type {
  EntityRect,
  Point,
  EdgeRouting,
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
  EigenvectorCentralityOptions,
  KatzCentralityOptions,
  HITSResult,
  GirvanNewmanOptions,
  LabelPropagationOptions,
  IsomorphismOptions,
  LouvainOptions,
  MaxFlowOptions,
  MaxFlowResult,
  MinCutOptions,
  MinCutResult,
  BipartiteMatch,
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
  genBFS,
  genDFS,
  bfs,
  dfs,
  isAcyclic,
  getConnectedComponents,
  getTopologicalSort,
  hasPath,
  getJoinedPath,
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
  getKatzCentrality,
  getCoreNumbers,
  getKCore,
  isBipartite,
  getMaximumBipartiteMatching,
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
  getMinCut,
  getDominatorTree,
  getTransitiveReduction,
} from './algorithms';

// Generators
export {
  createCompleteGraph,
  createGridGraph,
  createRandomGraph,
} from './generators';

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
  getInvertedDiff,
  invertDiff,
  getPatches,
  updateGraphWithPatches,
  applyPatches,
  toPatches,
  toDiff,
} from './diff';

// Transforms
export {
  getFlattenedGraph,
  flatten,
  getSubgraph,
  getReversedGraph,
  reverseGraph,
} from './transforms';

// Walks (MBT)
export {
  genRandomWalk,
  genWeightedRandomWalk,
  genQuickRandomWalk,
  genPredefinedWalk,
  genWalkSteps,
  genWalkUntilNode,
  genWalkUntilEdge,
  genWalkUntilNodeCoverage,
  genWalkUntilEdgeCoverage,
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
