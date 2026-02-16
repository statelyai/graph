# GraphML

Converter for [GraphML](http://graphml.graphdrawing.org/) — the XML-based graph exchange format.

**Requires peer dependency:** `fast-xml-parser`

```bash
npm install fast-xml-parser
```

## Resources

- [GraphML specification](http://graphml.graphdrawing.org/specification.html)
- [GraphML primer](http://graphml.graphdrawing.org/primer/graphml-primer.html)

## API

```ts
import { toGraphML, fromGraphML, graphmlConverter } from '@statelyai/graph/graphml';
```

### `toGraphML(graph): string`

```ts
const xml = toGraphML(graph);
```

Produces GraphML XML with:
- `<key>` declarations for label, parentId, data, x, y, width, height, shape, color
- `<data>` elements on nodes, edges, and the graph
- JSON-serialized `data` fields

### `fromGraphML(xml): Graph`

```ts
const graph = fromGraphML(graphmlString);
```

Parses `<key>` declarations and `<data>` elements. JSON-encoded data fields are auto-parsed.

### `graphmlConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const xml = graphmlConverter.to(graph);
const graph = graphmlConverter.from(xml);
```
