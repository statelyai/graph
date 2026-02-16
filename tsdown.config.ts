import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/schemas.ts',
    'src/algorithms.ts',
    'src/queries.ts',
    // Formats — each gets its own subpath export
    'src/formats/adjacency-list.ts',
    'src/formats/converter.ts',
    'src/formats/cytoscape.ts',
    'src/formats/d3.ts',
    'src/formats/dot.ts',
    'src/formats/edge-list.ts',
    'src/formats/gexf.ts',
    'src/formats/gml.ts',
    'src/formats/graphml.ts',
    'src/formats/jgf.ts',
    'src/formats/tgf.ts',
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
