# @statelyai/graph

## 0.13.0

### Minor Changes

- [`aeedcc0`](https://github.com/statelyai/graph/commit/aeedcc0e0c3730277231bf23ee71d969ff646347) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add semantic graph validation via `validateGraph()`, covering shape plus graph
  invariants such as duplicate ids, dangling edges, missing parents, invalid
  initial nodes, duplicate ports, invalid port references, and parent cycles.

  Default missing graph, node, edge, and port `data` values to `null` when
  creating resolved graph objects.

  Refresh format fidelity claims and conformance tests for ELK, xyflow, and
  Mermaid state round-tripping, and expand algorithm benchmarks across sparse,
  dense, compound, multi-edge, and port-heavy graphs.

## 0.12.1

### Patch Changes

- [`450d7da`](https://github.com/statelyai/graph/commit/450d7da0fb18e6ab72b16d596b30bfda3a4814ef) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Preserve graph, node, and edge metadata more fully across D3, Cytoscape, GML,
  GEXF, and JGF adapters, and verify shipped schema JSON files in package smoke
  tests.

## 0.12.0

### Minor Changes

- [`09fe970`](https://github.com/statelyai/graph/commit/09fe970af7fc800d15816d6453043b3777cb2ff9) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add runtime schema validation helpers, improve port round-tripping across
  structured format adapters, extend package smoke coverage to type-check public
  subpath imports, and document format support and validation usage in the README.

### Patch Changes

- [`b4b2195`](https://github.com/statelyai/graph/commit/b4b2195fa38d06799bf9f215f58888c261440ce9) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Preserve graph metadata in GEXF, round-trip DOT edge port references, tighten
  structured format parity tests, and derive package smoke coverage from the
  published export map.

## 0.11.1

### Patch Changes

- [`1480565`](https://github.com/statelyai/graph/commit/14805658942ca5a8e2f2c2dbfe274d98d6d73edd) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add Mermaid Ishikawa conversion and improve Mermaid v11.13 sequence and ER parsing.

- [`18588bd`](https://github.com/statelyai/graph/commit/18588bd4f65976a8c0405bd691e87adcd66ea7ed) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Preserve ports and edge port references in GraphML round-trips, allow nullable
  node labels in `GraphSchema`

## 0.11.0

### Minor Changes

- [`88d0dbd`](https://github.com/statelyai/graph/commit/88d0dbdd5e7c6bc821d0b4c17a7fd5f67a934bcc) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add format support metadata as a published subpath, tighten schema drift checks,
  and modularize the algorithms entrypoint. This also adds benchmark coverage and
  CI checks for generated schema artifacts across multiple Node versions.

## 0.10.0

### Minor Changes

- [`bfb5f0b`](https://github.com/statelyai/graph/commit/bfb5f0b5c3ef6323160322f31b7c5807785d91f0) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Clean up and simplify type definitions:

  - Remove `GraphEntityConfig`; merged into `GraphEntity`
  - Export `VisualGraphFormatConverter` from main entry
  - Rename `Positioned` export to `EntityRect`
  - Simplify `VisualNode`, `VisualEdge`, `VisualPort` to use property narrowing instead of `Omit`
  - Fix `Graph<any, E>` → `Graph<N, E>` on exported APIs for better generic propagation
  - Normalize `label` to `string | null` on both `GraphNode` and `GraphEdge` (node label default changed from `''` to `null`)

### Patch Changes

- [`160167b`](https://github.com/statelyai/graph/commit/160167bfbd6fae4b7092ff6e45873ac166e41ba1) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Remove `getEdgeBetween` in favor of `getEdgesBetween`.

## 0.9.0

### Minor Changes

- [`0fb9433`](https://github.com/statelyai/graph/commit/0fb9433c9490bf2014fea1eb9acab79a894a451b) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add entity equivalence functions: `areEntitiesEqual`, `isLayoutEqual`, `isNonLayoutEqual`, and `LAYOUT_KEYS`.

- [`6d2465d`](https://github.com/statelyai/graph/commit/6d2465d88eb53122365e76d9fc89c061627d5f90) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add centrality, community detection, connectivity, and isomorphism algorithms.

## 0.8.0

### Minor Changes

- [`8b97c9b`](https://github.com/statelyai/graph/commit/8b97c9b66d8552589b4521b5369480ea363e385c) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add port support for nodes and edges, enabling dataflow/node-editor graphs (Node-RED, Unreal Blueprints, ComfyUI).

  - Add `GraphEntityConfig`, `GraphEntity`, `VisualGraphEntity` base interfaces (DRY shared props for nodes, edges, ports)
  - Add `PortConfig<P>`, `GraphPort<P>`, `VisualPort<P>` types with generic data parameter
  - Add `P` (port data) as 4th generic to `Graph<N, E, G, P>` and all related types
  - Add `ports?: PortConfig[]` on `NodeConfig`, `ports?: GraphPort[]` on `GraphNode`
  - Add `sourcePort?` / `targetPort?` (port name strings) on `EdgeConfig` and `GraphEdge`
  - Add `createGraphPort()` factory
  - Add port validation: duplicate port names rejected, `addEdge`/`updateEdge` validate port existence
  - Add port queries: `getPort()`, `getPorts()`, `getEdgesByPort()`
  - ELK adapter: round-trip ports (name ↔ ELK port id, direction ↔ `org.eclipse.elk.port.side`)
  - xyflow adapter: `sourcePort` ↔ `sourceHandle`, `targetPort` ↔ `targetHandle`

## 0.7.0

### Minor Changes

- [`976a7e6`](https://github.com/statelyai/graph/commit/976a7e6821d43d0149e5ad776c660a5059484f23) Thanks [@davidkpiano](https://github.com/davidkpiano)! - - Make `Graph.initialNodeId`, `GraphNode.label`, and `GraphEdge.label` optional on resolved types for easier consumer usage
  - Add `createGraphNode()` and `createGraphEdge()` helpers that resolve defaults from config

## 0.6.0

### Minor Changes

- [`3115609`](https://github.com/statelyai/graph/commit/31156099ab26fe34e0bcf205221c48855a7d5674) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Make `edge.label` nullable

- [`54023f4`](https://github.com/statelyai/graph/commit/54023f4996a95a12145ed8f0ac1ed73ec9daedf0) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add edge weights, A\* pathfinding, subgraph extraction, and graph reversal.

  - `weight?: number` on edges; algorithms default to `(e) => e.weight ?? 1` with BFS fast path when unweighted
  - `getAStarPath(graph, { from, to, heuristic })` for heuristic-guided shortest paths
  - `getSubgraph(graph, nodeIds)` returns induced subgraph with internal edges
  - `reverseGraph(graph, filterEdge?)` flips edge directions
  - Remove stale TODO for Mermaid sequence blocks (already implemented)

- [`8f9912d`](https://github.com/statelyai/graph/commit/8f9912dd18c8ffaca4547061fe007f67124afd3a) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add walk generators and coverage utilities for model-based testing.

  - `genRandomWalk()`, `genWeightedRandomWalk()`, `genQuickRandomWalk()`, `genPredefinedWalk()` — step-by-step graph traversal generators that yield `GraphStep`, with optional `seed` for deterministic replay
  - Composable stop conditions: `takeSteps()`, `takeUntilNode()`, `takeUntilEdge()`, `takeUntilNodeCoverage()`, `takeUntilEdgeCoverage()`
  - `getCoverage()` computes node/edge coverage stats from a walk
  - `filter` option for edge guards, `onStep` callback for actions — keeps graph JSON-serializable

### Patch Changes

- [`22f77a5`](https://github.com/statelyai/graph/commit/22f77a51b6b0bed60a8890e44b8b9148c994e96d) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Fix schema and GraphML serialization drift, optimize weighted graph algorithms, and make `genSimplePaths()` truly lazy.

  - add `weight` to `EdgeSchema` and tighten schema drift tests against the runtime graph types
  - preserve graph, node, and edge metadata in GraphML round-trips, including `initialNodeId`, `direction`, `style`, geometry, and edge `weight`
  - use a heap-backed priority queue for weighted shortest paths, A\*, and Prim MST
  - refactor `genSimplePaths()` to yield incrementally instead of collecting all paths before returning

## 0.5.0

### Minor Changes

- [`371133c`](https://github.com/statelyai/graph/commit/371133c89e54a16cc0ed2c5ca5c12cfd2819d3df) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add ELK formatter

- [`9e596d6`](https://github.com/statelyai/graph/commit/9e596d655b3e0479a57a9a41a3f1cb41991ab8c5) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Generate schemas

### Patch Changes

- [`166b695`](https://github.com/statelyai/graph/commit/166b69583728792f20c3051db015d1b2a6e5a375) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Fix Mermaid types

- [`49ffd94`](https://github.com/statelyai/graph/commit/49ffd942eea0173ec99b03beb1cbd5b226e0e509) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Improve Mermaid parity

## 0.4.0

### Minor Changes

- [`e268990`](https://github.com/statelyai/graph/commit/e268990dde29ff0e6cb89d10c8ddbdf142bec69b) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Make `parentId`, `initialNodeId`, and `shape` optional on `GraphNode`. These fields are no longer defaulted to `null`/`'rectangle'` by `createGraph`/`createVisualGraph`, they are simply omitted when not provided.

  Add empty string validation for node/edge IDs, `parentId`, `sourceId`, and `targetId`.

- [`55462e6`](https://github.com/statelyai/graph/commit/55462e68902f6241d23d689971ce2cbd756624b5) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add xyflow (React Flow / Svelte Flow) format converter with `toXYFlow()` and `fromXYFlow()` for converting between `VisualGraph` and xyflow node/edge structures. Uses `@xyflow/system` as an optional peer dependency for types. Also adds `VisualGraphFormatConverter` type for visual-first format converters.

## 0.3.1

### Patch Changes

- [#6](https://github.com/statelyai/graph/pull/6) [`c186c2a`](https://github.com/statelyai/graph/commit/c186c2afb4eb7772855f41a03102892ecb97c9b1) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add JSDoc with usage examples to all exported functions

- [`83b3c66`](https://github.com/statelyai/graph/commit/83b3c66a9e5f740442e6e29bc6bfc78f86f61805) Thanks [@davidkpiano](https://github.com/davidkpiano)! - `VisualNode['shape']` is now optional

- [#8](https://github.com/statelyai/graph/pull/8) [`27f3f7f`](https://github.com/statelyai/graph/commit/27f3f7fe744ec5d12c401a372439f85b0f2ca0f3) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Mermaid: reconstruct sequence diagram blocks

## 0.3.0

### Minor Changes

- [#5](https://github.com/statelyai/graph/pull/5) [`25ab36a`](https://github.com/statelyai/graph/commit/25ab36a7507cefac24dc5d86f36b5918af109530) Thanks [@davidkpiano](https://github.com/davidkpiano)! - - Add DOT format (`@statelyai/graph/dot`)

  - Add Mermaid formatters: flowchart, sequence, state, class diagram, ER, mindmap, block
  - Add `getRelativeDistanceMap` and `getRelativeDistance` (queries)
  - Restructure formats into per-format subpackages with READMEs

- [#3](https://github.com/statelyai/graph/pull/3) [`bcf8c48`](https://github.com/statelyai/graph/commit/bcf8c48d8646b45d54049ac68627e8af699f2cda) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add format converters for JGF, Cytoscape.js JSON, D3 force JSON, GEXF, GML, and TGF

  - New `GraphFormatConverter<TSerial>` interface and `createFormatConverter()` factory
  - 6 new format modules with bidirectional `to*/from*` functions: `toJGF`/`fromJGF`, `toCytoscapeJSON`/`fromCytoscapeJSON`, `toD3Graph`/`fromD3Graph`, `toGEXF`/`fromGEXF`, `toGML`/`fromGML`, `toTGF`/`fromTGF`
  - Input validation with descriptive error messages on all `from*` functions
  - End-to-end integration tests with real Cytoscape.js and D3 force libraries
  - `cytoscape` and `d3-force` added as optional peer dependencies

## 0.2.0

### Minor Changes

- [`4f02507`](https://github.com/statelyai/graph/commit/4f025074bc4318f8c265388e8529eb0677e1eb8c) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Remove `toGraphML`, `fromGraphML`, `GraphSchema`, `NodeSchema`, and `EdgeSchema` from the main barrel export to avoid pulling in optional peer deps (`fast-xml-parser`, `zod`) during SSR.

  Use subpath imports instead:

  - `@statelyai/graph/formats/graphml`
  - `@statelyai/graph/schemas`
