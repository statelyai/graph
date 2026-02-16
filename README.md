# @statelyai/graph

A TypeScript graph library built on plain JSON objects. Supports directed/undirected graphs, hierarchical nodes, graph algorithms, visual properties, and serialization to DOT, GraphML, and more.

Made from our experience at [stately.ai](https://stately.ai), where we build visual tools for complex systems.

## Why this library?

Graph file formats (GEXF, GraphML) define how to _store_ graphs. Visualization libraries (Cytoscape.js, D3) define how to _render_ them. Neither gives you a good way to _work with_ them in between.

This library is the computational layer: plain JSON objects in, algorithms and mutations, plain JSON objects out. No classes, no DOM, no rendering engine — just data and functions.

```
GEXF file → fromGEXF() → Graph → run algorithms, mutate → toCytoscapeJSON() → render
```

Your `Graph` is a plain object that survives `JSON.stringify`, `structuredClone`, `postMessage`, and `localStorage` without adapters. Format converters are the I/O ports — read from any supported format, do your work, export to whatever your renderer or database expects.

## Install

```bash
npm install @statelyai/graph
```

## Quick Start

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

### Hierarchical Graphs

Nodes support parent-child relationships. Use `flatten()` to decompose compound nodes into a flat graph.

```ts
import { createGraph, flatten } from '@statelyai/graph';

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

const flat = flatten(graph); // only leaf nodes, edges resolved
```

### Visual Graphs

`createVisualGraph()` guarantees `x`, `y`, `width`, `height` on all nodes and edges (default `0`).

```ts
import { createVisualGraph } from '@statelyai/graph';

const diagram = createVisualGraph({
  direction: 'right',
  nodes: [
    { id: 'a', x: 0, y: 0, width: 120, height: 60, shape: 'rectangle' },
    { id: 'b', x: 200, y: 0, width: 120, height: 60, shape: 'ellipse', color: '#3b82f6' },
  ],
  edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', width: 100, height: 100 }],
});
```

### Format Conversion

```ts
import { toCytoscapeJSON, fromJGF, toD3Graph, toDOT } from '@statelyai/graph';
import { toGraphML, fromGEXF } from '@statelyai/graph/formats/graphml';

// Export to web visualization libraries
const cytoData = toCytoscapeJSON(graph); // Cytoscape.js JSON (compound graphs preserved)
const d3Data = toD3Graph(graph);         // D3.js { nodes, links }

// Export to text formats
const dot = toDOT(graph);               // Graphviz DOT
const xml = toGraphML(graph);            // GraphML XML

// Import from any format
const g1 = fromJGF(jsonGraphData);       // JSON Graph Format
const g2 = fromGEXF(gexfXmlString);      // GEXF (Gephi)
```

Each bidirectional format also has a converter object for a unified interface:

```ts
import { cytoscapeConverter, createFormatConverter } from '@statelyai/graph';

// Use a built-in converter
const cyto = cytoscapeConverter.to(graph);
const back = cytoscapeConverter.from(cyto);

// Create your own
const myConverter = createFormatConverter(myToFn, myFromFn);
```

## API

### Graph Creation

| Function | Description |
|----------|-------------|
| `createGraph(config?)` | Create a graph |
| `createVisualGraph(config?)` | Create a graph with required position/size on nodes and edges |

### Lookups & Mutations

| Function | Description |
|----------|-------------|
| `getNode(graph, id)` | Node by id, or `undefined` |
| `getEdge(graph, id)` | Edge by id, or `undefined` |
| `hasNode(graph, id)` | Node exists? |
| `hasEdge(graph, id)` | Edge exists? |
| `addNode(graph, config)` | Add a node |
| `addEdge(graph, config)` | Add an edge |
| `deleteNode(graph, id, opts?)` | Delete node + connected edges |
| `deleteEdge(graph, id)` | Delete an edge |
| `updateNode(graph, id, patch)` | Update node fields |
| `updateEdge(graph, id, patch)` | Update edge fields |
| `addEntities(graph, entities)` | Batch add |
| `deleteEntities(graph, ids)` | Batch delete |
| `updateEntities(graph, updates)` | Batch update |

### Queries

| Function | Description |
|----------|-------------|
| `getNeighbors(graph, nodeId)` | Adjacent nodes |
| `getSuccessors(graph, nodeId)` | Outgoing neighbors |
| `getPredecessors(graph, nodeId)` | Incoming neighbors |
| `getDegree(graph, nodeId)` | Connected edge count |
| `getInDegree` / `getOutDegree` | Directed edge counts |
| `getEdgesOf(graph, nodeId)` | All connected edges |
| `getInEdges` / `getOutEdges` | Directed edges |
| `getEdgeBetween(graph, src, tgt)` | Edge between two nodes |
| `getSources(graph)` | Nodes with inDegree 0 |
| `getSinks(graph)` | Nodes with outDegree 0 |

### Hierarchy

| Function | Description |
|----------|-------------|
| `getChildren(graph, nodeId)` | Direct children |
| `getParent(graph, nodeId)` | Parent node |
| `getAncestors(graph, nodeId)` | All ancestors |
| `getDescendants(graph, nodeId)` | All descendants |
| `getSiblings(graph, nodeId)` | Same-parent nodes |
| `getRoots(graph)` | Top-level nodes |
| `getDepth(graph, nodeId)` | Hierarchy depth (root = 0) |
| `getLCA(graph, ...nodeIds)` | Least Common Ancestor |
| `isCompound(graph, nodeId)` | Has children? |
| `isLeaf(graph, nodeId)` | No children? |

### Algorithms

| Function | Description |
|----------|-------------|
| `bfs(graph, startId)` | Breadth-first traversal (generator) |
| `dfs(graph, startId)` | Depth-first traversal (generator) |
| `hasPath(graph, src, tgt)` | Reachability check |
| `isAcyclic(graph)` | No cycles? |
| `isConnected(graph)` | Single connected component? |
| `isTree(graph)` | Connected + acyclic? |
| `getConnectedComponents(graph)` | Connected components |
| `getStronglyConnectedComponents(graph)` | SCCs (directed) |
| `getTopologicalSort(graph)` | Topological order, or `null` if cyclic |
| `getShortestPath(graph, opts)` | Single shortest path |
| `getShortestPaths(graph, opts)` | All shortest paths from source |
| `getSimplePath(graph, opts)` | Single simple path |
| `getSimplePaths(graph, opts)` | All simple paths |
| `getCycles(graph)` | All cycles |
| `getPreorder` / `getPostorder` | DFS orderings |
| `getMinimumSpanningTree(graph, opts)` | MST (Prim's or Kruskal's) |
| `getAllPairsShortestPaths(graph, opts)` | Floyd-Warshall or Dijkstra |

Generator variants: `genShortestPaths`, `genSimplePaths`, `genCycles`, `genPreorders`, `genPostorders`.

### Transforms

| Function | Description |
|----------|-------------|
| `flatten(graph)` | Decompose hierarchy into flat leaf-node graph |

### Formats

| Format | Export | Import | Compound? | Notes |
|--------|--------|--------|-----------|-------|
| **Cytoscape.js JSON** | `toCytoscapeJSON` | `fromCytoscapeJSON` | Yes | `parent` maps to `parentId` |
| **D3.js JSON** | `toD3Graph` | `fromD3Graph` | No | `{ nodes, links }` for force layouts |
| **JSON Graph Format** | `toJGF` | `fromJGF` | Yes | Formal spec, metadata-extensible |
| **GEXF** | `toGEXF` | `fromGEXF` | Yes | Gephi native, `pid` hierarchy, viz module |
| **GraphML** | `toGraphML` | `fromGraphML` | Yes | XML standard, requires `fast-xml-parser` |
| **GML** | `toGML` | `fromGML` | Yes | Nested node blocks for hierarchy |
| **TGF** | `toTGF` | `fromTGF` | No | Minimal (id + label only) |
| **DOT** | `toDOT` | — | No | Graphviz export |
| **Adjacency list** | `toAdjacencyList` | `fromAdjacencyList` | No | `Record<string, string[]>` |
| **Edge list** | `toEdgeList` | `fromEdgeList` | No | `[source, target][]` |

GEXF and GraphML require `fast-xml-parser` (optional peer dep). All other formats are dependency-free.

## License

MIT
