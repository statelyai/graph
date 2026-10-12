# Graphology JSON

Dependency-free conversion of Graphology's serialized JSON. Pass output to `Graph.from(source)` in Graphology; runtime Graphology instances are outside this API.

<!-- exported API and native profile from src/formats/graphology/index.ts and src/formats/structured-json.ts -->
```ts
import { toGraphologyJSON, fromGraphologyJSON, graphologyDocumentConverter } from '@statelyai/graph/graphology';
const source = toGraphologyJSON(graph);
const restored = fromGraphologyJSON(source);
const document = graphologyDocumentConverter.from(source);
document.graph!.nodes[0].label = 'Changed';
const updated = graphologyDocumentConverter.to(document);
```

`graphologyConverter` exposes `.to(graph)` and `.from(source)`. Export supports directed, undirected and genuinely mixed edges. Bidirectional edges throw. Fresh output enables native multigraphs and self-loops; native imports enforce their declared options. Empty string IDs remain distinct from missing IDs. Omitted native edge keys receive deterministic collision-free Graph IDs; this does not claim identity with Graphology's runtime-generated keys.

Native node/edge attributes map representable labels, geometry, styles, ports and weights to Graph fields. Other attributes become Graph data. Graph-looking attributes with incompatible types (such as `label: 42` or `style: []`) remain data. Native known-field edits cannot overwrite those payloads silently.

Graphology 0.26.0 adjacency queries fail for inherited object names, including `constructor`, `__proto__` and `toString`. This profile rejects all `Object.prototype` node names, including isolated nodes, before emitting native output.

<!-- preservation behavior from src/formats/graphology/index.ts and src/formats/preservation.ts -->
Fresh output stores Graph data in an attribute named `data`, and Graph-only presence/state in versioned `__statelyai` attributes with a format-specific origin. Native readers observe the actual native fields. Imported source is captured in serializable provenance; surviving entities retain unknown attributes after Graph reorder/insert/delete. Live native data/label edits take precedence over recorded baselines.

Use `fromGraphologyJSON(source, { metadata: 'native' })` to treat matching private markers as ordinary attributes. Use `toGraphologyJSON(graph, { nativeCarrier: false })` to export user-authored Graph data without interpreting native-import provenance. An arbitrary payload can intentionally match the private convention, so automatic detection is not a collision-free provenance guarantee.

Documents retain the complete original JSON source, order, unknown fields and presence through no-op and JSON persistence. Strict label/data/style/geometry/weight patches preserve unknown source fields and verify the resulting Graph projection. Structural, parent, port and ambiguous edits reject with diagnostics; `.getUpdate(document)` returns the result without throwing. Scalar replacement of foreign attribute records is unsupported. This is a partial semantic mapping, not a universal lossless Graphology schema implementation.

<!-- independent native tests from tests/native/primary-json.test.ts and core tests from tests/formats/primary-json.test.ts -->
Native proof: Graphology 0.26.0 import/query/export checks mixed modes, parallel edges, self-loops, isolates, empty IDs, attributes, edits and a 2,000-node graph. [Official serialization API](https://graphology.github.io/serialization.html).
