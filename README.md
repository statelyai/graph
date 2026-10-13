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
- **Works with your tools.** Convert to and from graph and diagram formats including Graphviz DOT, Mermaid, GraphML, D2, React Flow, and Cytoscape. Lay out with 8 engines, including ELK, dagre, and Graphviz. Turn XState machines into graphs. Each adapter is an optional subpath import.
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

## Format preservation

<!-- format preservation capabilities and exports derived from src/formats/support.ts and src/format-support.ts -->

The table describes bare Graph converters. Format mappings, Graph round-tripping,
native semantics and source preservation are separate contracts. No converter currently guarantees 100% losslessness for
arbitrary Graphs or complete native documents. Selected-field tests characterize
supported mappings; they do not establish conformance to an entire format.

| Formats | Graph → format → Graph | Native → Graph → native | Source details |
| --- | --- | --- | --- |
| Adjacency list, Cytoscape, D3, DOT, ELK, GEXF, GML, GraphML, JGF, TGF, xyflow | Partial | Partial | None |
| CSV/TSV, Graphology export JSON, Graphlib JSON, NetworkX node-link JSON, adjacency matrix, Matrix Market, Graphviz JSON, draw.io, Pajek, scoped PlantUML | Partial | Partial | None |
| Edge list | Partial | Full for endpoint tuples | None |
| D2 | Partial | Partial | Partial comments |
| Mermaid architecture, block, C4, class, ER, flowchart, GitGraph, ishikawa, mindmap, requirement, Sankey, sequence, state, UseCase | Partial | Partial | Partial annotations |

Graph preservation includes JSON-serializable fields, optional-field presence and
entity order. Native preservation includes format-specific topology, attributes
and semantics. Source preservation additionally covers comments, declaration
order, spelling and whitespace. Adapter metadata can carry selected Graph fields
without making them native features. Use a GraphDocument when those details matter.

Additional adapters: [adjacency matrix](src/formats/adjacency-matrix/README.md),
[Matrix Market](src/formats/matrix-market/README.md),
[Graphviz JSON](src/formats/graphviz-json/README.md), [draw.io](src/formats/drawio/README.md),
[Pajek](src/formats/pajek/README.md), [PlantUML](src/formats/plantuml/README.md).

```ts
import { getFormatSupportEntry } from '@statelyai/graph/format-support';

const support = getFormatSupportEntry('graphml');
console.log(support?.preservation); // { graph: 'partial', native: 'partial', document: 'none' }
```

The existing `features` API remains available; `features.roundTrip` describes the
legacy Graph round-trip assessment. `preservation` is optional for third-party
entries and present on every built-in entry.

<!-- repaired native semantics and remaining limits from src/formats/support.ts -->

Native imports now retain supported key/default/namespace semantics, edge modes,
weights, hierarchy, ports and structured metadata. DOT declarations and clusters,
ELK endpoint identity, JGF versions, D2 source abstractions and Mermaid ordered sequence events,
properties and entity declarations have dedicated regression coverage.
Canonical and visible native edits take precedence over unchanged source hints
where the adapter can resolve the mapping.

Source-only annotations remain a separate limitation: diagram comments,
frontmatter and directives may be reformatted; XML/DOT comments and complete
declaration order are not guaranteed. Unsupported Graph topology such as
hyperedges is rejected instead of silently truncated. Independent native validators cover selected emitted profiles. Broader structural source editing remains bounded by each document adapter.

## Native documents

<!-- document contract and exports from src/formats/document/index.ts and native converter modules -->

```ts
import { graphMLDocumentConverter } from '@statelyai/graph/graphml';

const document = graphMLDocumentConverter.from(xml);
const persisted = JSON.parse(JSON.stringify(document));
const exactSource = graphMLDocumentConverter.to(persisted);
```

CSV/TSV use explicit node and edge tables with a serializable schema; default optional cells encode JSON, including visible labels. Graphology, Graphlib and NetworkX subpaths convert their native JSON profiles without runtime library dependencies. Mapping limits: [CSV/TSV](src/formats/csv/README.md), [Graphology](src/formats/graphology/README.md), [Graphlib](src/formats/graphlib/README.md), [NetworkX](src/formats/networkx/README.md).

Every native converter subpath offers a `*DocumentConverter` registration. The
`@statelyai/graph/document` factory also accepts explicit custom codecs, including
VisualGraph codecs. Documents retain exact original text/native JSON values on
no-op export, including comments, extensions and unsupported constructs, after
JSON persistence. Projection can be partial or unavailable and carries explicit
diagnostics. This guarantees source retention, not full semantic interpretation.

Supported Graph edits patch native source and must pass reparse proof. Unsupported
or conflicting edits throw instead of replaying stale source. Native source edits
remain authoritative when Graph is unchanged. Regeneration is an explicit,
diagnostic-bearing operation that reports differing Graph fields after reparse,
as well as possible source loss. See [document API](src/formats/document/README.md)
for the validated JSON domain and editing boundary.

## Native validation

<!-- native-validation scripts and CI from package.json and .github/workflows/ci.yml -->

`pnpm test:native` runs pinned native parsers, compilers, schemas and runtime
oracles on Node 24. `pnpm test:coverage` enforces measured converter coverage
floors. These tools are dev-only; ordinary core tests still cover Node 20/22/24.
Selected native assertions supplement conversion regressions without promising
complete language coverage. See [native validation](docs/native-validation.md).

## Optional peer dependencies

The core (`@statelyai/graph`) and the pure-JSON formats have no runtime
dependencies. Each adapter subpath that wraps a third-party library declares it
as an **optional** peer dependency, so you only install the ones you use. If the
peer isn't installed, importing that subpath throws a module-resolution error
for the peer — install it and the import works.

| Subpath import | Peer dependency to install |
| --- | --- |
| `@statelyai/graph/dot` | `dotparser` |
| `@statelyai/graph/drawio` | `fflate`, `fast-xml-parser` |
| `@statelyai/graph/graphml`, `@statelyai/graph/gexf` | `fast-xml-parser` |
| `@statelyai/graph/layout/cytoscape` | `cytoscape` |
| `@statelyai/graph/xstate` | `xstate` |
| `@statelyai/graph/layout/elk` | `elkjs` |
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
