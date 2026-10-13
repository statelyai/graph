# TGF

Converter for [TGF](https://en.wikipedia.org/wiki/Trivial_Graph_Format) (Trivial Graph Format) — a minimal newline-delimited text format.

## Preservation

<!-- preservation contract for tgf derived from src/formats/support.ts and converter implementation -->

Graph round-trip: **partial**. Native semantic round-trip: **partial**.
Source document preservation: **none**. These are separate guarantees;
selected-field round-trip tests do not prove unrestricted losslessness.

Imports CRLF, LF and CR line endings and whitespace-separated endpoints. Export rejects IDs containing whitespace and multiline labels because TGF cannot encode them unambiguously. Node IDs and textual labels are supported; edge IDs, metadata, ports, hierarchy and geometry remain outside this representation.

## Resources

- [TGF on Wikipedia](https://en.wikipedia.org/wiki/Trivial_Graph_Format)

## API

<!-- exported symbols from src/formats/tgf/index.ts -->

```ts
import { toTGF, fromTGF, tgfConverter } from '@statelyai/graph/tgf';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'tasks',
  nodes: [
    { id: 'plan', label: 'Plan' },
    { id: 'build', label: 'Build' },
    { id: 'test', label: 'Test' },
    { id: 'deploy', label: 'Deploy' },
  ],
  edges: [
    { id: 'e0', sourceId: 'plan', targetId: 'build', label: 'start' },
    { id: 'e1', sourceId: 'build', targetId: 'test', label: 'verify' },
    { id: 'e2', sourceId: 'test', targetId: 'deploy', label: 'release' },
  ],
});

const tgf = toTGF(graph);
// plan Plan
// build Build
// test Test
// deploy Deploy
// #
// plan build start
// build test verify
// test deploy release

// Import
const imported = fromTGF(`login Login Page
home Home
settings Settings
profile Profile
#
login home authenticate
home settings
home profile
settings home back
profile home back`);
// a graph containing:
// nodes: - login - home - settings - profile
// edges: - (login -> home) - (home -> settings) - (home -> profile) - (settings -> home) - (profile -> home)
```

### `toTGF(graph): string`

Format: node lines (`id label`), then `#`, then edge lines (`source target label`).

### `fromTGF(tgf): Graph`

Preserves only `id` and `label` for nodes, `sourceId`/`targetId`/`label` for edges.

### `tgfConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const tgf = tgfConverter.to(graph);
const graph = tgfConverter.from(tgf);
```

> **Note:** TGF is a lossy format. Node `data`, `parentId`, visual properties, and edge `data` are discarded on export.


## Native documents

<!-- tgfDocumentConverter derived from src/formats/tgf/index.ts and src/formats/document/index.ts -->

`tgfDocumentConverter.from(source)` creates a plain JSON document with the
original source and a separate Graph projection. `.to(document)` preserves exact
source when unchanged, including after JSON serialization. Supported edits patch
verified native fields; unsupported edits throw with diagnostics. `.getUpdate(document)`
returns a diagnostic-bearing result. Native semantic projection remains partial.

Original line endings, separator whitespace and declaration spacing stay intact. Node and edge labels can be edited on verified declaration lines. Embedded newlines, structural changes and fields outside TGF reject.

<!-- Strict document identity constraints derived from baseline/current native record guards -->

TGF edge IDs are ordinal, because edge lines have no explicit identity field.
Strict Graph edge patches require the native edge record sequence to remain
unchanged between baseline and current source, including distinguishing whitespace.
Insertion, removal, reordering or record changes reject with
`ambiguous-native-identity`. Changes outside edge records and stable node-label
patches remain supported; source-only updates retain their exact text.
