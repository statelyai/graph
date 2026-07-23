# @statelyai/graph

A TypeScript graph library for JSON-serializable graph IR. Use it to validate, analyze, transform, and round-trip directed, undirected, hierarchical, port-aware, and visual graphs across tools.

Made from our experience at [stately.ai](https://stately.ai), where we build visual tools for complex systems.

## Install

```bash
npm install @statelyai/graph
```

Optional peers are only needed for specific adapters:

<!-- optional peer dependencies derived from package.json#peerDependencies -->

| Package                                     | Needed for                                          |
| ------------------------------------------- | --------------------------------------------------- |
| `fast-xml-parser`                           | `@statelyai/graph/gexf`, `@statelyai/graph/graphml` |
| `dotparser`                                 | `@statelyai/graph/dot` parsing                      |
| `zod`                                       | `@statelyai/graph/schemas`                          |
| `elkjs`                                     | `@statelyai/graph/elk`, `@statelyai/graph/layout/elk` |
| `@dagrejs/dagre`                            | `@statelyai/graph/layout/dagre`                     |
| `@hpcc-js/wasm-graphviz`                    | `@statelyai/graph/layout/graphviz`                  |
| `d3-force`                                  | `@statelyai/graph/layout/d3-force`                  |
| `graphology`, `graphology-layout-forceatlas2` | `@statelyai/graph/layout/forceatlas2`             |
| `d3-hierarchy`                              | `@statelyai/graph/layout/d3-hierarchy`              |
| `webcola`                                   | `@statelyai/graph/layout/webcola`                   |
| `cytoscape`                                 | `@statelyai/graph/layout/cytoscape`, Cytoscape format typing |

## Highlights

- Plain JSON graphs with no runtime wrappers required; omitted `data` defaults to `null`
- Standalone functions with a consistent `get*`/`gen*`/`is*`/`add*` naming model
- Directed, undirected, hierarchical, and visual graph support
- Ports for node-editor and dataflow-style graphs
- Algorithms for traversal, paths, centrality, communities, connectivity, flow/cuts, matching, cores, isomorphism, ordering, MST, and walks
- Pluggable layout over eight external engines (ELK, Graphviz, dagre, d3-force, ForceAtlas2, tidy tree, WebCola, cytoscape) — pure functions, optional peers
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

<!-- mutable and immutable graph operations exported from src/graph.ts -->

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

Every mutable CRUD operation has an immutable counterpart:

| Mutable | Immutable |
| --- | --- |
| `addNode` / `addEdge` | `getGraphWithNode` / `getGraphWithEdge` |
| `deleteNode` / `deleteEdge` | `getGraphWithoutNode` / `getGraphWithoutEdge` |
| `updateNode` / `updateEdge` | `getGraphWithUpdatedNode` / `getGraphWithUpdatedEdge` |
| `addEntities` | `getGraphWithEntities` |
| `deleteEntities` | `getGraphWithoutEntities` |
| `updateEntities` | `getGraphWithUpdatedEntities` |

Immutable operations return a new graph, leave the source untouched, and reuse unchanged entities where safe.

`updateNode`/`updateEdge` accept any config field. Optional fields (position, size, `shape`, `color`, `style`, edge `weight`/`mode`/ports) can be **unset** by passing `null`; `undefined` leaves them unchanged:

```ts
updateNode(graph, 'a', { x: 100, color: 'red' }); // set
updateEdge(graph, 'e1', { weight: 2, mode: 'undirected' });
updateNode(graph, 'a', { color: null }); // unset
```

## Hierarchy

Nodes support parent-child relationships for compound/nested graphs. Query children, ancestors, descendants, depth, and least common ancestor. Use `getFlattenedGraph()` to decompose into a flat leaf-node graph.

```ts
import { createGraph, getChildren, getLCA, getFlattenedGraph } from '@statelyai/graph';

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
const flat = getFlattenedGraph(graph); // only leaf nodes, edges resolved
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

For structural invariant checking without zod, the core export `getGraphIssues(graph)` returns machine-readable issues (duplicate ids, dangling edge endpoints, missing parents, parent cycles, missing initial nodes, duplicate or invalid port references) — the recommended gate for untrusted or imported graphs:

```ts
import { getGraphIssues } from '@statelyai/graph';

const issues = getGraphIssues(importedGraph);
if (issues.length > 0) {
  console.error(issues.map((issue) => issue.message));
}
```

Use the `@statelyai/graph/schemas` subpath when you want full runtime shape validation or JSON Schema generation. `validateGraph()` combines zod shape checks with the same graph invariants.

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

Includes traversal (BFS, DFS, preorder/postorder), pathfinding (shortest path, simple paths, all-pairs shortest paths, A*, bidirectional Dijkstra), centrality/link analysis (degree, closeness, betweenness, PageRank, HITS, eigenvector, Katz), community detection (Louvain, label propagation, Girvan-Newman, greedy modularity, modularity scoring), flow & cuts (`getMaxFlow`, `getMinCut`), bipartite analysis (`isBipartite`, Hopcroft–Karp `getMaximumBipartiteMatching`), k-cores (`getCoreNumbers`, `getKCore`), graph coloring (`getGraphColoring`, `isValidColoring`), planarity testing (`isPlanar`), approximate TSP tours (`getTSPTour`) and Steiner trees (`getSteinerTree`), cycle detection, connected/strongly-connected components, bridges, articulation points, biconnected components, dominator trees, transitive reduction, isomorphism, topological sort, minimum spanning tree, and seeded graph generators (`createCompleteGraph`, `createGridGraph`, `createRandomGraph`, `createWattsStrogatzGraph`, `createBarabasiAlbertGraph`). Many algorithms have lazy generator variants (`gen*`) for early exit. See [docs/algorithms.md](./docs/algorithms.md) for the full reference.

Hot algorithm loops (centrality, components) run on an internal compressed-sparse-row snapshot — cached and invalidated transparently like the rest of the index — so they stay fast on large graphs without changing the plain-JSON model. Algorithm results are differential-tested against graphology on seeded random graphs.

```ts
import {
  genBFS,
  genDFS,
  hasPath,
  isAcyclic,
  getShortestPath,
  getCycles,
  getTopologicalSort,
  getConnectedComponents,
  getMinimumSpanningTree,
  getPageRank,
  getLouvainCommunities,
  getLabelPropagationCommunities,
  genGirvanNewmanCommunities,
  getBridges,
  getMaxFlow,
  getDominatorTree,
  getTransitiveReduction,
  isIsomorphic,
} from '@statelyai/graph';

for (const node of genBFS(graph, 'a')) {
  /* breadth-first */
}
for (const node of genDFS(graph, 'a')) {
  /* depth-first */
}

hasPath(graph, 'a', 'c'); // reachability
isAcyclic(graph); // cycle check
getShortestPath(graph, { from: 'a', to: 'c' }); // single shortest path
getTopologicalSort(graph); // topological order (or null)
getConnectedComponents(graph); // connected components
getMinimumSpanningTree(graph, { getWeight: (e) => e.weight ?? 1 }); // MST
getPageRank(graph); // link analysis scores
getLouvainCommunities(graph); // community detection (Louvain)
getLabelPropagationCommunities(graph); // community detection
[...genGirvanNewmanCommunities(graph)]; // lazy community splits
getBridges(graph); // bridge edges
getMaxFlow(graph, { from: 'a', to: 'c' }); // max flow + min cut
getDominatorTree(graph, { from: 'a' }); // immediate dominators
getTransitiveReduction(graph); // minimal equivalent DAG
isIsomorphic(graph, otherGraph); // structural equivalence
```

## Large graphs & cancellation

JSON is the canonical representation; typed arrays are the compute layer. The `@statelyai/graph/kernel` subpath exposes the fast-path primitives the hot algorithms already use — the adjacency `getIndex(graph)`, the compressed-sparse-row snapshot `getCSR(graph)`, `invalidateIndex(graph)`, and `memoizeByGraph()`. All are cached in `WeakMap`s keyed on the graph, revalidated in O(1) via a version counter, and never serialized. Build on them to write plugins and inner loops without rebuilding adjacency from `graph.nodes`/`graph.edges` on every call.

```ts
import { getCSR, memoizeByGraph } from '@statelyai/graph/kernel';
import { getBetweennessCentrality } from '@statelyai/graph';

const csr = getCSR(graph); // flat Int32Array snapshot for inner loops

// Version-keyed memoization: repeated queries on an unchanged graph are O(1);
// any mutation bumps the index version and invalidates automatically.
const betweenness = memoizeByGraph(getBetweennessCentrality);
betweenness(graph); // computes
betweenness(graph); // cached
```

Expensive algorithms (betweenness, closeness, PageRank, HITS, eigenvector, Katz, Louvain, label propagation, Girvan–Newman, greedy modularity, max-flow/min-cut, all-pairs shortest paths, isomorphism, dominator tree) accept an `AbortSignal`; on abort they throw `signal.reason`:

```ts
const controller = new AbortController();
setTimeout(() => controller.abort(new Error('too slow')), 1000);
getBetweennessCentrality(graph, { signal: controller.signal });
```

There is no bundled worker runtime — workers are a recipe, not a dependency. Because a `Graph` is plain JSON, `structuredClone`/`postMessage` it to a Worker and run the algorithm there with zero serialization layer:

```ts
// worker.ts
import { getBetweennessCentrality } from '@statelyai/graph';
self.onmessage = (e) => self.postMessage(getBetweennessCentrality(e.data));

// main.ts
const worker = new Worker(new URL('./worker.ts', import.meta.url), {
  type: 'module',
});
worker.postMessage(graph); // graph survives postMessage as-is
worker.onmessage = (e) => console.log(e.data);
```

`gen*` generators remain the cooperative-slicing story for main-thread work. See [docs/scaling-and-plugins.md](./docs/scaling-and-plugins.md) for the full design.

### Writing plugins

A plugin is just an npm package of standalone prefixed functions taking `graph` first — exactly like the built-ins — built on `@statelyai/graph/kernel` for the fast path and `memoizeByGraph` for caching. There is no registry and no method chaining: the standalone-function model _is_ the plugin model. Test against the JSON schema (`@statelyai/graph/schemas`), and publish with the npm keyword `statelyai-graph-plugin` for discoverability.

## Layout

<!-- layout adapters under src/layout/*.ts and helpers exported from src/layout/index.ts -->

Plug-and-play layout over external engines — pure functions in, positioned `VisualGraph` out. No layout algorithms of our own; each adapter is a subpath with an optional peer dependency. The hierarchical engines (ELK, dagre, Graphviz) also produce routed edge `points` and computed edge-label rects; the physics/tree/cytoscape engines position nodes only.

```ts
import { getElkLayout } from '@statelyai/graph/layout/elk'; // elkjs
import { getDagreLayout } from '@statelyai/graph/layout/dagre'; // @dagrejs/dagre
import { getGraphvizLayout } from '@statelyai/graph/layout/graphviz'; // @hpcc-js/wasm-graphviz (8 engines)
import { genForceLayout } from '@statelyai/graph/layout/d3-force'; // d3-force
import { getForceAtlas2Layout } from '@statelyai/graph/layout/forceatlas2'; // graphology FA2
import { getTidyTreeLayout } from '@statelyai/graph/layout/d3-hierarchy'; // d3-hierarchy
import { getColaLayout } from '@statelyai/graph/layout/webcola'; // webcola (constraints)
import { getCytoscapeLayout } from '@statelyai/graph/layout/cytoscape'; // cytoscape ecosystem
import {
  applyLayoutFrame,
  getGraphWithLayoutFrame,
  getLayoutBounds,
  centerGraph,
} from '@statelyai/graph/layout';

const laidOut = await getElkLayout(graph, {
  measure: (node) => measureText(node.label), // text measurement stays yours
  constraints: { layer: (node) => node.data?.tier }, // portable layer constraint
});

// Physics layouts are generators — one tick per frame, cancel by stopping
for (const frame of genForceLayout(graph, { seed: 42 })) {
  applyLayoutFrame(graph, frame);
  render(graph);
}

// Immutable alternative
let current = graph;
for (const frame of genForceLayout(graph, { seed: 42 })) {
  current = getGraphWithLayoutFrame(current, frame);
  render(current);
}
```

Edge `x`/`y`/`width`/`height` are canonically the edge-label rect; routes live in `edge.points` (`routing` says how to interpret them). Layouts are plain JSON — tween between engines with `genLayoutTransition`, or diff them with `getPatches`. See [docs/layout.md](./docs/layout.md) and [docs/layout-transitions.md](./docs/layout-transitions.md).

## Diff & Walks

Beyond classic graph algorithms, the library also includes utilities for evolving and exploring graph state:

- `getDiff()`, `getPatches()`, `getPatchedGraph()` (immutable), and `updateGraphWithPatches()` (mutable) for graph change tracking
- `genRandomWalk()`, `genWeightedRandomWalk()`, and coverage helpers for model-based testing and simulation
- `getSubgraph()` and `getReversedGraph()` for structural transforms

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

| Format              | Hierarchy | Ports   | Visual  | Round-trip | Notes                                                                                                                                        |
| ------------------- | --------- | ------- | ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `adjacency-list`    | none      | none    | none    | partial    | Connectivity only; edge metadata is lost.                                                                                                    |
| `cytoscape`         | full      | full    | full    | full       | Graph/node/edge metadata (incl. per-edge `mode`) round-trips through element data.                                                           |
| `d3`                | full      | full    | full    | full       | Graph/node/edge metadata (incl. per-edge `mode`) round-trips through the loose JSON shape.                                                   |
| `d2`                | full      | full    | full    | full       | Hierarchy, ports, styles, and connector modes round-trip; nested `vars` sub-blocks are dropped.                                              |
| `dot`               | partial   | partial | partial | partial    | Edge port ids round-trip, but `:port:compass` mapping is still incomplete.                                                                   |
| `edge-list`         | none      | none    | none    | partial    | Endpoints only.                                                                                                                              |
| `elk`               | full      | full    | full    | full       | Metadata round-trips through reserved layout options; port ids are emitted as `nodeId__portName` (document-unique, as ELK requires).         |
| `gexf`              | full      | full    | full    | full       | Custom attributes preserve metadata; `bidirectional` maps to directed.                                                                       |
| `gml`               | full      | full    | full    | full       | Metadata round-trips through direct and JSON fields; per-edge/graph `mode` via a dialect key.                                                |
| `graphml`           | full      | full    | partial | full       | Emit is own-dialect (`<data>` fields, flat); import handles both dialects incl. standard nested `<graph>`, native `<port>` elements, and `sourceport`/`targetport` attributes. Multi-graph files import the first graph. |
| `jgf`               | full      | full    | full    | full       | Metadata (incl. per-edge/graph `mode`) round-trips through `metadata` objects.                                                               |
| `tgf`               | none      | none    | none    | partial    | Minimal ids and labels only.                                                                                                                 |
| `xyflow`            | full      | full    | full    | full       | Metadata (incl. weight, ports, per-edge `mode`) round-trips through reserved data fields; parents are ordered before children for React Flow. |
| `mermaid/block`     | partial   | none    | partial | partial    | Syntax-driven, not port-aware.                                                                                                               |
| `mermaid/class`     | none      | none    | none    | partial    | Class syntax is stored conservatively.                                                                                                       |
| `mermaid/er`        | none      | none    | none    | partial    | Focuses on entities and cardinality.                                                                                                         |
| `mermaid/flowchart` | partial   | none    | partial | partial    | `linkStyle` indices are fragile.                                                                                                             |
| `mermaid/ishikawa`  | full      | none    | none    | partial    | Preserves hierarchy, not fishbone layout.                                                                                                    |
| `mermaid/mindmap`   | full      | none    | partial | partial    | Icon syntax is not fully re-emitted.                                                                                                         |
| `mermaid/sequence`  | partial   | none    | none    | partial    | Actor links and menu syntax are incomplete.                                                                                                  |
| `mermaid/state`     | full      | none    | partial | partial    | Isolated states and labels now emit (labels via the description form); `initialNodeId` round-trips as `[*] -->`.                             |

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

## Guides

<!-- guide documents under docs/*.md -->

- [Layout guide](./docs/layout.md) — the adapter contract, all eight engines, constraints, sizing, web workers
- [Layout transitions](./docs/layout-transitions.md) — tween between engines; layouts are just data
- [Algorithms reference](./docs/algorithms.md) — every algorithm with complexity and semantics notes
- [Benchmarks](./docs/benchmarks.md) — measured against graphology, ngraph, graphlib, and cytoscape
- [Scaling & plugins](./docs/scaling-and-plugins.md) — the public kernel, cancellation, worker recipe, and plugin authoring
- [Migrating from graphlib](./docs/migrating-from-graphlib.md)
- [React Flow + ELK pipeline](./docs/react-flow-elk-pipeline.md) — measured nodes, worker layout, live re-layout

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
pnpm bench                # micro-benchmarks (vitest bench)
pnpm bench:compare        # cross-library comparison run
pnpm bench:compare:quick  # faster, smaller-sample comparison
pnpm bench:report         # render the comparison results
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
