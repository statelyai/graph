# @statelyai/graph

Plain JSON-serializable graph library. No classes (except optional `GraphInstance` wrapper). Transparent WeakMap-based indexing.

## Commands

```bash
pnpm test -- --run   # run tests
pnpm typecheck       # tsc --noEmit
pnpm build           # tsdown → dist/
```

## Naming Conventions

### Function prefixes — ALL functions must be prefixed

| Prefix | Returns | On not-found | Example |
|--------|---------|-------------|---------|
| `get*` | value, array, or `undefined` | returns `undefined` | `getNode()`, `getChildren()`, `getLCA()` |
| `gen*` | `Generator<T>` | yields nothing | `genShortestPaths()`, `genCycles()` |
| `is*` | `boolean` | — | `isAcyclic()`, `isCompound()` |
| `has*` | `boolean` | — | `hasNode()`, `hasPath()` |
| `create*` | new object | — | `createGraph()`, `createVisualGraph()` |
| `to*`/`from*` | format conversion | — | `toDOT()`, `fromGraphML()` |
| `add*`/`delete*`/`update*` | mutates in place | throws if missing | `addNode()`, `deleteEdge()` |

No unprefixed functions. Every query, lookup, and algorithm has a prefix.
Why: standalone functions need prefixes to avoid `const children = children(...)` shadowing conflicts.

### gen/get pairing

Expensive multi-result functions get both forms:
- `gen*` — lazy generator, use when you need first N or early exit
- `get*` — returns full array, delegates to `gen*` internally: `return [...genFoo()]`

Single-result convenience functions use `get*` with required `to` option (`SinglePathOptions`).

## Type Conventions

| Pattern | Purpose | Example |
|---------|---------|---------|
| `Graph*` | Primary types (strict, resolved) | `GraphNode`, `GraphEdge`, `GraphPort` |
| `*Config` | Input types (lenient, optional fields) | `NodeConfig`, `GraphConfig`, `PortConfig` |
| `*Options` | Algorithm parameters | `PathOptions`, `MSTOptions` |
| `Visual*` | Required position/size | `VisualNode`, `VisualGraph`, `VisualPort` |
| `*Update` | Batch update payloads | `EntitiesUpdate` |
| `GraphEntity` / `VisualGraphEntity` | DRY base interfaces | Shared `x,y,width,height,style` |

Generics order: `<TNodeData, TEdgeData, TGraphData, TPortData>`, shortened to `<N, E, G, P>` in function signatures. All default to `any`.

## Architecture

- **`graph.ts`** — factory, lookups, mutations (add/delete/update), batch ops, port creation
- **`queries.ts`** — neighborhood, hierarchy, degree, edge queries, port queries
- **`algorithms.ts`** — traversal, components, cycles, paths, ordering, MST
- **`transforms.ts`** — `flatten()` (statechart decomposition)
- **`formats/`** — DOT, GraphML, adjacency list, edge list
- **`indexing.ts`** — transparent WeakMap indexing, auto-rebuilt on access
- **`types.ts`** — all type definitions

## Rules

- `graph` is always the first parameter (except `create*` factories)
- Mutations document with `/** **Mutable.** */` JSDoc
- Collection queries return `[]` not `undefined` when empty
- Config types use `?? null` for parentId/initialNodeId, `?? ''` for strings, `?? 0` for visual numbers
- Keep objects JSON-serializable — no functions, classes, or symbols on Graph/Node/Edge/Port
- Tests use vitest. Existing tests must keep passing.

## Ports

Ports are optional connection points on nodes. Edges can reference ports by name via `sourcePort`/`targetPort`.

- Ports use **names, not IDs**. Unique per node; `(nodeId, portName)` is the global identifier.
- `direction` (`'in' | 'out' | 'inout'`) is **advisory metadata** for layout engines — not enforced.
- Ports have generic data (`P` parameter), like nodes and edges.
- `GraphEntity` / `VisualGraphEntity` are DRY base interfaces shared by nodes, edges, and ports.
- `addEdge`/`updateEdge` validate that referenced ports exist on the respective nodes.
- Port queries: `getPort(graph, nodeId, portName)`, `getPorts(graph, nodeId)`, `getEdgesByPort(graph, nodeId, portName)`.
- ELK adapter: port `name` maps to ELK port `id`; `direction` maps to `org.eclipse.elk.port.side`.
- xyflow adapter: `sourcePort` ↔ `sourceHandle`, `targetPort` ↔ `targetHandle`.
