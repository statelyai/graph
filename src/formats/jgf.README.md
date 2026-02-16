# JGF

Converter for [JSON Graph Format](https://jsongraphformat.info/) — a standardized JSON schema for graph data.

## Resources

- [JSON Graph Format specification](https://jsongraphformat.info/)
- [JGF GitHub](https://github.com/jsongraph/json-graph-specification)

## API

```ts
import { toJGF, fromJGF, jgfConverter } from '@statelyai/graph/jgf';
```

### `toJGF(graph): JGFGraph`

```ts
const jgf = toJGF(graph);
// {
//   graph: {
//     id: 'myGraph',
//     directed: true,
//     nodes: [{ id: 'a', label: 'A' }],
//     edges: [{ source: 'a', target: 'b' }]
//   }
// }
```

Graph-level properties (`initialNodeId`, `data`, `direction`) stored in `graph.metadata`. Node properties (`parentId`, `data`, visual props) stored in `node.metadata`.

### `fromJGF(jgf): Graph`

```ts
const graph = fromJGF(jgfData);
```

### `jgfConverter`

Pre-built `GraphFormatConverter<JGFGraph>`:

```ts
const jgf = jgfConverter.to(graph);
const graph = jgfConverter.from(jgf);
```

### Types

| Type | Description |
|------|-------------|
| `JGFGraph` | `{ graph: { id?, directed?, metadata?, nodes, edges } }` |
| `JGFNode` | `{ id, label?, metadata? }` |
| `JGFEdge` | `{ id?, source, target, label?, metadata? }` |
