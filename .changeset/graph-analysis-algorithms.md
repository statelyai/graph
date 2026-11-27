---
'@statelyai/graph': minor
---

Add new graph analysis algorithms and transforms:

- **Structure**: `getCondensation()` (strongly connected components as a DAG), `getCycleBasis()`, and `getContractedGraph()` (merge a set of nodes into one).
- **DAGs**: `getTransitiveClosure()`, `getLongestPath()` (critical path), and `getTopologicalGenerations()` (layers).
- **Distances**: `getEccentricity()`, `getEccentricities()`, `getDiameter()`, `getRadius()`, `getCenter()`, and `getPeriphery()`.
- **Pattern matching**: `genSubgraphIsomorphisms()`, `getSubgraphIsomorphisms()`, and `hasSubgraphIsomorphism()`, with optional induced matching and node/edge matchers.
- **Centrality**: `getEdgeBetweennessCentrality()`, plus a `personalization` option on `getPageRank()` for personalized PageRank.
- **Cliques and clustering**: `genMaximalCliques()`, `getMaximalCliques()`, `getTriangleCounts()`, `getClusteringCoefficients()`, `getAverageClustering()`, and `getTransitivity()`.
- **Link prediction**: `getCommonNeighbors()`, `getJaccardCoefficient()`, `getAdamicAdarIndex()`, `getResourceAllocationIndex()`, `getPreferentialAttachment()`, and `getLinkPredictions()`.
- **Communities**: `getLeidenCommunities()`, which guarantees internally connected communities.
- **Cuts, trees, and matching**: `getGlobalMinCut()` (Stoer–Wagner), `getMinimumSpanningArborescence()` (Chu–Liu/Edmonds), and `getMaximumMatching()` (maximum-weight matching on general graphs).
