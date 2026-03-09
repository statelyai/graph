# @statelyai/graph

A TypeScript graph library built on plain JSON objects. Supports directed/undirected graphs, hierarchical nodes, graph algorithms, visual properties, and serialization to DOT, GraphML, Mermaid, and more.

Made from our experience at [stately.ai](https://stately.ai), where we build visual tools for complex systems.

## Install

```bash
npm install @statelyai/graph
```

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

## Algorithms

Includes traversal (BFS, DFS), pathfinding (shortest path, simple paths, all-pairs shortest paths), cycle detection, connected/strongly-connected components, topological sort, minimum spanning tree, and more. Many algorithms have lazy generator variants (`gen*`) for early exit.

```ts
import {
  bfs, dfs, hasPath, isAcyclic,
  getShortestPath, getCycles, getTopologicalSort,
  getConnectedComponents, getMinimumSpanningTree,
} from '@statelyai/graph';

for (const node of bfs(graph, 'a')) { /* breadth-first */ }
for (const node of dfs(graph, 'a')) { /* depth-first */ }

hasPath(graph, 'a', 'c');                          // reachability
isAcyclic(graph);                                  // cycle check
getShortestPath(graph, { from: 'a', to: 'c' });   // single shortest path
getTopologicalSort(graph);                         // topological order (or null)
getConnectedComponents(graph);                     // connected components
getMinimumSpanningTree(graph, { weight: e => e.data?.weight ?? 1 }); // MST
```

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

## Why this library?

Graph file formats define how to _store_ graphs. Visualization libraries define how to _render_ them. This library is the computational layer in between: plain JSON objects in, algorithms and mutations, plain JSON objects out.

```
GEXF file → fromGEXF() → Graph → run algorithms, mutate → toCytoscapeJSON() → render
```

Your `Graph` is a plain object that survives `JSON.stringify`, `structuredClone`, `postMessage`, and `localStorage` without adapters.

## License

MIT
