# Migrating from @dagrejs/graphlib

A guide for developers moving an existing `@dagrejs/graphlib` (often plus `dagre`) codebase to `@statelyai/graph`.

## Why migrate

- **Plain JSON data model.** A graph is a plain object (`{ nodes: [], edges: [] }`), not a class instance. It serializes with `JSON.stringify`, diffs structurally, and crosses worker/process boundaries with no hydration step. graphlib requires `graphlib.json.write`/`read` round-trips.
- **Performance.** Standalone algorithm functions over indexed plain arrays are competitive with or faster than graphlib across traversal, shortest-path, and component workloads. See [benchmarks](./benchmarks.md).
- **Maintained, broader algorithms.** Everything in `graphlib.alg` has an equivalent here, plus centrality, communities, max-flow, isomorphism, dominators, and more.
- **Dagre still works.** `getDagreLayout` from `@statelyai/graph/layout/dagre` runs dagre for you and returns a new positioned graph.

## Concept mapping

| graphlib | @statelyai/graph |
| --- | --- |
| `new Graph({ directed: true })` | `createGraph({ mode: 'directed' })` (the default) |
| `new Graph({ directed: false })` | `createGraph({ mode: 'undirected' })` — plus per-edge `mode` overrides for mixed graphs |
| `new Graph({ multigraph: true })` | Native — every edge has an explicit `id`, so parallel edges just work |
| `new Graph({ compound: true })` | Native — set `parentId` on nodes |
| `g.setNode('a', label)` | `addNode(graph, { id: 'a', label: 'A', data: {...} })` |
| `g.setEdge('a', 'b', label, name)` | `addEdge(graph, { id: 'e1', sourceId: 'a', targetId: 'b', data: {...} })` |
| `g.removeNode(v)` / `g.removeEdge(v, w)` | `deleteNode(graph, id)` / `deleteEdge(graph, id)` |
| `g.setNode(v, newLabel)` (upsert) | `updateNode(graph, id, { ... })` / `updateEdge(graph, id, { ... })` |
| Node/edge label (arbitrary value) | `data` (arbitrary JSON); `label` here is a display string; numeric weight goes in `weight` |
| `g.node(v)` / `g.hasNode(v)` | `getNode(graph, id)` / `hasNode(graph, id)` |
| `g.edge(v, w)` | `getEdge(graph, edgeId)` or `getEdgesBetween(graph, sourceId, targetId)` |
| `g.nodes()` / `g.edges()` | `graph.nodes` / `graph.edges` — plain arrays, just read them |
| `g.successors(v)` / `g.predecessors(v)` / `g.neighbors(v)` | `getSuccessors` / `getPredecessors` / `getNeighbors` |
| `g.inEdges(v)` / `g.outEdges(v)` / `g.nodeEdges(v)` | `getInEdges` / `getOutEdges` / `getEdgesOf` |
| `g.setParent(v, p)` / `g.parent(v)` / `g.children(v)` | `parentId` on the node config / `getParent(graph, id)` / `getChildren(graph, id)` |
| `g.sources()` / `g.sinks()` | `getSources(graph)` / `getSinks(graph)` |
| `g.setGraph(label)` / `g.graph()` | `data` on the graph config / `graph.data` |
| `g.filterNodes(fn)` | `getSubgraph(graph, nodeIds)` |
| `graphlib.json.write(g)` / `read` | Not needed — the graph already *is* JSON |

### `graphlib.alg.*`

| graphlib | @statelyai/graph |
| --- | --- |
| `alg.dijkstra(g, source, weightFn)` | `getShortestPaths(graph, { from })` (all reachable targets) or `getShortestPath(graph, { from, to })` (single pair, bidirectional Dijkstra) |
| `alg.dijkstraAll` / `alg.floydWarshall` | `getAllPairsShortestPaths(graph, { algorithm: 'dijkstra' \| 'floyd-warshall' \| 'bellman-ford' })` |
| `alg.tarjan(g)` | `getStronglyConnectedComponents(graph)` |
| `alg.topsort(g)` | `getTopologicalSort(graph)` — returns `null` on cycles instead of throwing `CycleException` |
| `alg.components(g)` | `getConnectedComponents(graph)` |
| `alg.preorder(g, vs)` / `alg.postorder(g, vs)` | `getPreorder(graph, { from })` / `getPostorder(graph, { from })` (also `getPreorders`/`getPostorders` and lazy `genPreorders`/`genPostorders`) |
| `alg.dfs(g, vs, order)` | `genDFS(graph, startId)` / `genBFS(graph, startId)` — lazy generators yielding nodes |
| `alg.isAcyclic(g)` | `isAcyclic(graph)` |
| `alg.findCycles(g)` | `getCycles(graph)` (or lazy `genCycles(graph)`) |
| `alg.prim(g, weightFn)` | `getMinimumSpanningTree(graph, { algorithm: 'prim' \| 'kruskal', getWeight })` |

## Worked example

### Before: graphlib + dagre

```ts
import * as graphlib from '@dagrejs/graphlib';
import dagre from '@dagrejs/dagre';

const g = new graphlib.Graph({ directed: true, multigraph: true });
g.setGraph({ rankdir: 'LR' });
g.setDefaultEdgeLabel(() => ({}));

g.setNode('a', { label: 'Start', width: 100, height: 40 });
g.setNode('b', { label: 'Middle', width: 100, height: 40 });
g.setNode('c', { label: 'End', width: 100, height: 40 });
g.setEdge('a', 'b', { weight: 1 }, 'e1');
g.setEdge('b', 'c', { weight: 2 }, 'e2');

const distances = graphlib.alg.dijkstra(g, 'a', (e) => g.edge(e).weight);
// distances['c'].distance === 3

dagre.layout(g); // mutates g; positions on g.node('a').x / .y (centers)
```

### After: @statelyai/graph

```ts
import { createGraph, getShortestPath } from '@statelyai/graph';
import { getDagreLayout } from '@statelyai/graph/layout/dagre';

const graph = createGraph({
  nodes: [
    { id: 'a', label: 'Start', width: 100, height: 40 },
    { id: 'b', label: 'Middle', width: 100, height: 40 },
    { id: 'c', label: 'End', width: 100, height: 40 },
  ],
  edges: [
    { id: 'e1', sourceId: 'a', targetId: 'b', weight: 1 },
    { id: 'e2', sourceId: 'b', targetId: 'c', weight: 2 },
  ],
});

const path = getShortestPath(graph, { from: 'a', to: 'c' });
// path.source.id === 'a'
// path.steps.map((s) => s.node.id) → ['b', 'c']

const laidOut = getDagreLayout(graph, { direction: 'right' });
// Pure: returns a new VisualGraph; `graph` is untouched.
// laidOut.nodes[0].x / .y are top-left coordinates (dagre reports centers;
// the adapter converts). Edge polylines land on edge.points.
```

`getDagreLayout` requires `@dagrejs/dagre` as an optional peer dependency, sets up the multigraph/compound graphlib graph internally (including `parentId` → `setParent`), and accepts raw dagre options via `graphOptions` for anything not covered by `direction`/`spacing`.

## Gotchas

- **Mutations throw; graphlib upserts silently.** `g.setNode` creates-or-updates and `g.removeNode` is a silent no-op. Here, `addNode`/`addEdge` throw if the id already exists (or an edge endpoint is missing), and `deleteNode`/`deleteEdge`/`updateNode`/`updateEdge` throw if the id doesn't exist. Pick `add*` vs `update*` deliberately during migration.
- **Edge ids are explicit.** graphlib identifies edges by `(v, w, name)`; here every edge has a required `id`, which is also what makes multigraphs free. Lookup by endpoints is `getEdgesBetween(graph, sourceId, targetId)` (returns an array — there may be parallel edges).
- **Label vs data vs weight.** graphlib's "label" is one arbitrary value per node/edge. Here it splits three ways: `label` (display string), `data` (arbitrary JSON payload, defaults to `null`), `weight` (number on edges).
- **Default weight is 1, not your label.** `graphlib.alg.dijkstra` defaults every edge to weight 1 unless you pass a `weightFn` reading your label. Here weighted algorithms default to `edge.weight ?? 1`; pass `getWeight: (edge) => ...` to read from `data` instead.
- **Directedness is a mode, and it can be mixed.** Instead of a constructor-time `directed` boolean, the graph has `mode: 'directed' | 'undirected' | 'bidirectional'` and individual edges may override it — something graphlib cannot express.
- **`topsort` doesn't throw.** `getTopologicalSort` returns `null` for cyclic graphs instead of raising `CycleException`. Check the return value.
- **Layout is pure.** `dagre.layout(g)` mutates your graph in place; `getDagreLayout(graph)` returns a new `VisualGraph` and leaves the input alone. Node positions are top-left based, not centers.
- **Compound is always on.** No `compound: true` flag — set `parentId` on any node. `addNode` validates that the parent exists.
- **In-place field mutation needs `invalidateIndex`.** Indexes rebuild automatically when you replace arrays or use the mutation API, but if you reach in and edit a node/edge field directly, call `invalidateIndex(graph)`.

## Coverage gaps

Every `graphlib.alg.*` function has a direct equivalent (see table above). What has no one-line counterpart:

- `setDefaultNodeLabel` / `setDefaultEdgeLabel` — no default-data factories; supply `data` per entity.
- `graphlib.json.write`/`read` produce graphlib's specific JSON shape; if you have stored graphs in that format, you'll need a small one-time conversion to `GraphConfig` (nodes/edges arrays with `id`/`sourceId`/`targetId`).
