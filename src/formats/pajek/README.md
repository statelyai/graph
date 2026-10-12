# Pajek .net

<!-- public API from src/formats/pajek/index.ts -->

```ts
import {
  fromPajek, toPajek, pajekDocumentConverter,
} from '@statelyai/graph/pajek';

const graph = fromPajek(text);
const output = toPajek(graph); // unchanged imported text
const fresh = toPajek(graph, { nativeCarrier: false });
const document = pajekDocumentConverter.from(text);
if (document.graph) document.graph.nodes[0].label = 'Updated';
const edited = pajekDocumentConverter.to(document);
```

Dependency-free. `pajekConverter`, `createPajekDocumentConverter(options)`,
`PajekImportOptions` and `PajekExportOptions` are also exported.

<!-- bounded author dialect and data policy derived from Pajek parser/serializer -->

Supports one ordinary `*Vertices N` set and uniform `*Arcs` or `*Edges` sections,
optional `*Network`, comments, vertex labels, numeric weights, edge `l` labels,
parallel edges and isolates. Integer vertex identity is independent of labels;
repeated labels remain distinct vertices. Missing vertex definitions create
unlabelled isolates. Native row attributes remain ordered token data.

Mixed sections, temporal/bipartite/project/matrix/list dialects, invalid references
and ambiguous numeric vertex-label/geometry syntax reject projection. Source strings are
bounded to 16 × 1024² UTF-16 code units and vertex count to one million. Fresh visible strings require
Unicode scalar single-line values without embedded quotes or control characters
(other than TAB). Backslashes remain literal; C readers do not provide portable
escaped-quote semantics. Missing/null vertex labels omit the native label; explicit
empty strings emit `""`. Null is a Graph distinction, not a native nullable string.

Fresh output stores versioned per-entity metadata in **one comment header before
`*Vertices`**. Vertex entries bind to integer identity; edge entries bind to endpoint
pair plus occurrence. This preserves Graph IDs, hierarchy, ports, geometry and user
data without inserting comments into fixed-count vertex or edge records. Legacy
adjacent metadata comments remain importable. Recorded native baselines ensure live
labels, weights and section direction override stale private fields. Unknown native
attributes added to primitive user data use a discriminated wrapper without
replacing that data. `{ metadata: 'native' }` disables interpreting private markers.
Arbitrary private-marker lookalikes require explicit import policy.

<!-- Pajek document preservation and edit limits from createPajekDocumentConverter -->

Document no-op output retains **exact source text**, including comments and
unsupported dialects, after JSON persistence; original file encoding lies outside this string API.
Unsupported projection has
`graph: null` and diagnostics. Safe patches update literal vertex/edge labels or
insert missing labels locally; independent source comments/attributes survive.
Same-field conflicts reject. Structure, weights, data, geometry, styles and null
label requests require explicit regeneration and loss diagnostics through
`.getUpdate(document, { mode: 'regenerate' })`. Strict `.to` never silently flattens
an unsupported dialect or returns stale source.

Foreign edges use endpoint/occurrence identity. Independent changes to an unkeyed
edge's attributes/topology alongside a requested edge-label edit reject as
ambiguous. Header metadata is also occurrence-bound; it cannot supply stable
external edge identity across arbitrary parallel-edge reordering.

<!-- native oracle limits from followon-adapters.test.ts, igraph-pajek.test.ts and networkx-pajek.test.ts -->

Actual igraph 1.0.0 C/Python reads validate directed/undirected topology, repeated
labels, isolates, parallel edges, comments and numeric weights. NetworkX 3.7 tests
cover the unique-labelled vertex subset: its Pajek reader identifies nodes by
label and reads a fixed count of physical vertex rows. It cannot certify repeated
label identity, missing-label semantics, comments inside vertex records or mixed
section semantics. These independent readers prove the tested bounded dialect,
not complete Pajek project compatibility.
