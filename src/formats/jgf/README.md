# JGF

Converter for [JSON Graph Format](https://jsongraphformat.info/) — a standardized JSON schema for graph data.

## Resources

- [JSON Graph Format specification](https://jsongraphformat.info/)
- [JGF GitHub](https://github.com/jsongraph/json-graph-specification)

## API

<!-- exported symbols from src/formats/jgf/index.ts -->

```ts
import { toJGF, fromJGF, jgfConverter } from '@statelyai/graph/jgf';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'recipe',
  nodes: [
    { id: 'chop', label: 'Chop Vegetables' },
    { id: 'boil', label: 'Boil Water' },
    { id: 'cook', label: 'Cook Pasta' },
    { id: 'mix', label: 'Mix Together' },
    { id: 'serve', label: 'Serve' },
  ],
  edges: [
    { id: 'e0', sourceId: 'boil', targetId: 'cook' },
    { id: 'e1', sourceId: 'cook', targetId: 'mix' },
    { id: 'e2', sourceId: 'chop', targetId: 'mix' },
    { id: 'e3', sourceId: 'mix', targetId: 'serve' },
  ],
});

const jgf = toJGF(graph);
// {
//   graph: {
//     id: 'recipe',
//     directed: true,
//     nodes: [{ id: 'chop', label: 'Chop Vegetables' }, ...],
//     edges: [{ source: 'boil', target: 'cook' }, ...]
//   }
// }

// Import
const imported = fromJGF({
  graph: {
    id: 'auth',
    directed: true,
    nodes: [
      { id: 'login', label: 'Login Page' },
      { id: 'mfa', label: 'MFA Challenge' },
      { id: 'dashboard', label: 'Dashboard' },
      { id: 'denied', label: 'Access Denied' },
    ],
    edges: [
      { source: 'login', target: 'mfa', label: 'credentials ok' },
      { source: 'login', target: 'denied', label: 'invalid' },
      { source: 'mfa', target: 'dashboard', label: 'verified' },
      { source: 'mfa', target: 'denied', label: 'failed' },
    ],
  },
});
// a graph containing:
// nodes: - login - mfa - dashboard - denied
// edges: - (login -> mfa) - (login -> denied) - (mfa -> dashboard) - (mfa -> denied)
```

### `toJGF(graph): JGFGraph`

<!-- JGF fidelity notes derived from src/formats/jgf/index.ts -->

Graph-level properties (`initialNodeId`, `data`, `direction`, `style`) are stored in `graph.metadata`. Node properties (`parentId`, `data`, visual props, `style`, `ports`) are stored in `node.metadata`. Edge properties (`data`, `weight`, visual props, `style`, `sourcePort`, `targetPort`) are stored in `edge.metadata`.

### `fromJGF(jgf): Graph`

Restores all metadata back to graph/node/edge properties.

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
