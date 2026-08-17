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
  PathContainment,
  PathCoverageTarget,
  PathCoverageKind,
  PathCoverageStats,
  PathReductionOptions,
  CoveragePreservingPathsOptions,
  EdgeCoveragePathsOptions,
  EdgeCoveragePathsResult,
  ShortestSimplePathsOptions,
  EulerianPathOptions,
  NodeSelector,
  PathOptions,
  SinglePathOptions,
  AStarOptions,
  TraversalOptions,
  TraversalDirection,
  TraversalSearchOptions,
  PostorderOptions,
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
  GraphColoring,
  GraphColoringOptions,
  TSPTour,
  TSPOptions,
  SteinerTreeOptions,
} from './algorithms';
export type {
  DisjointUnionOptions,
  GraphComplementOptions,
} from './set-operations';
export type { NeighborhoodOptions } from './neighborhood';

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

// Immutable operations
export {
  getGraphWithNode,
  getGraphWithEdge,
  getGraphWithoutNode,
  getGraphWithoutEdge,
  getGraphWithUpdatedNode,
  getGraphWithUpdatedEdge,
  getGraphWithEntities,
  getGraphWithoutEntities,
  getGraphWithUpdatedEntities,
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
  genPostorder,
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
  genAllPairsShortestPaths,
  getAStarPath,
  genShortestSimplePaths,
  getShortestSimplePaths,
  getEulerianPath,
  getEulerianCircuit,
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
  getGraphColoring,
  isValidColoring,
  isPlanar,
  getTSPTour,
  getSteinerTree,
} from './algorithms';

// Generators
export {
  createCompleteGraph,
  createGridGraph,
  createRandomGraph,
  createWattsStrogatzGraph,
  createBarabasiAlbertGraph,
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
  getPatchedGraph,
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
  getMappedGraph,
  getFilteredGraph,
  getLineGraph,
  getReversedGraph,
  reverseGraph,
} from './transforms';
export type {
  MappedGraphOptions,
  FilteredGraphOptions,
} from './transforms';
export { getNeighborhood } from './neighborhood';

// Set operations
export {
  getGraphUnion,
  getGraphIntersection,
  getGraphDifference,
  getGraphSymmetricDifference,
  getDisjointUnion,
  getGraphComplement,
} from './set-operations';

// Paths & coverage
export {
  getPathNodes,
  getPathEdges,
  getPathWeight,
  isValidPath,
  hasSubpath,
  getReducedPaths,
} from './path-utils';
export {
  getCoverageTargets,
  getPathCoverage,
  getCoveragePreservingPaths,
  getEdgeCoveragePaths,
} from './coverage';

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
