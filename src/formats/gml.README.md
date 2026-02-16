# GML

Converter for [GML](https://en.wikipedia.org/wiki/Graph_Modelling_Language) (Graph Modelling Language) — a hierarchical text format widely supported by graph tools.

## Resources

- [GML specification (Graphlet)](https://web.archive.org/web/20190309090728/http://www.fim.uni-passau.de/index.php?id=17297&L=1)
- [GML on Wikipedia](https://en.wikipedia.org/wiki/Graph_Modelling_Language)

## API

```ts
import { toGML, fromGML, gmlConverter } from '@statelyai/graph/gml';
```

### `toGML(graph): string`

```ts
const gml = toGML(graph);
// graph [
//   directed 1
//   node [
//     id "a"
//     label "A"
//   ]
//   edge [
//     source "a"
//     target "b"
//   ]
// ]
```

Preserves: `label`, `data` (JSON-stringified), `shape`, `color`, visual properties in `graphics [x, y, w, h]` blocks. Compound graphs use nested `node [ ... node [ ] ]` blocks.

### `fromGML(gml): Graph`

```ts
const graph = fromGML(gmlString);
```

Includes a full tokenizer and recursive descent parser. Handles:
- Nested node blocks for hierarchy
- `graphics` blocks for positions/dimensions
- JSON-encoded data fields
- Multiple same-key entries (e.g., multiple `node` blocks)

### `gmlConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const gml = gmlConverter.to(graph);
const graph = gmlConverter.from(gml);
```
