# Graphviz JSON

<!-- public API and options from src/formats/graphviz-json/index.ts -->

```ts
import {
  fromGraphvizJSON, toGraphvizJSON, graphvizJSONDocumentConverter,
} from '@statelyai/graph/graphviz-json';

const graph = fromGraphvizJSON(nativeJSON); // geometry remains native state
const positioned = fromGraphvizJSON(nativeJSON, { geometry: 'points' });
const output = toGraphvizJSON(graph);       // unchanged imported JSON value
const fresh = toGraphvizJSON(graph, { regenerate: true });
```

`graphvizJSONConverter` provides `.from` / `.to`. Public types include
`GraphvizJSON`, `GraphvizJSONObject`, `GraphvizJSONEdge`,
`GraphvizJSONImportOptions` and `GraphvizJSONExportOptions`.
The subpath has no runtime dependencies.

<!-- native projection and regeneration restrictions derived from Graphviz JSON validation/mapping -->

Graphviz JSON is an **output format**, never an input accepted by the Graphviz
layout engine. The adapter accepts `dot_json` and rendered `json` object profiles:
nodes, binary edges, labels, finite numeric weights, isolated/parallel edges,
strict-edge identity and cluster memberships. `_gvid` must match array identity;
references, attribute types, numeric positions/bounds and subgraph cycles are
validated. Unsupported input retains an unavailable document projection.

Real clusters become Graph nodes. Unique innermost cluster ownership maps to
`parentId`; overlapping memberships and non-cluster/rank subgraphs stay native
state. Edges on non-cluster subgraphs reject. Cluster endpoints are supported by
actual `fdp` producer output. The `dot` engine instead creates ordinary nodes for
DOT edges naming clusters; those distinct native objects retain their identities.

Geometry conversion is opt-in: native node width/height use inches, positions use
points, and `{ geometry: 'points' }` converts at 72 points/inch, flips Y against the
native bounding box and converts centers to top-left corners. Cluster bounds and
edge splines/drawing instructions remain native state. Unresolved empty layout
attributes stay opaque. `dot_json` space-separated and `json` comma-separated
bounding boxes are supported.

Fresh export emits a minimal object profile with no active drawing instructions.
Versioned JSON-string attributes retain Graph-only fields, IDs, nullable labels,
ports and user data. These are private extensions, not a promise that arbitrary
external JSON semantics fit Graph. `{ metadata: 'native' }` disables interpreting
private markers on import. Unknown native attributes remain JSON data; primitive
user data is wrapped safely when independent native attributes are added.

<!-- Graphviz JSON document contract derived from graphvizJSONDocumentConverter -->

`graphvizJSONDocumentConverter` retains the complete JSON source **value**, including
unknown properties/drawing operations, after JSON persistence. JSON object input
has no original text whitespace or comments to preserve. Its Graph projection is
explicitly partial. Safe edits are node/edge labels and edge weights in unlaid
sources. Structure, root fields and geometry require explicit regeneration.
Labels/weights affecting captured positions, bounds or drawing programs reject
until regeneration; stale layout is never silently returned. Source-only edits
survive and same-field source/Graph conflicts throw diagnostics. Strict document
`.to` proves the patched projection by reparsing. Explicit regeneration is
available through `.getUpdate(document, { mode: 'regenerate' })` with loss diagnostics.

<!-- native oracle scope from tests/native/followon-adapters.test.ts and fixtures/graphviz -->

Native tests use pinned Graphviz 15.0.0 WASM to generate actual `dot_json`/`json`
output, including `fdp` cluster endpoints, and the byte-pinned official Graphviz
JSON schema. The published schema places `additionalProperties` inside
`properties`, so schema acceptance alone does not validate known attribute types;
independent adapter checks cover that gap. No JSON-to-Graphviz input capability or
complete renderer equivalence is claimed.

<!-- Strict document identity constraints derived from baseline/current native record guards -->

Native `_gvid` values are required array ordinals, not durable edge identities
across source revisions. A strict edge patch after a changed native edge sequence
requires a unique verified private original edge ID in both source snapshots.
Generated identities otherwise reject with `ambiguous-native-identity`, even when
endpoints and labels coincide. Verified private IDs survive pure `_gvid`
renumbering with unchanged endpoints; cluster/node identity scope is unchanged.
Duplicate/header-only private metadata cannot authorize ambiguous patches. Active
layout/drawing restrictions still apply. Source-only updates remain authoritative,
and stable node-label edits do not require stable edge identities.
