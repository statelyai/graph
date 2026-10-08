# @statelyai/graph

Graphs as plain JSON, with the algorithms, formats, and layout engines to do real work with them.

A graph is just `{ nodes, edges }` data, and every operation is a standalone, tree-shakable function. Built and used by [Stately](https://stately.ai) to power its visual tooling for complex systems.

**[Documentation](https://stately.ai/docs/packages/graph)**

## Why @statelyai/graph?

<!-- claims derived from src/index.ts, package.json#exports, tests/contracts.test.ts, and docs/benchmarks.md -->

- **Your graph is just data.** No class instances, no import/export step. Save it with `JSON.stringify()`, diff it, or send it to a worker as-is; lookups are indexed transparently.
- **One model for real diagrams.** Directed and undirected edges (even mixed), nested nodes, named ports, and positions and sizes: what node editors, statecharts, and architecture diagrams need, and most graph libraries leave out.
- **Fast.** Fastest in most of our [cross-library benchmarks](./docs/benchmarks.md) against graphology, ngraph, graphlib, and cytoscape. For example, it builds a 100k-node graph 9–15× faster than graphology.
- **Algorithms you can trust.** Shortest paths, centrality, communities, flow, matching, isomorphism, and more. Every query and algorithm is tested against edge cases such as self-loops, parallel edges, and unknown ids, and algorithms are iterative, so deep graphs won't overflow the stack.
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

## Optional peer dependencies

The core (`@statelyai/graph`) and the pure-JSON formats have no runtime
dependencies. Each adapter subpath that wraps a third-party library declares it
as an **optional** peer dependency, so you only install the ones you use. If the
peer isn't installed, importing that subpath throws a module-resolution error
for the peer — install it and the import works.

| Subpath import | Peer dependency to install |
| --- | --- |
| `@statelyai/graph/dot` | `dotparser` |
| `@statelyai/graph/graphml`, `@statelyai/graph/gexf` | `fast-xml-parser` |
| `@statelyai/graph/cytoscape`, `@statelyai/graph/layout/cytoscape` | `cytoscape` |
| `@statelyai/graph/xstate` | `xstate` |
| `@statelyai/graph/elk`, `@statelyai/graph/layout/elk` | `elkjs` |
| `@statelyai/graph/layout/dagre` | `@dagrejs/dagre` |
| `@statelyai/graph/layout/d3-force` | `d3-force` |
| `@statelyai/graph/layout/d3-hierarchy` | `d3-hierarchy` |
| `@statelyai/graph/layout/graphviz` | `@hpcc-js/wasm-graphviz` |
| `@statelyai/graph/layout/forceatlas2` | `graphology`, `graphology-layout-forceatlas2` |
| `@statelyai/graph/layout/webcola` | `webcola` |
| `@statelyai/graph/schemas` (Zod schemas) | `zod` |

For example, the `/dot` converter (`toDOT`, `fromDOT`, `dotConverter`) needs
`dotparser`:

```bash
npm install @statelyai/graph dotparser
```

For guides, API details, and adapter dependencies, see the [docs](https://stately.ai/docs/packages/graph). To contribute, see [CONTRIBUTING.md](./CONTRIBUTING.md).

## Inspiration

Inspired by [NetworkX](https://networkx.org/), [Graphology](https://graphology.github.io/), and [graphlib](https://github.com/dagrejs/graphlib).

## License

<!-- license matching package.json#license -->

MIT
