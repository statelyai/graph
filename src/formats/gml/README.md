# GML

Converter for [GML](https://en.wikipedia.org/wiki/Graph_Modelling_Language) (Graph Modelling Language) — a hierarchical text format widely supported by graph tools.

## Resources

- [GML specification (Graphlet)](https://web.archive.org/web/20190309090728/http://www.fim.uni-passau.de/index.php?id=17297&L=1)
- [GML on Wikipedia](https://en.wikipedia.org/wiki/Graph_Modelling_Language)

## API

<!-- exported symbols from src/formats/gml/index.ts -->

```ts
import { toGML, fromGML, gmlConverter } from '@statelyai/graph/gml';
import { createGraph } from '@statelyai/graph';

// Export
const graph = createGraph({
  id: 'filesystem',
  nodes: [
    { id: 'root', label: 'root' },
    { id: 'src', label: 'src', parentId: 'root' },
    { id: 'index', label: 'index.ts', parentId: 'src' },
    { id: 'lib', label: 'lib', parentId: 'root' },
    { id: 'utils', label: 'utils.ts', parentId: 'lib' },
  ],
  edges: [
    { id: 'e0', sourceId: 'index', targetId: 'utils', label: 'imports' },
  ],
});

const gml = toGML(graph);

// Import
const imported = fromGML(`graph [
  directed 1
  node [
    id "web"
    label "Web App"
  ]
  node [
    id "api"
    label "REST API"
  ]
  node [
    id "db"
    label "PostgreSQL"
  ]
  edge [
    source "web"
    target "api"
    label "HTTP"
  ]
  edge [
    source "api"
    target "db"
    label "SQL"
  ]
]`);
// a graph containing:
// nodes: - web - api - db
// edges: - (web -> api) - (api -> db)
```

### `toGML(graph): string`

Preserves: `label`, `data` (JSON-stringified), `shape`, `color`, visual properties in `graphics [x, y, w, h]` blocks. Compound graphs use nested `node [ ... node [ ] ]` blocks.

### `fromGML(gml): string`

Includes a full tokenizer and recursive descent parser. Handles:
- Nested node blocks for hierarchy
- `graphics` blocks for positions/dimensions
- JSON-encoded data fields
- Multiple same-key entries (e.g., multiple `node` blocks)

### `gmlConverter`

Pre-built `GraphFormatConverter<string>`:

```ts
const gml = gmlConverter.to(graph);
const graph = gmlConverter.from(gml);
```
