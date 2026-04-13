# ELK

Converter for [ELK](https://eclipse.dev/elk/) (Eclipse Layout Kernel) JSON — the layout format consumed by [`elkjs`](https://github.com/kieler/elkjs). Works with `VisualGraph` since ELK expects/produces positions and sizes.

## Resources

- [ELK documentation](https://eclipse.dev/elk/documentation.html)
- [elkjs on npm](https://www.npmjs.com/package/elkjs)

## API

<!-- exported symbols from src/formats/elk/index.ts -->

```ts
import { toELK, fromELK, elkConverter } from '@statelyai/graph/elk';
import { createVisualGraph } from '@statelyai/graph';
import ELK from 'elkjs';

const graph = createVisualGraph({
  nodes: [
    { id: 'a', x: 0, y: 0, width: 100, height: 50 },
    { id: 'b', x: 0, y: 0, width: 100, height: 50 },
  ],
  edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
});

// Export → lay out → re-import
const elk = new ELK();
const laidOut = await elk.layout(toELK(graph));
const positioned = fromELK(laidOut);
```

### Compound nodes

Parent/child hierarchy maps to ELK's nested `children`. Edges whose source and target are both descendants of a compound node are placed on that node's `edges` array; all other edges live on the root.

### Ports

`VisualPort.name` maps to ELK `port.id`. `direction` maps to `org.eclipse.elk.port.side`:

| `direction` | ELK `port.side` |
| --- | --- |
| `'in'` | `WEST` |
| `'out'` | `EAST` |
| `'inout'` | (unset) |

Edges referencing a port use the port id in `sources`/`targets`; `fromELK` resolves port ids back to `(nodeId, portName)` via a port-owner map.

### Direction

`VisualGraph.direction` maps to ELK's `elk.direction` layout option (`down`/`up`/`right`/`left` ↔ `DOWN`/`UP`/`RIGHT`/`LEFT`).

### `elkConverter`

Pre-built `VisualGraphFormatConverter<ElkNode>`:

```ts
const elk = elkConverter.to(graph);
const roundTripped = elkConverter.from(elk);
```

### Types

| Type | Description |
| --- | --- |
| `ElkNode`, `ElkExtendedEdge`, `ElkPort`, `ElkLabel`, `LayoutOptions`, … | Re-exported from `elkjs/lib/elk-api` for convenience |

> **Peer dependency:** `elkjs` (optional) — install it to actually run layouts; the converter itself only depends on the types.
