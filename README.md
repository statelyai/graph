# @statelyai/graph

A TypeScript graph library built on plain JSON objects. Supports directed/undirected graphs, hierarchical nodes, graph algorithms, visual properties, and serialization to DOT, GraphML, Mermaid, and more.

Made from our experience at [stately.ai](https://stately.ai), where we build visual tools for complex systems.

## Install

```bash
npm install @statelyai/graph
```

Optional peers are only needed for specific adapters:

| Package | Needed for |
| --- | --- |
| `fast-xml-parser` | `@statelyai/graph/gexf`, `@statelyai/graph/graphml` |
| `dotparser` | `@statelyai/graph/dot` parsing |
| `cytoscape` | Cytoscape integration tests and consumer typing |
| `d3-force` | D3 force integration tests and consumer typing |
| `elkjs` | `@statelyai/graph/elk` |
| `zod` | `@statelyai/graph/schemas` |

## Highlights

- Plain JSON graphs with no runtime wrappers required
- Standalone functions with a consistent `get*`/`gen*`/`is*`/`add*` naming model
- Directed, undirected, hierarchical, and visual graph support
- Ports for node-editor and dataflow-style graphs
- Algorithms for traversal, paths, centrality, communities, connectivity, isomorphism, ordering, MST, and walks
- Diff/patch utilities for graph state changes
- Multi-format conversion via package subpaths
- Small, fast test suite with broad format coverage

## Quick Start

Graphs are plain JSON-serializable objects. All operations are standalone functions — no classes, no DOM, no rendering engine.

```ts
import { createGraph, addNode, addEdge, getShortestPath } from '@statelyai/graph';

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
import { getNode, deleteNode, getNeighbors, getSources } from '@statelyai/graph';

const node = getNode(graph, 'a');       // lookup by id
deleteNode(graph, 'd');                 // removes node + connected edges
const neighbors = getNeighbors(graph, 'a'); // adjacent nodes
const roots = getSources(graph);        // nodes with no incoming edges
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
    { id: 'e1', sourceId: 'a', targetId: 'b' },   // resolves to a -> b1
    { id: 'e2', sourceId: 'b1', targetId: 'b2' },
    { id: 'e3', sourceId: 'b', targetId: 'c' },    // expands from all leaves of b
  ],
});

const children = getChildren(graph, 'b'); // [b1, b2]
const flat = flatten(graph);              // only leaf nodes, edges resolved
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

## Algorithms

Includes traversal (BFS, DFS), pathfinding (shortest path, simple paths, all-pairs shortest paths), centrality/link analysis (degree, closeness, betweenness, PageRank, HITS, eigenvector), community detection (label propagation, Girvan-Newman, greedy modularity, modularity scoring), cycle detection, connected/strongly-connected components, bridges, articulation points, biconnected components, isomorphism, topological sort, minimum spanning tree, and more. Many algorithms have lazy generator variants (`gen*`) for early exit.

```ts
import {
  bfs, dfs, hasPath, isAcyclic,
  getShortestPath, getCycles, getTopologicalSort,
  getConnectedComponents, getMinimumSpanningTree,
  getPageRank, getLabelPropagationCommunities,
  genGirvanNewmanCommunities, getBridges, isIsomorphic,
} from '@statelyai/graph';

for (const node of bfs(graph, 'a')) { /* breadth-first */ }
for (const node of dfs(graph, 'a')) { /* depth-first */ }

hasPath(graph, 'a', 'c');                          // reachability
isAcyclic(graph);                                  // cycle check
getShortestPath(graph, { from: 'a', to: 'c' });   // single shortest path
getTopologicalSort(graph);                         // topological order (or null)
getConnectedComponents(graph);                     // connected components
getMinimumSpanningTree(graph, { weight: e => e.data?.weight ?? 1 }); // MST
getPageRank(graph);                                // link analysis scores
getLabelPropagationCommunities(graph);             // community detection
[...genGirvanNewmanCommunities(graph)];            // lazy community splits
getBridges(graph);                                 // bridge edges
isIsomorphic(graph, otherGraph);                   // structural equivalence
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

const dot = toDOT(graph);                   // Graphviz DOT
const cytoData = toCytoscapeJSON(graph);     // Cytoscape.js JSON
const d3Data = toD3Graph(graph);             // D3.js { nodes, links }
const imported = fromGEXF(gexfXmlString);    // GEXF (Gephi)
```

**Supported formats:** Cytoscape.js JSON, D3.js JSON, JSON Graph Format, GEXF, GraphML, GML, TGF, DOT, Mermaid (flowchart, state, sequence, class, ER, mindmap, block), adjacency list, and edge list.

Each bidirectional format also has a converter object:

```ts
import { cytoscapeConverter } from '@statelyai/graph/cytoscape';

const cyto = cytoscapeConverter.to(graph);
const back = cytoscapeConverter.from(cyto);
```

Some formats have optional peer dependencies: `fast-xml-parser` (GEXF, GraphML) and `dotparser` (DOT). All other formats are dependency-free.

Format-specific docs live alongside the source:

- [DOT](./src/formats/dot/README.md)
- [GraphML](./src/formats/graphml/README.md)
- [GEXF](./src/formats/gexf/README.md)
- [GML](./src/formats/gml/README.md)
- [JGF](./src/formats/jgf/README.md)
- [TGF](./src/formats/tgf/README.md)
- [Cytoscape](./src/formats/cytoscape/README.md)
- [D3](./src/formats/d3/README.md)
- [Mermaid](./src/formats/mermaid/README.md)
- [Converter helpers](./src/formats/converter/README.md)

## Examples

The repo includes runnable examples under [`examples/`](./examples):

- [Flow-based math](./examples/flow-based-math.ts) shows ports, topological ordering, and value propagation.
- [Async workflow](./examples/async-workflow.ts) models an n8n/Zapier-style workflow with ports and dependency-aware execution.

## Development

```bash
pnpm install
pnpm verify
```

See [CONTRIBUTING.md](./CONTRIBUTING.md) for contributor conventions, format-module checklist, and release notes guidance.

## Why this library?

Graph file formats define how to _store_ graphs. Visualization libraries define how to _render_ them. This library is the computational layer in between: plain JSON objects in, algorithms and mutations, plain JSON objects out.

```
GEXF file → fromGEXF() → Graph → run algorithms, mutate → toCytoscapeJSON() → render
```

Your `Graph` is a plain object that survives `JSON.stringify`, `structuredClone`, `postMessage`, and `localStorage` without adapters.

## License

MIT
