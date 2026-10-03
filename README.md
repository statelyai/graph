# @statelyai/graph

A TypeScript library for creating, analyzing, and exchanging graphs as plain JSON. Build workflows, analyze dependencies, or move graph data between tools using standalone functions.

Built by [Stately](https://stately.ai), where we make visual tools for complex systems.

**[Documentation](https://stately.ai/docs/packages/graph)**

## Installation

<!-- install command matching package.json#name -->

```bash
npm install @statelyai/graph
```

## Quick start

<!-- example using createGraph and getShortestPath exported from src/index.ts; path shape from src/types.ts#GraphPath -->

Create a publishing workflow and find the shortest route from draft to published:

```ts
import { createGraph, getShortestPath } from '@statelyai/graph';

const graph = createGraph({
  nodes: [
    { id: 'draft' },
    { id: 'review' },
    { id: 'published' },
  ],
  edges: [
    { id: 'submit', sourceId: 'draft', targetId: 'review' },
    { id: 'approve', sourceId: 'review', targetId: 'published' },
  ],
});

const path = getShortestPath(graph, { from: 'draft', to: 'published' });

if (path) {
  console.log([path.source.id, ...path.steps.map(({ node }) => node.id)]);
  // ['draft', 'review', 'published']
}
```

Your graph is a plain object: save it with `JSON.stringify()`, clone it, or send it to a worker.

## What it provides

<!-- capability overview derived from src/index.ts and package.json#exports; intentionally non-exhaustive -->

- **Flexible graphs:** directed, undirected, nested, and visual graphs, with node data and ports.
- **Graph operations:** query, validate, transform, and edit graphs with mutable or immutable functions.
- **Algorithms:** traversal, shortest paths, dependency ordering, centrality, and community detection.
- **Interoperability:** format converters and layout adapters for tools such as Graphviz, ELK, and React Flow.

See the [docs](https://stately.ai/docs/packages/graph) for guides, API details, and adapter dependencies. For contributions, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Inspiration

Inspired by [NetworkX](https://networkx.org/), [Graphology](https://graphology.github.io/), and [graphlib](https://github.com/dagrejs/graphlib).

## License

<!-- license matching package.json#license -->

MIT
