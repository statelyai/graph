# NetworkX node-link JSON

Dependency-free conversion of NetworkX node-link JSON. Python objects and arbitrary hashable Python IDs are outside the adapter's JSON scalar profile.

<!-- exported API and native profile from src/formats/networkx/index.ts and src/formats/structured-json.ts -->
```ts
import { toNetworkXNodeLink, fromNetworkXNodeLink, networkxDocumentConverter } from '@statelyai/graph/networkx';
const source = toNetworkXNodeLink(graph); // current `edges` collection
const legacy = toNetworkXNodeLink(graph, { edgeKey: 'links' });
const restored = fromNetworkXNodeLink(source);
const document = networkxDocumentConverter.from(source);
const unchanged = networkxDocumentConverter.to(document);
```

`networkxConverter` exposes `.to(graph)` and `.from(source)`. Fresh output is a multigraph with string node IDs and string edge keys. NetworkX has one global edge direction; genuine mixed/bidirectional Graph modes throw. Import accepts exactly one `edges` or legacy `links` array. Bare export defaults to current `edges`; document patches retain the original collection name.

Native IDs and multigraph keys support strings, finite numbers and booleans. Foreign IDs receive typed, collision-free Graph string IDs: numeric `1` and string `'1'` remain distinct; Python-equivalent `true`, `1` and `1.0` share identity and duplicate declarations reject. Null, array/tuple and object identities have no bare projection. Multiedge identity includes endpoints and typed key, with endpoint order normalized for undirected graphs. Missing keys follow NetworkX's integer allocation; edge reorder materializes those keys when required to retain their identity. Missing endpoints and duplicate equivalent tuple keys throw.

Native representable labels, geometry, styles and weights map Graph fields. Other attributes, including Graph-looking fields with incompatible types, remain user data. Graph data in fresh exports occupies a separate `data` attribute; native data edits update it directly. Graph-only optional fields/presence use versioned `__statelyai` metadata with a NetworkX origin.

<!-- preservation behavior from src/formats/networkx/index.ts and src/formats/preservation.ts -->
Imported native provenance preserves source IDs, keys, unknown fields and surviving entity attributes through JSON persistence and Graph reorder/insert/delete. Live native edits take precedence. Use `{ metadata: 'native' }` on import or `{ nativeCarrier: false }` on export to disable automatic convention interpretation. Exact lookalike private payloads require an explicit override; this is not a collision-free provenance guarantee.

Documents retain exact original scalar-ID JSON, ordering, collection names and unknown attributes. Unprojectable JSON identities are retained with `graph: null` and diagnostics. Bounded label/data/style/geometry/weight edits patch native entities by stable identity and verify the resulting Graph projection. Structural, mode, parent, port and ambiguous edits reject. `.getUpdate(document)` returns diagnostics; source edits survive unless they conflict with requested changes. The supported semantic profile is partial.

Bare export preserves an imported simple/multigraph profile. Compatible node/edge insertion retains full Graph identities against the final native IDs; parallel insertion into a simple graph rejects. Retargeted foreign edges retain their Graph ID through identity metadata while their actual native endpoints change. Unknown attributes and existing private-looking properties stay intact; metadata uses a free numbered key when needed.

<!-- independent native tests from tests/native/networkx.test.ts and core tests from tests/formats/primary-json.test.ts -->
Native proof uses pinned Python NetworkX 3.7 `node_link_graph`/`node_link_data`: native flags, scalar IDs, per-pair keys, loops, parallels, legacy links, data edits and native defaults. [Official node-link API](https://networkx.org/documentation/stable/reference/readwrite/generated/networkx.readwrite.json_graph.node_link_data.html).
