import { describe, expect, it } from 'vitest';

import * as api from '../src/index';
import { createGraph } from '../src/graph';
import type { Graph, GraphPath } from '../src/types';

/**
 * Contract matrix: every public graph query/algorithm runs against a set of
 * edge-case fixtures and must
 *
 * - not throw, except where a fixture is listed in its `throws` (documented
 *   argument errors such as a cyclic input to a DAG-only algorithm);
 * - return no `undefined` inside arrays and only well-formed paths whose
 *   steps follow real edges of the input graph;
 * - leave the input graph untouched and return the same result twice;
 * - treat unknown node ids as "not found" (`undefined`, `false`, `0`, empty
 *   collection, empty graph, or an empty generator) instead of throwing;
 * - survive a 20,000-deep chain and hierarchy without overflowing the stack.
 *
 * Every export must be either specified here or excluded with a reason, so
 * new public functions cannot skip the contract.
 */

type FixtureName =
  | 'empty'
  | 'single'
  | 'directedLoop'
  | 'undirectedLoop'
  | 'parallelDirected'
  | 'parallelUndirected'
  | 'mixed'
  | 'dangling'
  | 'disconnected'
  | 'compound'
  | 'unknownIds'
  | 'deep';

interface Fixture {
  graph: () => Graph;
  /** Node ids passed as arguments (unknown for `empty` and `unknownIds`) */
  a: string;
  b: string;
}

const edge = (
  id: string,
  sourceId: string,
  targetId: string,
  extra: Record<string, unknown> = {},
) => ({ id, sourceId, targetId, ...extra });
const nodes = (...ids: string[]) => ids.map((id) => ({ id }));
const DEEP = 20_000;

const fixtures: Record<FixtureName, Fixture> = {
  empty: { graph: () => createGraph({}), a: 'a', b: 'b' },
  single: { graph: () => createGraph({ nodes: nodes('a') }), a: 'a', b: 'a' },
  directedLoop: {
    graph: () =>
      createGraph({
        nodes: nodes('a', 'b'),
        edges: [edge('aa', 'a', 'a'), edge('ab', 'a', 'b')],
      }),
    a: 'a',
    b: 'b',
  },
  undirectedLoop: {
    graph: () =>
      createGraph({
        mode: 'undirected',
        nodes: nodes('a', 'b'),
        edges: [edge('aa', 'a', 'a'), edge('ab', 'a', 'b')],
      }),
    a: 'a',
    b: 'b',
  },
  parallelDirected: {
    graph: () =>
      createGraph({
        nodes: nodes('a', 'b', 'c'),
        edges: [edge('ab1', 'a', 'b'), edge('ab2', 'a', 'b'), edge('bc', 'b', 'c')],
      }),
    a: 'a',
    b: 'c',
  },
  parallelUndirected: {
    graph: () =>
      createGraph({
        mode: 'undirected',
        nodes: nodes('a', 'b', 'c'),
        edges: [edge('ab1', 'a', 'b'), edge('ab2', 'a', 'b'), edge('bc', 'b', 'c')],
      }),
    a: 'a',
    b: 'c',
  },
  mixed: {
    graph: () =>
      createGraph({
        nodes: nodes('a', 'b', 'c'),
        edges: [
          edge('ab', 'a', 'b'),
          edge('bc', 'b', 'c', { mode: 'undirected' }),
          edge('ca', 'c', 'a'),
        ],
      }),
    a: 'a',
    b: 'c',
  },
  dangling: {
    graph: () =>
      createGraph({
        nodes: nodes('a', 'b'),
        edges: [edge('ab', 'a', 'b'), edge('bz', 'b', 'zz'), edge('za', 'zz', 'a')],
      }),
    a: 'a',
    b: 'b',
  },
  disconnected: {
    graph: () =>
      createGraph({
        nodes: nodes('a', 'b', 'c', 'd'),
        edges: [edge('ab', 'a', 'b'), edge('cd', 'c', 'd')],
      }),
    a: 'a',
    b: 'd',
  },
  compound: {
    graph: () =>
      createGraph({
        nodes: [
          { id: 'p', initialNodeId: 'a' },
          { id: 'a', parentId: 'p' },
          { id: 'b', parentId: 'p' },
          { id: 'c' },
        ],
        edges: [edge('ab', 'a', 'b'), edge('pc', 'p', 'c')],
      }),
    a: 'a',
    b: 'c',
  },
  unknownIds: {
    graph: () =>
      createGraph({ nodes: nodes('a', 'b'), edges: [edge('ab', 'a', 'b')] }),
    a: 'zz1',
    b: 'zz2',
  },
  deep: {
    graph: () =>
      createGraph({
        nodes: Array.from({ length: DEEP }, (_, i) => ({
          id: `n${i}`,
          parentId: i === 0 ? null : `n${i - 1}`,
        })),
        edges: Array.from({ length: DEEP - 1 }, (_, i) =>
          edge(`e${i}`, `n${i}`, `n${i + 1}`),
        ),
      }),
    a: 'n0',
    b: `n${DEEP - 1}`,
  },
};

interface Spec {
  run: (graph: Graph, a: string, b: string) => unknown;
  /** Whether `a`/`b` reach the function (enables the unknown-id contract) */
  takesIds?: boolean;
  /** Documented throws: fixture → expected message */
  throws?: Partial<Record<FixtureName, RegExp>>;
  /** Skip the deep fixture: output or time is inherently superlinear */
  shallow?: string;
  /** Uses randomness without a seed option */
  random?: boolean;
  /** Custom "not found" check for unknown ids (default: {@link isNotFound}) */
  notFound?: (result: any) => boolean;
}

const ids = (spec: Omit<Spec, 'takesIds'>): Spec => ({ ...spec, takesIds: true });
const notDag = /cycle|acyclic|DAG|directed/i;

const specs: Record<string, Spec> = {
  // --- lookups & queries ---
  getNode: ids({ run: (g, a) => api.getNode(g, a) }),
  getEdge: ids({ run: (g, a) => api.getEdge(g, a) }),
  hasNode: ids({ run: (g, a) => api.hasNode(g, a) }),
  hasEdge: ids({ run: (g, a) => api.hasEdge(g, a) }),
  getNeighbors: ids({ run: (g, a) => api.getNeighbors(g, a) }),
  getSuccessors: ids({ run: (g, a) => api.getSuccessors(g, a) }),
  getPredecessors: ids({ run: (g, a) => api.getPredecessors(g, a) }),
  getDegree: ids({ run: (g, a) => api.getDegree(g, a) }),
  getInDegree: ids({ run: (g, a) => api.getInDegree(g, a) }),
  getOutDegree: ids({ run: (g, a) => api.getOutDegree(g, a) }),
  getEdgesOf: ids({ run: (g, a) => api.getEdgesOf(g, a) }),
  getInEdges: ids({ run: (g, a) => api.getInEdges(g, a) }),
  getOutEdges: ids({ run: (g, a) => api.getOutEdges(g, a) }),
  getEdgesBetween: ids({ run: (g, a, b) => api.getEdgesBetween(g, a, b) }),
  getChildren: ids({ run: (g, a) => api.getChildren(g, a) }),
  getParent: ids({ run: (g, a) => api.getParent(g, a) }),
  getAncestors: ids({ run: (g, b) => api.getAncestors(g, b) }),
  getDescendants: ids({ run: (g, a) => api.getDescendants(g, a) }),
  getRoots: { run: (g) => api.getRoots(g) },
  isCompound: ids({ run: (g, a) => api.isCompound(g, a) }),
  isLeaf: ids({ run: (g, a) => api.isLeaf(g, a) }),
  getDepth: ids({ run: (g, b) => api.getDepth(g, b) }),
  getSiblings: ids({ run: (g, a) => api.getSiblings(g, a) }),
  getLCA: ids({ run: (g, a, b) => api.getLCA(g, a, b) }),
  getSources: { run: (g) => api.getSources(g) },
  getSinks: { run: (g) => api.getSinks(g) },
  getRelativeDistanceMap: ids({ run: (g, a) => api.getRelativeDistanceMap(g, a) }),
  getRelativeDistance: ids({ run: (g, b) => api.getRelativeDistance(g, b) }),
  getPort: ids({ run: (g, a) => api.getPort(g, a, 'p') }),
  getPorts: ids({ run: (g, a) => api.getPorts(g, a) }),
  getEdgesByPort: ids({ run: (g, a) => api.getEdgesByPort(g, a, 'p') }),

  // --- traversal & ordering ---
  genBFS: ids({ run: (g, a) => api.genBFS(g, { from: a }) }),
  genDFS: ids({ run: (g, a) => api.genDFS(g, { from: a }) }),
  genPostorder: ids({ run: (g, a) => api.genPostorder(g, { from: a }) }),
  getPreorder: ids({ run: (g, a) => api.getPreorder(g, { from: a }) }),
  getPostorder: ids({ run: (g, a) => api.getPostorder(g, { from: a }) }),
  genPreorders: ids({ run: (g, a) => api.genPreorders(g, { from: a }) }),
  genPostorders: ids({ run: (g, a) => api.genPostorders(g, { from: a }) }),
  getPreorders: ids({ run: (g, a) => api.getPreorders(g, { from: a }), shallow: 'one order per DFS branching' }),
  getPostorders: ids({ run: (g, a) => api.getPostorders(g, { from: a }), shallow: 'one order per DFS branching' }),
  getUnweightedDistances: ids({ run: (g, a) => api.getUnweightedDistances(g, a) }),
  hasPath: ids({ run: (g, a, b) => api.hasPath(g, a, b) }),
  getTopologicalSort: { run: (g) => api.getTopologicalSort(g) },
  genTopologicalSort: { run: (g) => api.genTopologicalSort(g) },
  getDominatorTree: ids({ run: (g, a) => api.getDominatorTree(g, { from: a }) }),

  // --- structure ---
  isAcyclic: { run: (g) => api.isAcyclic(g) },
  isTree: { run: (g) => api.isTree(g) },
  isArborescence: { run: (g) => api.isArborescence(g) },
  isConnected: { run: (g) => api.isConnected(g) },
  isWeaklyConnected: { run: (g) => api.isWeaklyConnected(g) },
  isStronglyConnected: { run: (g) => api.isStronglyConnected(g) },
  isBipartite: { run: (g) => api.isBipartite(g) },
  isPlanar: { run: (g) => api.isPlanar(g) },
  getConnectedComponents: { run: (g) => api.getConnectedComponents(g) },
  getStronglyConnectedComponents: { run: (g) => api.getStronglyConnectedComponents(g) },
  getBridges: { run: (g) => api.getBridges(g) },
  getArticulationPoints: { run: (g) => api.getArticulationPoints(g) },
  getBiconnectedComponents: { run: (g) => api.getBiconnectedComponents(g) },
  getCycle: { run: (g) => api.getCycle(g) },
  genCycles: { run: (g) => api.genCycles(g) },
  getCycles: { run: (g) => api.getCycles(g) },
  getTransitiveReduction: {
    run: (g) => api.getTransitiveReduction(g),
    throws: {
      directedLoop: notDag,
      undirectedLoop: notDag,
      parallelUndirected: notDag,
      mixed: notDag,
    },
  },
  getCoreNumbers: { run: (g) => api.getCoreNumbers(g) },
  getKCore: { run: (g) => api.getKCore(g, 1) },
  getGraphColoring: { run: (g) => api.getGraphColoring(g) },
  isValidColoring: { run: (g) => api.isValidColoring(g, api.getGraphColoring(g).colors) },
  isIsomorphic: { run: (g) => api.isIsomorphic(g, g) },
  getMaximumBipartiteMatching: {
    run: (g) => api.getMaximumBipartiteMatching(g),
    throws: {
      directedLoop: /not bipartite/,
      undirectedLoop: /not bipartite/,
      mixed: /not bipartite/,
    },
  },
  getEulerianPath: { run: (g) => api.getEulerianPath(g) },
  getEulerianCircuit: { run: (g) => api.getEulerianCircuit(g) },
  getMinimumSpanningTree: { run: (g) => api.getMinimumSpanningTree(g) },

  // --- paths ---
  getShortestPath: ids({ run: (g, a, b) => api.getShortestPath(g, { from: a, to: b }) }),
  getShortestPaths: ids({ run: (g, a) => api.getShortestPaths(g, { from: a }), shallow: 'output is quadratic in path length' }),
  genShortestPaths: ids({ run: (g, a) => api.genShortestPaths(g, { from: a }) }),
  getSimplePath: ids({ run: (g, a, b) => api.getSimplePath(g, { from: a, to: b }) }),
  getSimplePaths: ids({ run: (g, a) => api.getSimplePaths(g, { from: a }), shallow: 'output is quadratic in path length' }),
  genSimplePaths: ids({ run: (g, a) => api.genSimplePaths(g, { from: a }) }),
  getAStarPath: ids({ run: (g, a, b) => api.getAStarPath(g, { from: a, to: b, heuristic: () => 0 }) }),
  getShortestSimplePaths: ids({ run: (g, a, b) => api.getShortestSimplePaths(g, { from: a, to: b, limit: 3 }), shallow: 'Yen: one shortest-path search per spur node' }),
  genShortestSimplePaths: ids({ run: (g, a, b) => api.genShortestSimplePaths(g, { from: a, to: b }), shallow: 'Yen: one shortest-path search per spur node' }),
  getAllPairsShortestPaths: { run: (g) => api.getAllPairsShortestPaths(g), shallow: 'output is quadratic' },
  genAllPairsShortestPaths: { run: (g) => api.genAllPairsShortestPaths(g) },
  getMaxFlow: ids({ run: (g, a, b) => api.getMaxFlow(g, { from: a, to: b }), throws: { single: /different nodes/ } }),
  getMinCut: ids({ run: (g, a, b) => api.getMinCut(g, { from: a, to: b }), throws: { single: /different nodes/ } }),
  getSteinerTree: ids({ run: (g, a, b) => api.getSteinerTree(g, { terminals: [a, b] }), shallow: 'one shortest path per terminal pair' }),
  getTSPTour: ids({ run: (g, a) => api.getTSPTour(g, { from: a }), shallow: 'NP-hard heuristic, quadratic' }),
  isValidPath: { run: (g) => api.isValidPath(g, { source: g.nodes[0] ?? { id: 'x' }, steps: [] } as GraphPath) },

  // --- centrality & communities ---
  getDegreeCentrality: { run: (g) => api.getDegreeCentrality(g) },
  getInDegreeCentrality: { run: (g) => api.getInDegreeCentrality(g) },
  getOutDegreeCentrality: { run: (g) => api.getOutDegreeCentrality(g) },
  getClosenessCentrality: { run: (g) => api.getClosenessCentrality(g), shallow: 'one BFS per node' },
  getBetweennessCentrality: { run: (g) => api.getBetweennessCentrality(g), shallow: 'one BFS per node' },
  getPageRank: { run: (g) => api.getPageRank(g) },
  getHITS: { run: (g) => api.getHITS(g) },
  // Power iteration has no fixed point on acyclic digraphs (like NetworkX).
  // The deep chain still "converges": the L1 threshold scales with n.
  getEigenvectorCentrality: {
    run: (g) => api.getEigenvectorCentrality(g),
    throws: Object.fromEntries(
      (['parallelDirected', 'dangling', 'disconnected', 'compound'] as const).map(
        (name) => [name, /failed to converge/],
      ),
    ),
  },
  getKatzCentrality: { run: (g) => api.getKatzCentrality(g) },
  getLabelPropagationCommunities: { run: (g) => api.getLabelPropagationCommunities(g, { seed: 1 }) },
  genGirvanNewmanCommunities: { run: (g) => api.genGirvanNewmanCommunities(g), shallow: 'betweenness per split' },
  getGirvanNewmanCommunities: { run: (g) => api.getGirvanNewmanCommunities(g), shallow: 'betweenness per split' },
  getGreedyModularityCommunities: { run: (g) => api.getGreedyModularityCommunities(g), shallow: 'quadratic merges' },
  getLouvainCommunities: { run: (g) => api.getLouvainCommunities(g) },
  getModularity: { run: (g) => api.getModularity(g, [g.nodes]) },

  // --- transforms & set operations ---
  getFlattenedGraph: { run: (g) => api.getFlattenedGraph(g) },
  getSubgraph: ids({ run: (g, a, b) => api.getSubgraph(g, [a, b]) }),
  getNeighborhood: ids({ run: (g, a) => api.getNeighborhood(g, a) }),
  getMappedGraph: { run: (g) => api.getMappedGraph(g, { node: (node) => node.data }) },
  getFilteredGraph: { run: (g) => api.getFilteredGraph(g, { node: () => true }) },
  getLineGraph: { run: (g) => api.getLineGraph(g) },
  getReversedGraph: { run: (g) => api.getReversedGraph(g) },
  getGraphUnion: { run: (g) => api.getGraphUnion(g, g) },
  getGraphIntersection: { run: (g) => api.getGraphIntersection(g, g) },
  getGraphDifference: { run: (g) => api.getGraphDifference(g, g) },
  getGraphSymmetricDifference: { run: (g) => api.getGraphSymmetricDifference(g, g) },
  getDisjointUnion: { run: (g) => api.getDisjointUnion(g, g) },
  getGraphComplement: { run: (g) => api.getGraphComplement(g), shallow: 'output is quadratic' },

  // --- coverage & walks ---
  getCoverageTargets: { run: (g) => api.getCoverageTargets(g, { kind: 'edges' }) },
  getPathCoverage: { run: (g) => api.getPathCoverage(g, []) },
  getEdgeCoveragePaths: ids({
    run: (g, a) => api.getEdgeCoveragePaths(g, { from: a }),
    shallow: 'shortest path per uncovered edge',
    // A coverage report: from an unknown start, nothing is covered
    notFound: (result) => result.paths.length === 0 && result.coveredEdgeIds.length === 0,
  }),
  getCoverage: ids({
    run: (g, a) => api.getCoverage(g, [], { from: a }),
    notFound: (result) => result.visitedNodes.length === 0,
  }),
  genRandomWalk: ids({ run: (g, a) => api.genRandomWalk(g, { from: a, seed: 1 }) }),
  genWeightedRandomWalk: ids({ run: (g, a) => api.genWeightedRandomWalk(g, { from: a, seed: 1 }) }),
  genQuickRandomWalk: ids({ run: (g, a) => api.genQuickRandomWalk(g, { from: a, seed: 1 }) }),
  genPredefinedWalk: ids({ run: (g, a) => api.genPredefinedWalk(g, g.edges.slice(0, 1).map((e) => e.id), { from: a }) }),
};

const excluded: Record<string, string> = {
  ...Object.fromEntries(
    [
      'createGraph', 'createGraphNode', 'createGraphEdge', 'createGraphPort',
      'createVisualGraph', 'createGraphFromTransition', 'createCompleteGraph',
      'createGridGraph', 'createRandomGraph', 'createWattsStrogatzGraph',
      'createBarabasiAlbertGraph', 'createFormatConverter',
    ].map((name) => [name, 'factory: builds a graph instead of querying one']),
  ),
  ...Object.fromEntries(
    [
      'addNode', 'addEdge', 'deleteNode', 'deleteEdge', 'updateNode', 'updateEdge',
      'addEntities', 'deleteEntities', 'updateEntities', 'getGraphWithNode',
      'getGraphWithEdge', 'getGraphWithoutNode', 'getGraphWithoutEdge',
      'getGraphWithUpdatedNode', 'getGraphWithUpdatedEdge', 'getGraphWithEntities',
      'getGraphWithoutEntities', 'getGraphWithUpdatedEntities',
      'updateGraphWithPatches',
    ].map((name) => [name, 'mutation: throws on unknown ids by contract (graph tests)']),
  ),
  ...Object.fromEntries(
    [
      'getDiff', 'isEmptyDiff', 'getInvertedDiff', 'getPatches', 'getPatchedGraph',
      'areEntitiesEqual', 'isLayoutEqual', 'isNonLayoutEqual',
    ].map((name) => [name, 'diff/equality: compares graphs or entities (diff tests)']),
  ),
  ...Object.fromEntries(
    [
      'getPathNodes', 'getPathEdges', 'getPathWeight', 'hasSubpath',
      'getReducedPaths', 'getJoinedPath', 'getCoveragePreservingPaths',
      'genWalkSteps', 'genWalkUntilNode', 'genWalkUntilEdge',
      'genWalkUntilNodeCoverage', 'genWalkUntilEdgeCoverage',
    ].map((name) => [name, 'operates on paths or walk generators, not a graph']),
  ),
  ...Object.fromEntries(
    [
      'bfs', 'dfs', 'flatten', 'reverseGraph', 'joinPaths', 'applyPatches',
      'invertDiff', 'toDiff', 'toPatches', 'takeSteps', 'takeUntilNode',
      'takeUntilEdge', 'takeUntilNodeCoverage', 'takeUntilEdgeCoverage',
    ].map((name) => [name, 'deprecated alias of a specified function']),
  ),
  getEdgeMode: 'takes an edge, not a node id',
  isEdgeDirected: 'takes an edge, not a node id',
  getGraphIssues: 'validates arbitrary input; never throws by design (validate tests)',
  invalidateIndex: 'cache control',
  GraphInstance: 'class wrapper over specified functions',
};

// --- result checks ---

const MAX_ITEMS = 500;

/** Materializes generators (bounded: walks are infinite). */
function materialize(value: unknown): unknown {
  if (
    value !== null &&
    typeof value === 'object' &&
    typeof (value as Generator).next === 'function' &&
    typeof (value as Generator)[Symbol.iterator] === 'function'
  ) {
    const items: unknown[] = [];
    for (const item of value as Iterable<unknown>) {
      items.push(item);
      if (items.length >= MAX_ITEMS) break;
    }
    return items;
  }
  return value;
}

function isPath(value: unknown): value is GraphPath {
  return (
    value !== null &&
    typeof value === 'object' &&
    'source' in value &&
    Array.isArray((value as GraphPath).steps)
  );
}

/** Returns a description of the first contract violation, if any. */
function findViolation(graph: Graph, value: unknown): string | undefined {
  const edgeById = new Map(graph.edges.map((e) => [e.id, e]));
  const nodeIds = new Set(graph.nodes.map((n) => n.id));
  let budget = 200_000;
  const stack: Array<{ value: unknown; at: string }> = [{ value, at: 'result' }];
  while (stack.length > 0 && budget-- > 0) {
    const { value: current, at } = stack.pop()!;
    if (current === null || typeof current !== 'object') continue;
    if (isPath(current)) {
      if (!current.source) return `${at}: path without a source`;
      if (!nodeIds.has(current.source.id)) return `${at}: path source not in graph`;
      let previous = current.source.id;
      for (const [i, step] of current.steps.entries()) {
        if (!step?.edge || !step.node) return `${at}.steps[${i}]: missing edge or node`;
        const original = edgeById.get(step.edge.id);
        if (!original) return `${at}.steps[${i}]: edge not in graph`;
        const directed = api.getEdgeMode(graph, original) === 'directed';
        const forward = original.sourceId === previous && original.targetId === step.node.id;
        const backward =
          !directed && original.targetId === previous && original.sourceId === step.node.id;
        if (!forward && !backward) return `${at}.steps[${i}]: step does not follow its edge`;
        previous = step.node.id;
      }
      continue;
    }
    const entries: Array<[string, unknown]> = Array.isArray(current)
      ? current.map((item, i) => [String(i), item])
      : current instanceof Map
        ? [...current.entries()].map(([k, v]) => [String(k), v])
        : current instanceof Set
          ? [...current].map((v, i) => [String(i), v])
          : Object.entries(current);
    for (const [key, item] of entries) {
      if (item === undefined && (Array.isArray(current) || current instanceof Set)) {
        return `${at}[${key}]: undefined element`;
      }
      if (typeof item === 'number' && Number.isNaN(item)) return `${at}.${key}: NaN`;
      stack.push({ value: item, at: `${at}.${key}` });
    }
  }
  return undefined;
}

function isNotFound(value: unknown): boolean {
  if (value === undefined || value === null || value === false || value === 0) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (value instanceof Map || value instanceof Set) return value.size === 0;
  if (typeof value === 'object') {
    const graph = value as Partial<Graph>;
    if (Array.isArray(graph.nodes)) return graph.nodes.length === 0;
    return Object.keys(value).length === 0;
  }
  return false;
}

const serialize = (value: unknown) =>
  JSON.stringify(value, (_, v) =>
    v instanceof Map ? [...v] : v instanceof Set ? [...v] : v,
  );

// --- the matrix ---

describe('contract matrix', () => {
  it('specifies or excludes every public function', () => {
    const exported = Object.keys(api).filter(
      (name) => typeof (api as Record<string, unknown>)[name] === 'function',
    );
    const missing = exported.filter((name) => !(name in specs) && !(name in excluded));
    const stale = [...Object.keys(specs), ...Object.keys(excluded)].filter(
      (name) => !exported.includes(name),
    );
    expect({ missing, stale }).toEqual({ missing: [], stale: [] });
  });

  for (const [name, spec] of Object.entries(specs)) {
    describe(name, () => {
      for (const [fixtureName, fixture] of Object.entries(fixtures) as Array<
        [FixtureName, Fixture]
      >) {
        if (fixtureName === 'deep' && spec.shallow) continue;
        if (fixtureName === 'unknownIds' && !spec.takesIds) continue;

        it(fixtureName, () => {
          const graph = fixture.graph();
          const before = fixtureName === 'deep' ? undefined : serialize(graph);
          const expectedThrow = spec.throws?.[fixtureName];

          let result: unknown;
          try {
            result = materialize(spec.run(graph, fixture.a, fixture.b));
          } catch (error) {
            if (expectedThrow) {
              expect((error as Error).message).toMatch(expectedThrow);
              return;
            }
            throw error;
          }
          if (expectedThrow) {
            throw new Error(`expected a throw matching ${expectedThrow}`);
          }

          expect(findViolation(graph, result)).toBeUndefined();
          if (fixtureName === 'unknownIds') {
            expect((spec.notFound ?? isNotFound)(result)).toBe(true);
          }
          if (before !== undefined) {
            expect(serialize(graph)).toBe(before);
            if (!spec.random) {
              const again = materialize(spec.run(graph, fixture.a, fixture.b));
              expect(serialize(again)).toBe(serialize(result));
            }
          }
        });
      }
    });
  }
});
