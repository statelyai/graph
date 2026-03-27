# NetworkX Family Parity Design

## Goal

Add three major algorithm families that bring `@statelyai/graph` closer to NetworkX-level capability coverage while preserving this repo's existing API conventions, plain JSON data model, and standalone-function architecture.

This design covers:

- Centrality and link analysis
- Community detection
- Connectivity, cuts, and isomorphism

## Non-Goals

- Full one-to-one NetworkX API parity
- Renderer, layout engine, or UI-state features
- Hypergraph support
- Exhaustive long-tail algorithms in each family for the first pass

## Constraints

- Public APIs must follow repo naming conventions from `AGENTS.md`
- Graphs remain plain JSON-serializable objects
- `graph` remains the first parameter for all non-factory functions
- Collection-returning queries should return `[]`, not `undefined`
- New behavior must be test-driven with Vitest

## Proposed Scope

### 1. Centrality and Link Analysis

Add:

- `getDegreeCentrality(graph)`
- `getInDegreeCentrality(graph)`
- `getOutDegreeCentrality(graph)`
- `getClosenessCentrality(graph, options?)`
- `getBetweennessCentrality(graph, options?)`
- `getPageRank(graph, options?)`
- `getHITS(graph, options?)`
- `getEigenvectorCentrality(graph, options?)`

Return shapes:

- Centrality functions return `Record<string, number>`
- `getHITS` returns `{ hubs: Record<string, number>; authorities: Record<string, number> }`

Rationale:

- These are the most recognizable NetworkX centrality families
- They cover structural, path-based, and iterative link-analysis metrics
- They compose cleanly with the repo's current weighted/unweighted graph model

### 2. Community Detection

Add:

- `getLabelPropagationCommunities(graph, options?)`
- `getGirvanNewmanCommunities(graph, options?)`
- `getGreedyModularityCommunities(graph, options?)`
- `getModularity(graph, communities, options?)`

Return shapes:

- Community detection functions return `GraphNode[][]`
- `getModularity` returns `number`

Rationale:

- Label propagation is simple, fast, and useful as a baseline
- Girvan-Newman gives a divisive algorithm aligned with NetworkX families
- Greedy modularity gives a practical optimization-based algorithm
- Modularity is needed to evaluate and compare community partitions

### 3. Connectivity, Cuts, and Isomorphism

Add:

- `getBridges(graph)`
- `getArticulationPoints(graph)`
- `getBiconnectedComponents(graph)`
- `isIsomorphic(graphA, graphB, options?)`

Return shapes:

- `getBridges` returns `GraphEdge[]`
- `getArticulationPoints` returns `GraphNode[]`
- `getBiconnectedComponents` returns `GraphNode[][]`
- `isIsomorphic` returns `boolean`

Rationale:

- Bridges and articulation points are high-value structural primitives
- Biconnected components fit naturally with those primitives
- Isomorphism is the minimum credible entry point for the isomorphism family

## API and Semantics

### Naming

The public surface should use this repo's conventions rather than NetworkX names:

- Value maps and arrays use `get*`
- Predicates use `is*`

No class-based wrappers or iterator-heavy return types are needed for the first pass.

### Options

Each algorithm family should use small, explicit options objects only where necessary:

- iterative algorithms: `maxIterations`, `tolerance`
- weighted algorithms: `getWeight`
- directed/undirected handling: documented family-specific semantics
- deterministic community algorithms: optional `seed` or deterministic tie-breaking strategy
- isomorphism: optional `nodeMatch`, `edgeMatch`

### Directed vs. Undirected Behavior

- Centrality functions should document how directed graphs are handled rather than silently coercing behavior
- Community detection should default to treating directed graphs as undirected for partitioning unless the algorithm is explicitly directed
- Bridges, articulation points, and biconnected components should be defined for undirected structure
- `isIsomorphic` should first require graph type compatibility unless an explicit option relaxes it

## Internal Architecture

The existing export surface in `src/index.ts` is already large. New algorithm families should not further expand a single monolithic `src/algorithms.ts` implementation file.

Proposed structure:

- `src/algorithms.ts`
  Re-export public functions from focused family modules
- `src/algorithms/centrality.ts`
- `src/algorithms/community.ts`
- `src/algorithms/connectivity.ts`
- `src/algorithms/isomorphism.ts`
- `src/algorithms/shared.ts`
  Shared helpers for normalization, adjacency extraction, connected-component partitioning, iterative convergence checks, and deterministic sorting

This preserves current package entrypoints while improving maintainability.

## Algorithm Choices

### Centrality

- Degree centralities are direct normalizations of degree counts
- Closeness centrality uses shortest-path distances over reachable nodes
- Betweenness centrality should use a standard shortest-path accumulation approach
- PageRank, HITS, and eigenvector centrality should use iterative power-style methods with convergence tolerances

### Community Detection

- Label propagation should use deterministic label tie-breaking by sorted label order to keep tests stable
- Girvan-Newman should iteratively remove highest-edge-betweenness edges and emit the best available partition for the requested step
- Greedy modularity should merge communities greedily while modularity improves
- `getModularity` should be implemented separately and reused by greedy modularity tests

### Connectivity and Isomorphism

- Bridges and articulation points should use DFS low-link style algorithms
- Biconnected components should be derived from the same DFS traversal state where possible
- `isIsomorphic` should start with a pragmatic backtracking matcher with early pruning by graph order, degree sequences, and optional attribute matchers

## Testing Strategy

New test files:

- `tests/centrality.test.ts`
- `tests/community.test.ts`
- `tests/connectivity.test.ts`
- `tests/isomorphism.test.ts`

Test design principles:

- Small graphs with hand-checkable expected values
- Exact failure-first coverage for each algorithm
- Deterministic assertions for tie cases
- Directed and undirected coverage where semantics differ
- Weighted and unweighted coverage where supported
- Empty graph and singleton graph edge cases

Representative coverage:

- star, path, cycle, clique, and disconnected fixtures
- two-cluster graphs for community detection
- classic bridge/articulation examples
- positive and negative isomorphism cases
- attribute-aware isomorphism cases

## Documentation Updates

Update:

- `README.md`
  Expand algorithm highlights and examples
- `src/index.ts`
  Export new APIs
- JSDoc on each new function

Docs should describe family semantics rather than claiming full NetworkX equivalence.

## Risks

### Scope Creep

The biggest risk is allowing "family parity" to turn into exhaustive parity. This design keeps the first pass to representative, defensible algorithms in each family.

### Algorithm Stability

Iterative algorithms and community detection can be unstable or sensitive to tie-breaking. Deterministic ordering and explicit tolerances are required.

### File Growth

If all new code lands in `src/algorithms.ts`, maintainability will degrade quickly. The file split is part of the design, not an optional cleanup.

## Rollout Plan

1. Add the internal file split and re-exports
2. Implement centrality and link analysis
3. Implement community detection plus modularity
4. Implement connectivity and isomorphism
5. Update docs and verify full test/build pipeline

## Success Criteria

- The repo exposes the three new algorithm families using existing naming conventions
- Each family has stable, documented semantics
- Each algorithm has focused test coverage with deterministic expectations
- Existing tests continue to pass
- README and public exports reflect the new capability surface
