# GraphSON 3 typed TinkerGraph objects

<!-- public GraphSON functions/types/options from src/formats/graphson/index.ts -->

```ts
import { fromGraphSON, toGraphSON, graphsonDocumentConverter } from '@statelyai/graph/graphson';
const source = toGraphSON(graph, { version: 3, profile: 'tinker:graph' });
const restored = fromGraphSON(source);
const document = graphsonDocumentConverter.from(source);
const exact = graphsonDocumentConverter.to(JSON.parse(JSON.stringify(document)));
```

`graphsonConverter` supplies `.from`/`.to`. Public types describe typed values,
vertices, edges, vertex properties and import/export options. Implementation is
synchronous and dependency-free. Defaults select the explicit GraphSON3
`{"@type":"tinker:graph","@value":{"vertices":[],"edges":[]}}` object profile
registered by Apache `TinkerIoRegistryV3`. GraphSON1/2, untyped JSON, adjacency
`writeGraph`/NDJSON, `g:Graph` and `g:TinkerGraph` are unsupported.

<!-- native identity/property domain and fresh Graph mapping from GraphSON projection/emitter -->

Only directed topology is representable. String, typed Int32, Int64, BigInteger
and UUID identities occupy distinct namespaces. Int64/BigInteger decimal strings
retain unsafe magnitudes; unsafe JavaScript numeric IDs reject. UUID identities
normalize case. Duplicate vertices/edges/property IDs and dangling endpoints
reject. Parallel edges, self-loops and isolates remain distinct.

Native properties remain typed JSON in node/edge data. Multi-properties,
vertex-property IDs, meta-properties, typed maps with non-string keys, sets and
unknown property extensions are retained, without flattening them into strings
or interpreting arbitrary extension types. Exact BigDecimal values require
string wrappers. Finite Double/Float `weight` properties also project to Graph
weight; their raw property wrappers remain in data.

Fresh Graph export stores application data in a native property named `data`,
whose value is an opaque JSON **string**. Native labels represent element category
labels, not a `name` property. Null Graph labels use nonempty native fallbacks;
empty labels reject because the native element-label domain requires nonempty
strings. A versioned root string marker retains additional Graph fields, field
presence and user identities. This marker is a Graph preservation convention;
TinkerPop reading/writing discards it. It does not make Graph geometry, hierarchy,
ports, arbitrary root data or other Graph-only fields native TinkerGraph semantics.

<!-- strict source/patch/metadata behavior from GraphSON document registration and preservation options -->

Imported source JSON is retained exactly after JSON persistence, including array
order and unknown fields. Native edits remain authoritative. Documents support
nonempty label edits and existing stable property-value edits, retaining property
IDs/order/meta-properties. Vertex-label patches update verified endpoint-label
mirrors; conflicting mirror edits reject. Structural edits, arbitrary Graph-only
field edits, root-data edits, property identity/meta-property changes and Graph
weight edits currently reject with diagnostics. No stale source replay hides edits.

Bare imported Graph export uses the same strict patch boundary. Explicit
`nativeCarrier: false` regenerates a fresh scoped profile. `metadata: 'native'`
imports reserved marker fields as ordinary native data. Valid-looking private
metadata remains untrusted and validated; exact reserved-schema collisions remain
a convention boundary, so use the native option for foreign lookalikes.

The JSON domain rejects cycles, functions, undefined, symbols, accessors,
nonenumerable fields, custom prototypes, sparse/custom arrays and nonfinite or
signed-zero numbers. Runtime object alias identity is outside the JSON contract.
Source retention establishes JSON value preservation, not file-byte encoding or
complete interpretation of every GraphSON type extension.

<!-- independent actual native proof from tests/native/graphson.test.ts and scripts/native/graphson-tools.json -->

Pinned Apache TinkerPop **3.8.2** Java `GraphSONMapper` with `TinkerIoRegistryV3`
and `GraphSONXModuleV3` reads emitted/foreign graphs. Tests observe native topology,
category labels, Java ID classes, unsafe Int64/BigDecimal magnitudes,
multi/meta-property identity, maps, sets and patched property values. The native
`TinkerFactory.createModern()` fixture is byte-hashed with provenance. A separate
Gremlin JavaScript3.8.2 reader checks supported typed elements/collections;
whole-graph registry proof comes from Java. This proves selected profiles, not
all GraphSON schemas, extensions, adjacency formats or TinkerPop providers.

[Official GraphSON documentation](https://tinkerpop.apache.org/docs/current/dev/io/).
