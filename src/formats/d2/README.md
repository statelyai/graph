# d2

Converter for [d2](https://d2lang.com/) diagram syntax. A single bidirectional
converter handles the whole d2 language — containers, connections, shapes,
styles, structured shapes (`sql_table` / `class`), sequence diagrams, grids, and
source-level abstractions (`vars` / `classes` / imports).

The converter targets **semantic-lossless round-trip**: every node, edge, port,
style, and hierarchy survives `d2 → graph → d2`. Output may be reformatted
(whitespace/blank lines are not preserved), but comments are attached to the
following entity on a best-effort basis.

## Resources

- [d2 documentation](https://d2lang.com/)
- [d2 playground](https://play.d2lang.com/)

## API

<!-- exported symbols from src/formats/d2/index.ts -->

```ts
import { fromD2, toD2, d2Converter } from '@statelyai/graph/d2';
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
| `near` / `icon` / `tooltip` / `link` / `class` | `node.data` (`_d2` namespace) |
| `sql_table` / `class` fields | `GraphPort`s; `node.field` connections become `sourcePort` / `targetPort`. Field type/constraints/visibility live on `port.data` |
| Typed/block labels (`\|md\|`, `\|js\|`, `\|tex\|`) | `node.label` text + `node.data.labelBlock` descriptor |
| Sequence diagrams (`shape: sequence_diagram`) | Ordered container; message/child order stored in `node.data.order` |
| `grid-rows` / `grid-columns` / `grid-gap` | `node.data.grid` |
| `vars` / `classes` / imports (`@path`) | Preserved on `graph.data.source` |
| `direction:` | `graph.direction` |
| `# comments` | `commentsBefore` on the following node/edge; orphans in `graph.data` leading/trailing buckets |

## Limitations

- **Cosmetic, not text-faithful.** Whitespace, blank lines, and inline trailing
  comments are not preserved. Connection chains (`a -> b -> c`) are expanded to
  individual edges and re-emitted as separate lines.
- **No edge weight.** d2 has no native edge weight concept.
- **Imports are opaque.** `@path` references are preserved but not resolved (the
  converter is a synchronous string transform with no filesystem access).
