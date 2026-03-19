---
"@statelyai/graph": minor
---

Add port support for nodes and edges, enabling dataflow/node-editor graphs (Node-RED, Unreal Blueprints, ComfyUI).

- Add `GraphEntityConfig`, `GraphEntity`, `VisualGraphEntity` base interfaces (DRY shared props for nodes, edges, ports)
- Add `PortConfig<P>`, `GraphPort<P>`, `VisualPort<P>` types with generic data parameter
- Add `P` (port data) as 4th generic to `Graph<N, E, G, P>` and all related types
- Add `ports?: PortConfig[]` on `NodeConfig`, `ports?: GraphPort[]` on `GraphNode`
- Add `sourcePort?` / `targetPort?` (port name strings) on `EdgeConfig` and `GraphEdge`
- Add `createGraphPort()` factory
- Add port validation: duplicate port names rejected, `addEdge`/`updateEdge` validate port existence
- Add port queries: `getPort()`, `getPorts()`, `getEdgesByPort()`
- ELK adapter: round-trip ports (name ↔ ELK port id, direction ↔ `org.eclipse.elk.port.side`)
- xyflow adapter: `sourcePort` ↔ `sourceHandle`, `targetPort` ↔ `targetHandle`
