# TGF

Converter for [TGF](https://en.wikipedia.org/wiki/Trivial_Graph_Format) (Trivial Graph Format) — a minimal newline-delimited text format.

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
