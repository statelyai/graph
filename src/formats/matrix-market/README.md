# Matrix Market

Dependency-free Matrix Market text conversion for square graphs. Supported profiles: coordinate `real`, `integer` or `pattern`, and array `real` or `integer`, each with `general` or `symmetric` storage. Array coefficients use column-major order; symmetric storage uses the lower triangle.

<!-- exported API and supported grammar from src/formats/matrix-market/index.ts -->
```ts
import { toMatrixMarket, fromMatrixMarket, matrixMarketDocumentConverter } from '@statelyai/graph/matrix-market';
const source = toMatrixMarket(graph); // coordinate real general
const restored = fromMatrixMarket(source);
const document = matrixMarketDocumentConverter.from(source);
document.graph!.edges[0].weight = -2;
const updated = matrixMarketDocumentConverter.to(document);
```

`matrixMarketConverter` exposes `.to(graph)` and `.from(source)`. Export accepts `{ storage, field, symmetry, aggregation, maxCells }`. Import accepts `{ nodeIds, mode, aggregation, maxCells, maxNodes, maxEntries }`; ordinary input uses IDs `"0"`, `"1"`, etc. General storage defaults to directed; symmetric storage is undirected. Explicit undirected general input requires mirrored coefficients and mirrored stored coordinate presence, including zeros. Explicit `nodeIds`/`mode` cannot override a recognized sidecar silently; `{ metadata: 'native' }` opts out.

A stored coordinate zero represents a zero-weight edge. Dense array zeros mean absence unless the Graph sidecar explicitly records zero presence. Pattern entries have weight 1. Integer coefficients must be safe integers. Complex, Hermitian, skew-symmetric and rectangular matrices have no projection in this scoped API. Array input requires one coefficient per data line; unrecognized variants reject rather than flattening them.

Duplicate coordinate entries and parallel Graph edges reject by default. Explicit `sum`, `min`, `max` or `count` aggregation combines coefficients with declared semantic loss for independent readers. Versioned sidecars retain original Graph identities/data; edited aggregates reject when individual weights cannot be inferred. All changed count cells reject because cardinality cannot determine weights. Sparse coordinate conversion costs O(N+E); dense arrays have a `maxCells` guard of 1,000,000. Import defaults `maxNodes`/`maxEntries` to 1,000,000 and validates dimensions/counts/indices before allocation.

<!-- preservation behavior from src/formats/matrix-market/index.ts and src/formats/adjacency-matrix/core.ts -->
A `% @statelyai/graph/matrix` JSON comment preserves JSON-domain Graph data, IDs, ports and optional-field presence. Live coefficients and ordering remain authoritative. Automatic metadata recognition follows an explicit convention; import `{ metadata: 'native' }` and export `{ nativeCarrier: false }` disable interpretation. Bare export regenerates text in the requested profile; use the document converter for source formatting preservation.

Documents retain exact original text, comments, coordinate order, whitespace and line endings through no-op and JSON persistence, including unsupported source with `graph: null`. Strict weight patches replace actual coefficients and preserve surrounding text; integer/pattern constraints, conflicts, aggregated and structural edits receive diagnostics. Array zero-weight changes require an available sidecar presence mapping. `.getUpdate(document)` returns diagnostics; `.to(document)` rejects unsupported edits. Source preservation and Graph projection are separate capabilities.

<!-- independent readers from scripts/native/scipy_oracle.py and tests/native/matrices.test.ts; regression tests from tests/formats/matrices.test.ts -->
Native proof uses actual SciPy 1.18.1 / NumPy 2.5.4 `mmread`/`mmwrite`: stored zeros, duplicate COO entries, column-major arrays, symmetry, pattern values, malformed dimensions and a 20,000-node sparse matrix. [Matrix Market format specification](https://math.nist.gov/MatrixMarket/formats.html) and [SciPy reader](https://docs.scipy.org/doc/scipy/reference/generated/scipy.io.mmread.html).
