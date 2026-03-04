import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/schemas.ts',
    'src/algorithms.ts',
    'src/queries.ts',
    // Formats — each gets its own subpath export
    'src/formats/adjacency-list/index.ts',
    'src/formats/converter/index.ts',
    'src/formats/cytoscape/index.ts',
    'src/formats/d3/index.ts',
    'src/formats/dot/index.ts',
    'src/formats/edge-list/index.ts',
    'src/formats/gexf/index.ts',
    'src/formats/gml/index.ts',
    'src/formats/graphml/index.ts',
    'src/formats/jgf/index.ts',
    'src/formats/tgf/index.ts',
    'src/formats/elk/index.ts',
    'src/formats/xyflow/index.ts',
    'src/formats/mermaid/index.ts',
  ],
  exports: {
    customExports(exports) {
      const remapped: Record<string, any> = {};
      for (const [key, value] of Object.entries(exports)) {
        // Strip ./formats/ prefix → ./cytoscape, ./dot, etc.
        if (key.startsWith('./formats/')) {
          remapped[key.replace('./formats/', './')] = value;
        } else {
          remapped[key] = value;
        }
      }
      return remapped;
    },
  },
})
