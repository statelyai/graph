# TGF

Converter for [TGF](https://en.wikipedia.org/wiki/Trivial_Graph_Format) (Trivial Graph Format) — a minimal newline-delimited text format.

## Resources

- [TGF on Wikipedia](https://en.wikipedia.org/wiki/Trivial_Graph_Format)

## API

```ts
import { toTGF, fromTGF, tgfConverter } from '@statelyai/graph/tgf';
```

### `toTGF(graph): string`

```ts
const tgf = toTGF(graph);
// a A
// b B
// #
// a b
// b a loopback
```

Format: node lines (`id label`), then `#`, then edge lines (`source target label`).

### `fromTGF(tgf): Graph`

```ts
const graph = fromTGF(tgfString);
```

Preserves only `id` and `label` for nodes, `sourceId`/`targetId`/`label` for edges. All other fields (`data`, visual props, hierarchy) are not supported by TGF.

### `tgfConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const tgf = tgfConverter.to(graph);
const graph = tgfConverter.from(tgf);
```

> **Note:** TGF is a lossy format. Node `data`, `parentId`, visual properties, and edge `data` are discarded on export.
