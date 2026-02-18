# @statelyai/graph

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
