---
"@statelyai/graph": minor
---

Add format converters for JGF, Cytoscape.js JSON, D3 force JSON, GEXF, GML, and TGF

- New `GraphFormatConverter<TSerial>` interface and `createFormatConverter()` factory
- 6 new format modules with bidirectional `to*/from*` functions: `toJGF`/`fromJGF`, `toCytoscapeJSON`/`fromCytoscapeJSON`, `toD3Graph`/`fromD3Graph`, `toGEXF`/`fromGEXF`, `toGML`/`fromGML`, `toTGF`/`fromTGF`
- Input validation with descriptive error messages on all `from*` functions
- End-to-end integration tests with real Cytoscape.js and D3 force libraries
- `cytoscape` and `d3-force` added as optional peer dependencies
