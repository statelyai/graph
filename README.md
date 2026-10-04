# @statelyai/graph

Graphs as plain JSON, with the algorithms, formats, and layout engines to do real work with them.

A graph is just `{ nodes, edges }` data, and every operation is a standalone, tree-shakable function. Built and used by [Stately](https://stately.ai) to power its visual tooling for complex systems.

**[Documentation](https://stately.ai/docs/packages/graph)**

## Why @statelyai/graph?

<!-- claims derived from src/index.ts, package.json#exports, tests/contracts.test.ts, and docs/benchmarks.md -->

- **Your graph is just data.** No class instances, no import/export step. Save it with `JSON.stringify()`, diff it, or send it to a worker as-is; lookups are indexed transparently.
- **One model for real diagrams.** Directed and undirected edges (even mixed), nested nodes, named ports, and positions and sizes: what node editors, statecharts, and architecture diagrams need, and most graph libraries leave out.
- **Fast.** Fastest in most of our [cross-library benchmarks](./docs/benchmarks.md) against graphology, ngraph, graphlib, and cytoscape. For example, it builds a 100k-node graph 9–15× faster than graphology.
- **Algorithms you can trust.** Shortest paths, centrality, communities, flow, matching, isomorphism, and more. Every public function is tested against edge cases such as self-loops, parallel edges, and unknown ids, and algorithms are iterative, so deep graphs won't overflow the stack.
- **Works with your tools.** Convert to and from 14 formats, including Graphviz DOT, Mermaid, GraphML, D2, React Flow, and Cytoscape. Lay out with 8 engines, including ELK, dagre, and Graphviz. Turn XState machines into graphs. Each adapter is an optional subpath import.
- **Typed end to end.** Generic data types for nodes, edges, ports, and the graph itself.

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

For guides, API details, and adapter dependencies, see the [docs](https://stately.ai/docs/packages/graph). To contribute, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Inspiration

Inspired by [NetworkX](https://networkx.org/), [Graphology](https://graphology.github.io/), and [graphlib](https://github.com/dagrejs/graphlib).

## License

<!-- license matching package.json#license -->

MIT
