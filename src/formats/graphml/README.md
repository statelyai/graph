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
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'network',
  nodes: [
    { id: 'router', label: 'Router', shape: 'diamond' },
    { id: 'server', label: 'Server', shape: 'rectangle' },
    { id: 'client1', label: 'Client 1' },
    { id: 'client2', label: 'Client 2' },
  ],
  edges: [
    { id: 'e0', sourceId: 'router', targetId: 'server' },
    { id: 'e1', sourceId: 'router', targetId: 'client1' },
    { id: 'e2', sourceId: 'router', targetId: 'client2' },
  ],
});

const xml = toGraphML(graph);

// Import
const imported = fromGraphML(`<?xml version="1.0" encoding="UTF-8"?>
<graphml xmlns="http://graphml.graphdrawing.org/xmlns">
  <key id="d0" for="node" attr.name="label" attr.type="string"/>
  <graph id="pipeline" edgedefault="directed">
    <node id="fetch"><data key="d0">Fetch Data</data></node>
    <node id="parse"><data key="d0">Parse JSON</data></node>
    <node id="validate"><data key="d0">Validate</data></node>
    <node id="store"><data key="d0">Store Results</data></node>
    <edge source="fetch" target="parse"/>
    <edge source="parse" target="validate"/>
    <edge source="validate" target="store"/>
  </graph>
</graphml>`);
// a graph containing:
// nodes: - fetch - parse - validate - store
// edges: - (fetch -> parse) - (parse -> validate) - (validate -> store)
```

### `toGraphML(graph): string`

Produces GraphML XML with:
- `<key>` declarations for label, parentId, data, x, y, width, height, shape, color
- `<data>` elements on nodes, edges, and the graph
- JSON-serialized `data` fields

### `fromGraphML(xml): Graph`

Parses `<key>` declarations and `<data>` elements. JSON-encoded data fields are auto-parsed.

### `graphmlConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const xml = graphmlConverter.to(graph);
const graph = graphmlConverter.from(xml);
```
