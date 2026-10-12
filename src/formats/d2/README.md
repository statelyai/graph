# d2

Converter for [d2](https://d2lang.com/) diagram syntax. A single bidirectional
converter handles supported d2 constructs — containers, connections, shapes,
styles, structured shapes (`sql_table` / `class`), sequence diagrams, grids, and
source-level abstractions (`vars` / `classes` / imports).

Supported syntax maps to Graph nodes, edges, ports, styles and hierarchy.
Output is reformatted; comments attach to the following entity on a
best-effort basis. This is not a complete semantic or source-document guarantee.

## Preservation

<!-- preservation contract for d2 derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Source document preservation: **partial**. These are separate guarantees;
selected-field round-trip tests do not prove unrestricted losslessness.

Supports a subset of D2 semantics. Effective Graph/edge modes, scoped key paths,
structured-node attributes, arrowheads and recursive source abstractions are
retained. Arbitrary Graph metadata and unsupported language constructs still
prevent unrestricted losslessness.

## Resources

- [d2 documentation](https://d2lang.com/)
- [d2 playground](https://play.d2lang.com/)

## API

<!-- exported symbols from src/formats/d2/index.ts -->

```ts
import { fromD2, toD2, d2Converter, d2DocumentConverter } from '@statelyai/graph/d2';
```

`toD2` exports a graph as d2 syntax; `fromD2` parses d2 syntax into a graph.

```ts
const graph = fromD2(`
  server: {
    api: {
      auth: Auth Service
      users: User Service
    }
  }
  server.api.auth -> server.api.users: delegates
`);

const text = toD2(graph);
```

## Mapping to the graph model

| d2 concept | Graph representation |
|------------|----------------------|
| Container (`a.b.c` or `a: { ... }`) | Node hierarchy via `parentId`; the authored form is stored in `node.data.declarationForm` (`'dot'` \| `'block'`) |
| Connection `->` / `<-` / `--` / `<->` | Edge with `edge.mode` (`directed` / `undirected` / `bidirectional`); authored glyph preserved in `edge.data.arrow`. `<-` is normalized so `sourceId`/`targetId` reflect semantic direction |
| `shape:` | `node.shape` (canonical) |
| `style.*` | `node.style` / `edge.style` record (booleans/numbers coerced) |
| `width` / `height` / `top` / `left` | Canonical `node.width` / `height` / `y` / `x` |
| `near` / `icon` / `tooltip` / `link` / `class` | Typed fields on `node.data` |
| `sql_table` / `class` fields | `GraphPort`s; `node.field` connections become `sourcePort` / `targetPort`. Field type/constraints/visibility live on `port.data` |
| Typed/block labels (`\|md\|`, `\|js\|`, `\|tex\|`) | `node.label` text + `node.data.labelBlock` descriptor |
| Sequence diagrams (`shape: sequence_diagram`) | Ordered container; message/child order stored in `node.data.order` |
| `grid-rows` / `grid-columns` / `grid-gap` | `node.data.grid` |
| `vars` / `classes` | Recursive values on `graph.data.source`; scoped definitions on `node.data.source` |
| Imports | `source.importRecords` retains path, scope, spread kind and ordering; legacy `source.imports` string arrays remain readable |
| `direction:` | `graph.direction` |
| `# comments` | `commentsBefore` / `commentsAfter`; container trailing comments and graph leading/trailing buckets |

<!-- identity and precedence rules from src/formats/d2/parser.ts and emitter.ts -->

Ordinary dotted IDs remain unchanged. A literal dotted key such as `"a.b"`
uses an encoded Graph ID distinct from the hierarchical key `a.b`; authored
segments live in `node.data.keyPath`, guarded by `sourceId`. Ancestor `_`
references and indexed connection attributes resolve to existing entities.
Connection-chain labels/styles apply to every connection.

Emission uses `getEdgeMode(graph, edge)`. The authored connector is reused only
when its mode agrees with the current canonical fields. Label source hints are
also reused only while the canonical label still matches their baseline.

## Limitations

- **Reformatted source.** Whitespace, blank lines and exact comment placement
  are not preserved. Inline comments may become standalone comments.
  Connection chains expand into individual edges.
- **No edge weight.** d2 has no native edge weight concept.
- **Imports are opaque.** `@path` references are preserved but not resolved (the
  converter is a synchronous string transform with no filesystem access).
- **Substitutions are opaque.** Expressions remain authored expressions;
  variables/classes/imports are not compiled into effective graph semantics.
- **Unsupported constructs.** Boards and globs are retained in
  `graph.data.source.unknownStatements` for inspection. They do not create
  ordinary nodes and are not emitted as if their semantics were understood.
- **Graph fields.** Graph/edge IDs, arbitrary user data and ports on ordinary
  unstructured shapes have no unrestricted native encoding.


## Native documents

<!-- document registration and bounded patch policy from src/formats/d2/document.ts -->

`d2DocumentConverter` retains exact original source after JSON persistence,
including comments and unsupported syntax. It exposes a partial Graph projection;
quote caches belong to native source. Unambiguous flat root declaration labels
can be patched without changing unedited bytes. Nested labels, expressions,
structural changes and other unsupported edits fail explicitly. Use
`document.source` for those changes. See [document API](../document/README.md).


## Native interoperability

<!-- native D2 profile oracle from tests/native/d2.test.ts and package.json#devDependencies -->

The native suite compiles external and emitted profiles with pinned
`@terrastruct/d2` 0.1.33 in a bounded WASM subprocess. Compiled assertions cover
escaped labels, literal dotted identity, isolated nodes, SQL port columns and
constraints, arrows, scoped ancestor endpoints and variable/class substitution.
These tests characterize a supported profile; opaque source retention does not
imply full D2 interpretation. See [validation scope](../../../docs/native-validation.md).


<!-- native wire-string limits from src/formats/d2/shared.ts and tests/native/d2.test.ts -->

D2's UTF-8 compiler replaces lone UTF-16 surrogates in wire labels/IDs. Import,
emission and strict label patches reject that loss explicitly. Valid astral pairs
remain supported. NUL labels remain supported at the compiled-diagram field
boundary: the native compiler retains them exactly. JSON-escaped opaque data and
original unprojectable document source are preserved independently of those wire
string restrictions.
