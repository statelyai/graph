# GEXF

Converter for [GEXF](https://gexf.net/) (Graph Exchange XML Format) — the XML format used by [Gephi](https://gephi.org/).

**Requires peer dependency:** `fast-xml-parser`

```bash
npm install fast-xml-parser
```

## Resources

- [GEXF specification](https://gexf.net/schema.html)
- [Gephi](https://gephi.org/)

## API

```ts
import { toGEXF, fromGEXF, gexfConverter } from '@statelyai/graph/gexf';
```

### `toGEXF(graph): string`

```ts
const xml = toGEXF(graph);
```

Produces GEXF 1.3 XML with:
- Node/edge attributes via `<attvalues>`
- Hierarchy via `pid` attribute
- Visual properties via `viz:color`, `viz:position`, `viz:size`
- JSON-serialized `data` in attribute values

### `fromGEXF(xml): Graph`

```ts
const graph = fromGEXF(gexfString);
```

Parses:
- `<attributes>` declarations and `<attvalues>` on nodes/edges
- `@pid` and nested `<nodes>` for hierarchy
- `viz:color`, `viz:position`, `viz:size`
- JSON-encoded data fields

### `gexfConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const xml = gexfConverter.to(graph);
const graph = gexfConverter.from(xml);
```
