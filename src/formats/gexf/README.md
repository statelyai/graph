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
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'citations',
  nodes: [
    { id: 'paper1', label: 'Graph Theory Fundamentals', color: '#e91e63' },
    { id: 'paper2', label: 'Network Analysis' },
    { id: 'paper3', label: 'Community Detection' },
  ],
  edges: [
    { id: 'e0', sourceId: 'paper2', targetId: 'paper1', label: 'cites' },
    { id: 'e1', sourceId: 'paper3', targetId: 'paper1', label: 'cites' },
    { id: 'e2', sourceId: 'paper3', targetId: 'paper2', label: 'cites' },
  ],
});

const xml = toGEXF(graph);

// Import
const imported = fromGEXF(`<?xml version="1.0" encoding="UTF-8"?>
<gexf xmlns="http://gexf.net/1.3">
  <graph defaultedgetype="directed">
    <nodes>
      <node id="api" label="API Gateway" />
      <node id="users" label="User Service" />
      <node id="orders" label="Order Service" />
    </nodes>
    <edges>
      <edge id="e0" source="api" target="users" />
      <edge id="e1" source="api" target="orders" />
      <edge id="e2" source="orders" target="users" />
    </edges>
  </graph>
</gexf>`);
// a graph containing:
// nodes: - api - users - orders
// edges: - e0 (api -> users) - e1 (api -> orders) - e2 (orders -> users)
```

### `toGEXF(graph): string`

Produces GEXF 1.3 XML with:
- Node/edge attributes via `<attvalues>`
- Hierarchy via `pid` attribute
- Visual properties via `viz:color`, `viz:position`, `viz:size`
- JSON-serialized `data` in attribute values

### `fromGEXF(xml): Graph`

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
