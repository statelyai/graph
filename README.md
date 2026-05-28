# @statelyai/graph

A TypeScript graph library for JSON-serializable graph IR. Use it to validate, analyze, transform, and round-trip directed, undirected, hierarchical, port-aware, and visual graphs across tools.

Made from our experience at [stately.ai](https://stately.ai), where we build visual tools for complex systems.

## Install

```bash
npm install @statelyai/graph
```

Optional peers are only needed for specific adapters:

<!-- optional peer dependencies derived from package.json#peerDependencies -->

| Package           | Needed for                                          |
| ----------------- | --------------------------------------------------- |
| `fast-xml-parser` | `@statelyai/graph/gexf`, `@statelyai/graph/graphml` |
| `dotparser`       | `@statelyai/graph/dot` parsing                      |
| `cytoscape`       | Cytoscape integration tests and consumer typing     |
| `d3-force`        | D3 force integration tests and consumer typing      |
| `elkjs`           | `@statelyai/graph/elk`                              |
| `zod`             | `@statelyai/graph/schemas`                          |

## Highlights

- Plain JSON graphs with no runtime wrappers required; omitted `data` defaults to `null`
- Standalone functions with a consistent `get*`/`gen*`/`is*`/`add*` naming model
- Directed, undirected, hierarchical, and visual graph support
- Ports for node-editor and dataflow-style graphs
- Algorithms for traversal, paths, centrality, communities, connectivity, isomorphism, ordering, MST, and walks
- Diff/patch utilities for graph state changes
- Multi-format conversion via package subpaths, with fidelity claims tested against fixtures
- Small, fast test suite with broad format coverage

## Quick Start

Graphs are plain JSON-serializable objects. All operations are standalone functions — no classes, no DOM, no rendering engine.

```ts
import {
  createGraph,
  addNode,
  addEdge,
  getShortestPath,
} from '@statelyai/graph';

const graph = createGraph({
  nodes: [
    { id: 'a', label: 'Start' },
    { id: 'b', label: 'Middle' },
    { id: 'c', label: 'End' },
  ],
  edges: [
    { id: 'e1', sourceId: 'a', targetId: 'b' },
    { id: 'e2', sourceId: 'b', targetId: 'c' },
  ],
});

// Mutate in place
addNode(graph, { id: 'd', label: 'Shortcut' });
addEdge(graph, { id: 'e3', sourceId: 'a', targetId: 'd' });

// Algorithms work on the plain object
const path = getShortestPath(graph, { from: 'a', to: 'c' });
```

## Graph Manipulation

Look up, add, delete, and update nodes and edges. Query neighbors, predecessors, successors, degree, and more.

```ts
import {
  getNode,
  deleteNode,
  getNeighbors,
  getSources,
} from '@statelyai/graph';

const node = getNode(graph, 'a'); // lookup by id
deleteNode(graph, 'd'); // removes node + connected edges
const neighbors = getNeighbors(graph, 'a'); // adjacent nodes
const roots = getSources(graph); // nodes with no incoming edges
```

Batch operations (`addEntities`, `deleteEntities`, `updateEntities`) let you apply multiple changes at once.

## Hierarchy

Nodes support parent-child relationships for compound/nested graphs. Query children, ancestors, descendants, depth, and least common ancestor. Use `flatten()` to decompose into a flat leaf-node graph.

```ts
import { createGraph, getChildren, getLCA, flatten } from '@statelyai/graph';

const graph = createGraph({
  nodes: [
    { id: 'a' },
    { id: 'b', initialNodeId: 'b1' },
    { id: 'b1', parentId: 'b' },
    { id: 'b2', parentId: 'b' },
    { id: 'c' },
  ],
  edges: [
    { id: 'e1', sourceId: 'a', targetId: 'b' }, // resolves to a -> b1
    { id: 'e2', sourceId: 'b1', targetId: 'b2' },
    { id: 'e3', sourceId: 'b', targetId: 'c' }, // expands from all leaves of b
  ],
});

const children = getChildren(graph, 'b'); // [b1, b2]
const flat = flatten(graph); // only leaf nodes, edges resolved
```

## Ports

Ports are optional named connection points on nodes. They are useful for flow-based systems, node editors, and dataflow graphs where edges need to target a specific input or output.

```ts
import { createGraph, getEdgesByPort, getPorts } from '@statelyai/graph';

const graph = createGraph({
  nodes: [
    {
      id: 'fetch',
      ports: [{ name: 'result', direction: 'out' }],
    },
    {
      id: 'render',
      ports: [{ name: 'input', direction: 'in' }],
    },
  ],
  edges: [
    {
      id: 'e1',
      sourceId: 'fetch',
      sourcePort: 'result',
      targetId: 'render',
      targetPort: 'input',
    },
  ],
});

getPorts(graph, 'fetch'); // [{ name: 'result', ... }]
getEdgesByPort(graph, 'render', 'input'); // [e1]
```

## Schema Validation

<!-- validation helpers exported from src/schemas.ts -->

Use the `@statelyai/graph/schemas` subpath when you want runtime validation or JSON Schema generation. `validateGraph()` combines shape checks with graph invariants such as duplicate ids, dangling edges, missing parents, missing initial nodes, duplicate ports, invalid port references, and parent cycles.

```ts
import { GraphSchema, isGraph, validateGraph } from '@statelyai/graph/schemas';

const unknownValue: unknown = JSON.parse(input);

if (isGraph(unknownValue)) {
  // fully typed Graph
} else {
  console.error(validateGraph(unknownValue));
}

const parsed = GraphSchema.parse(unknownValue);
```

## Algorithms

<!-- algorithm functions exported from src/algorithms.ts -->

Includes traversal (BFS, DFS, preorder/postorder), pathfinding (shortest path, simple paths, all-pairs shortest paths, A*), centrality/link analysis (degree, closeness, betweenness, PageRank, HITS, eigenvector), community detection (label propagation, Girvan-Newman, greedy modularity, modularity scoring), cycle detection, connected/strongly-connected components, bridges, articulation points, biconnected components, isomorphism, topological sort, minimum spanning tree, and more. Many algorithms have lazy generator variants (`gen*`) for early exit.

```ts
import {
  bfs,
  dfs,
  hasPath,
  isAcyclic,
  getShortestPath,
  getCycles,
  getTopologicalSort,
  getConnectedComponents,
  getMinimumSpanningTree,
  getPageRank,
  getLabelPropagationCommunities,
  genGirvanNewmanCommunities,
  getBridges,
  isIsomorphic,
} from '@statelyai/graph';

for (const node of bfs(graph, 'a')) {
  /* breadth-first */
}
for (const node of dfs(graph, 'a')) {
  /* depth-first */
}

hasPath(graph, 'a', 'c'); // reachability
isAcyclic(graph); // cycle check
getShortestPath(graph, { from: 'a', to: 'c' }); // single shortest path
getTopologicalSort(graph); // topological order (or null)
getConnectedComponents(graph); // connected components
getMinimumSpanningTree(graph, { weight: (e) => e.data?.weight ?? 1 }); // MST
getPageRank(graph); // link analysis scores
getLabelPropagationCommunities(graph); // community detection
[...genGirvanNewmanCommunities(graph)]; // lazy community splits
getBridges(graph); // bridge edges
isIsomorphic(graph, otherGraph); // structural equivalence
```

## Diff & Walks

Beyond classic graph algorithms, the library also includes utilities for evolving and exploring graph state:

- `getDiff()`, `getPatches()`, `applyPatches()` for graph change tracking
- `genRandomWalk()`, `genWeightedRandomWalk()`, and coverage helpers for model-based testing and simulation
- `getSubgraph()` and `reverseGraph()` for structural transforms

## Visual Graphs

`createVisualGraph()` guarantees `x`, `y`, `width`, `height` on all nodes and edges (default `0`).

```ts
import { createVisualGraph } from '@statelyai/graph';

const diagram = createVisualGraph({
  direction: 'right',
  nodes: [
    { id: 'a', x: 0, y: 0, width: 120, height: 60, shape: 'rectangle' },
    { id: 'b', x: 200, y: 0, width: 120, height: 60, shape: 'ellipse' },
  ],
  edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', width: 100, height: 100 }],
});
```

## Format Conversion

Import and export graphs to many formats. Converters are available as subpath imports.

```ts
import { toDOT } from '@statelyai/graph/dot';
import { fromGEXF } from '@statelyai/graph/gexf';
import { toCytoscapeJSON } from '@statelyai/graph/cytoscape';
import { toD3Graph } from '@statelyai/graph/d3';

const dot = toDOT(graph); // Graphviz DOT
const cytoData = toCytoscapeJSON(graph); // Cytoscape.js JSON
const d3Data = toD3Graph(graph); // D3.js { nodes, links }
const imported = fromGEXF(gexfXmlString); // GEXF (Gephi)
```

<!-- supported format adapters derived from src/formats/* subdirectories -->

**Supported formats:** Cytoscape.js JSON, D3.js JSON, D2, JSON Graph Format, GEXF, GraphML, GML, TGF, DOT, Mermaid (flowchart, state, sequence, class, ER, mindmap, block, Ishikawa), ELK, xyflow, adjacency list, and edge list.

Each bidirectional format also has a converter object:

```ts
import { cytoscapeConverter } from '@statelyai/graph/cytoscape';

const cyto = cytoscapeConverter.to(graph);
const back = cytoscapeConverter.from(cyto);
```

Round-trip fidelity may use adapter-specific graph, node, and edge `data`
metadata when the target format does not have a native field for a source
concept. A `partial` round-trip entry means the adapter still drops meaningful
source information instead of preserving it as metadata.

## Format Support

<!-- format support matrix derived from src/formats/support.ts -->

| Format              | Hierarchy | Ports   | Visual  | Round-trip | Notes                                                                      |
| ------------------- | --------- | ------- | ------- | ---------- | -------------------------------------------------------------------------- |
| `adjacency-list`    | none      | none    | none    | partial    | Connectivity only; edge metadata is lost.                                  |
| `cytoscape`         | full      | full    | full    | full       | Graph, node, and edge metadata round-trip through element data.            |
| `d3`                | full      | full    | full    | full       | Graph, node, and edge metadata round-trip through the loose JSON shape.    |
| `d2`                | full      | full    | full    | full       | D2 syntax, hierarchy, ports, styles, and connector modes round-trip.       |
| `dot`               | partial   | partial | partial | partial    | Edge port ids round-trip, but `:port:compass` mapping is still incomplete. |
| `edge-list`         | none      | none    | none    | partial    | Endpoints only.                                                            |
| `elk`               | full      | full    | full    | full       | Metadata round-trips through reserved layout options.                      |
| `gexf`              | full      | full    | full    | full       | Custom attributes preserve metadata beyond the standard viz module.        |
| `gml`               | full      | full    | full    | full       | Graph, node, and edge metadata round-trip through direct and JSON fields.  |
| `graphml`           | full      | full    | partial | partial    | Ports round-trip through `<data>` fields.                                  |
| `jgf`               | full      | full    | full    | full       | Graph, node, and edge metadata round-trip through `metadata` objects.      |
| `tgf`               | none      | none    | none    | partial    | Minimal ids and labels only.                                               |
| `xyflow`            | full      | full    | full    | full       | Metadata round-trips through reserved data fields.                         |
| `mermaid/block`     | partial   | none    | partial | partial    | Syntax-driven, not port-aware.                                             |
| `mermaid/class`     | none      | none    | none    | partial    | Class syntax is stored conservatively.                                     |
| `mermaid/er`        | none      | none    | none    | partial    | Focuses on entities and cardinality.                                       |
| `mermaid/flowchart` | partial   | none    | partial | partial    | `linkStyle` indices are fragile.                                           |
| `mermaid/ishikawa`  | full      | none    | none    | partial    | Preserves hierarchy, not fishbone layout.                                  |
| `mermaid/mindmap`   | full      | none    | partial | partial    | Icon syntax is not fully re-emitted.                                       |
| `mermaid/sequence`  | partial   | none    | none    | partial    | Actor links and menu syntax are incomplete.                                |
| `mermaid/state`     | full      | none    | partial | full       | State syntax round-trips through graph and node data.                      |

Some formats have optional peer dependencies: `fast-xml-parser` (GEXF, GraphML) and `dotparser` (DOT). All other formats are dependency-free.

Format-specific docs live alongside the source:

<!-- format README files under src/formats/*/README.md -->

- [Adjacency list](./src/formats/adjacency-list/README.md)
- [Cytoscape](./src/formats/cytoscape/README.md)
- [D3](./src/formats/d3/README.md)
- [D2](./src/formats/d2/README.md)
- [DOT](./src/formats/dot/README.md)
- [Edge list](./src/formats/edge-list/README.md)
- [ELK](./src/formats/elk/README.md)
- [GEXF](./src/formats/gexf/README.md)
- [GML](./src/formats/gml/README.md)
- [GraphML](./src/formats/graphml/README.md)
- [JGF](./src/formats/jgf/README.md)
- [Mermaid](./src/formats/mermaid/README.md)
- [TGF](./src/formats/tgf/README.md)
- [xyflow](./src/formats/xyflow/README.md)
- [Converter helpers](./src/formats/converter/README.md)

## Examples

<!-- runnable example files under examples/ -->

The repo includes runnable examples under [`examples/`](./examples):

- [Flow-based math](./examples/flow-based-math.ts) shows ports, topological ordering, and value propagation.
- [Async workflow](./examples/async-workflow.ts) models an n8n/Zapier-style workflow with ports and dependency-aware execution.

## Development

<!-- dev commands from package.json#scripts -->

```bash
pnpm install
pnpm verify
pnpm bench
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contributor conventions, format-module checklist, and release notes guidance.

## Why this library?

Graph file formats define how to _store_ graphs. Visualization libraries define how to _render_ them. This library is the trusted interchange and analysis layer in between: plain JSON objects in, validation, algorithms, transforms, diffing, and format-preserving conversion out.

```
GEXF file → fromGEXF() → Graph → run algorithms, mutate → toCytoscapeJSON() → render
```

Your `Graph` is a plain object that survives `JSON.stringify`, `structuredClone`, `postMessage`, and `localStorage` without adapters.

A canonical graph is a deterministic projection of a graph for comparison, hashing, snapshots, or caches. A future pure helper would return a new graph with stable node/edge ordering and normalized optional fields. A hash would be a digest of that canonical JSON. A summary would be a small structural report, for example node count, edge count, roots, sinks, component count, compound depth, port count, and whether the graph is acyclic. A pure `sortGraph()` would return a sorted copy and never mutate the input.

## License

MIT
