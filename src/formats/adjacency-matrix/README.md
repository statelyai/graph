# Adjacency matrix

Dependency-free square matrix JSON with explicit ordered `nodeIds` and `mode`. Rows are sources; columns are targets. Coefficients are finite numbers. Ordinary zero means absence; `presence[row][column] = true` represents a zero-weight edge.

<!-- exported API and matrix profile from src/formats/adjacency-matrix/index.ts and src/formats/adjacency-matrix/core.ts -->
```ts
import { toAdjacencyMatrix, fromAdjacencyMatrix, adjacencyMatrixDocumentConverter } from '@statelyai/graph/adjacency-matrix';
const source = toAdjacencyMatrix(graph);
const restored = fromAdjacencyMatrix(source);
const document = adjacencyMatrixDocumentConverter.from(source);
document.graph!.edges[0].weight = 0;
const updated = adjacencyMatrixDocumentConverter.to(document);
```

`adjacencyMatrixConverter` exposes `.to(graph)` and `.from(source)`. Export emits a presence mask when needed. Undirected input requires symmetric coefficients and symmetric presence; bidirectional and mixed directed/undirected edges reject. Empty string and prototype-looking IDs remain valid unique IDs. Dense conversion costs O(N²); `maxCells` defaults to 1,000,000 and rejects before allocation.

Parallel edges reject by default. Explicit `{ aggregation: 'sum' | 'min' | 'max' | 'count' }` emits aggregated coefficients. The sidecar retains original edge identities and weights, but independent native readers see the aggregated matrix. Changed multi-edge aggregates reject because individual weights are ambiguous. Count coefficients encode cardinality: changing, adding or removing any count cell rejects, even when it originally represented one edge.

<!-- preservation behavior from src/formats/adjacency-matrix/index.ts and src/formats/adjacency-matrix/core.ts -->
Versioned `__statelyai` sidecars retain JSON-domain Graph data, labels, ports, identity, ordering and optional-field presence. An occupied foreign name receives a separate marker name. Live matrix coefficients, node order and presence take precedence over recorded baselines. Metadata is an explicit convention, not collision-free provenance. Import `{ metadata: 'native' }` treats markers as ordinary foreign fields; export `{ nativeCarrier: false }` ignores captured import provenance.

Documents retain complete source JSON, unknown properties and array order through no-op and JSON persistence. Strict weight edits update actual coefficients/presence and preserve unknown fields; source changes are merged and conflicts diagnosed. Structural/data/style edits and aggregated coefficient patches reject. `.getUpdate(document)` returns diagnostics; `.to(document)` throws on unsupported edits. Full Graph preservation relies on the sidecar; ordinary matrices carry only topology, ordered IDs, direction and numeric weights.

<!-- verification from tests/formats/matrices.test.ts and tests/native/matrices.test.ts -->
Core tests cover both directions, zero/negative weights, isolates, arbitrary JSON data, native edits, ambiguity, malformed masks and allocation limits. Independent SciPy 1.18.1 / NumPy 2.5.4 checks validate the related Matrix Market serialization. This JSON profile is a library-defined interchange shape, rather than a universal matrix schema.
