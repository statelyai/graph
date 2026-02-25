# @statelyai/graph

## 0.4.0

### Minor Changes

- [`e268990`](https://github.com/statelyai/graph/commit/e268990dde29ff0e6cb89d10c8ddbdf142bec69b) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Make `parentId`, `initialNodeId`, and `shape` optional on `GraphNode`. These fields are no longer defaulted to `null`/`'rectangle'` by `createGraph`/`createVisualGraph`, they are simply omitted when not provided.

  Add empty string validation for node/edge IDs, `parentId`, `sourceId`, and `targetId`.

- [`55462e6`](https://github.com/statelyai/graph/commit/55462e68902f6241d23d689971ce2cbd756624b5) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add xyflow (React Flow / Svelte Flow) format converter with `toXYFlow()` and `fromXYFlow()` for converting between `VisualGraph` and xyflow node/edge structures. Uses `@xyflow/system` as an optional peer dependency for types. Also adds `VisualGraphFormatConverter` type for visual-first format converters.

## 0.3.1

### Patch Changes

- [#6](https://github.com/statelyai/graph/pull/6) [`c186c2a`](https://github.com/statelyai/graph/commit/c186c2afb4eb7772855f41a03102892ecb97c9b1) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add JSDoc with usage examples to all exported functions

- [`83b3c66`](https://github.com/statelyai/graph/commit/83b3c66a9e5f740442e6e29bc6bfc78f86f61805) Thanks [@davidkpiano](https://github.com/davidkpiano)! - `VisualNode['shape']` is now optional

- [#8](https://github.com/statelyai/graph/pull/8) [`27f3f7f`](https://github.com/statelyai/graph/commit/27f3f7fe744ec5d12c401a372439f85b0f2ca0f3) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Mermaid: reconstruct sequence diagram blocks

## 0.3.0

### Minor Changes

- [#5](https://github.com/statelyai/graph/pull/5) [`25ab36a`](https://github.com/statelyai/graph/commit/25ab36a7507cefac24dc5d86f36b5918af109530) Thanks [@davidkpiano](https://github.com/davidkpiano)! - - Add DOT format (`@statelyai/graph/dot`)

  - Add Mermaid formatters: flowchart, sequence, state, class diagram, ER, mindmap, block
  - Add `getRelativeDistanceMap` and `getRelativeDistance` (queries)
  - Restructure formats into per-format subpackages with READMEs

- [#3](https://github.com/statelyai/graph/pull/3) [`bcf8c48`](https://github.com/statelyai/graph/commit/bcf8c48d8646b45d54049ac68627e8af699f2cda) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Add format converters for JGF, Cytoscape.js JSON, D3 force JSON, GEXF, GML, and TGF

  - New `GraphFormatConverter<TSerial>` interface and `createFormatConverter()` factory
  - 6 new format modules with bidirectional `to*/from*` functions: `toJGF`/`fromJGF`, `toCytoscapeJSON`/`fromCytoscapeJSON`, `toD3Graph`/`fromD3Graph`, `toGEXF`/`fromGEXF`, `toGML`/`fromGML`, `toTGF`/`fromTGF`
  - Input validation with descriptive error messages on all `from*` functions
  - End-to-end integration tests with real Cytoscape.js and D3 force libraries
  - `cytoscape` and `d3-force` added as optional peer dependencies

## 0.2.0

### Minor Changes

- [`4f02507`](https://github.com/statelyai/graph/commit/4f025074bc4318f8c265388e8529eb0677e1eb8c) Thanks [@davidkpiano](https://github.com/davidkpiano)! - Remove `toGraphML`, `fromGraphML`, `GraphSchema`, `NodeSchema`, and `EdgeSchema` from the main barrel export to avoid pulling in optional peer deps (`fast-xml-parser`, `zod`) during SSR.

  Use subpath imports instead:

  - `@statelyai/graph/formats/graphml`
  - `@statelyai/graph/schemas`
