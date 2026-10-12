# Graphlib JSON

Dependency-free conversion of `@dagrejs/graphlib` JSON. Pass output to native `json.read(source)`; import native `json.write(instance)` results directly.

<!-- exported API and native profile from src/formats/graphlib/index.ts and src/formats/structured-json.ts -->
```ts
import { toGraphlibJSON, fromGraphlibJSON, graphlibDocumentConverter } from '@statelyai/graph/graphlib';
const source = toGraphlibJSON(graph);
const restored = fromGraphlibJSON(source);
const document = graphlibDocumentConverter.from(source);
const unchanged = graphlibDocumentConverter.to(document);
```

`graphlibConverter` exposes `.to(graph)` and `.from(source)`. Native Graphlib has one global edge mode. All effective Graph edges must agree; genuine mixed or bidirectional graphs throw. Fresh output is a named multigraph and enables compound mode when parents exist. Native imports honor omitted option defaults (`directed: true`, `multigraph: false`, `compound: false`) and reject duplicate edge tuples, missing references and cyclic parents.

Node IDs may be empty strings. Edge identity includes source, target and native name; the same name on different pairs remains distinct. Parent fields map native hierarchy. Compound `__proto__` node IDs are rejected because Graphlib 4.0.1 can fail while assigning those children.

Native root/node/edge `value` may be any JSON payload, including scalars, arrays, null and absent values. Representable object fields map labels, geometry, styles and weights; incompatible Graph-looking fields remain data. Scalar/array native values retain their exact Graph data and cannot receive separate label/style/geometry edits. Such edits fail explicitly instead of replacing the native value with an object.

<!-- preservation behavior from src/formats/graphlib/index.ts and src/formats/preservation.ts -->
Fresh Graph output uses object values with a `data` member and versioned, format-discriminated `__statelyai` metadata for Graph-only fields and original presence. Live native fields, parents, data and global direction remain authoritative. Unknown native fields are preserved in imported provenance; Graphlib's own reader/writer may discard fields outside its native schema.

`fromGraphlibJSON(source, { metadata: 'native' })` disables marker interpretation; `toGraphlibJSON(graph, { nativeCarrier: false })` disables native-import provenance interpretation. Payloads deliberately matching the convention require these overrides. Fresh regeneration wraps arbitrary Graph data in native object values; it does not promise the original native value shape.

Documents retain exact original JSON, values, ordering, extensions and presence through no-op and JSON persistence. Strict known-field/data edits patch stable native entities, preserve unknown values and verify the Graph projection. Structural, mode, parent, port and incompatible value edits reject; `.getUpdate(document)` returns diagnostics. Native source edits survive, while conflicting edits to the same field reject. Semantic coverage remains partial.

Bare export preserves an imported simple/multigraph profile. Compatible node/edge insertion retains complete Graph identities; parallel insertion into a simple graph rejects. Retargeting object-valued edges adds identity metadata based on the final native tuple, without wrapping or replacing original attributes. Foreign marker properties survive under a free numbered metadata key. Retargeting opaque scalar/array edge values is unsupported.

<!-- independent native tests from tests/native/primary-json.test.ts and core tests from tests/formats/primary-json.test.ts -->
Native proof: Graphlib 4.0.1 `json.read/write` checks global modes, named parallels, compound parents, self-loops, isolates, empty IDs/names, opaque values, edits and a 2,000-node hierarchy. [Official JSON API](https://github.com/dagrejs/graphlib/wiki/API-Reference#jsonreadjson).
