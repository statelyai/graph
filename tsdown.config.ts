import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/schemas.ts',
    'src/algorithms.ts',
    'src/format-support.ts',
    'src/queries.ts',
    // Kernel — public fast-path primitives for plugins & large graphs
    'src/kernel.ts',
    // Formats — each gets its own subpath export
    'src/formats/adjacency-list/index.ts',
    'src/formats/converter/index.ts',
    'src/formats/cytoscape/index.ts',
    'src/formats/d2/index.ts',
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
    // Layout — contract + per-engine adapters (optional peers)
    'src/layout/index.ts',
    'src/layout/elk.ts',
    'src/layout/dagre.ts',
    'src/layout/d3-force.ts',
    'src/layout/graphviz.ts',
    'src/layout/forceatlas2.ts',
    'src/layout/d3-hierarchy.ts',
    'src/layout/webcola.ts',
    'src/layout/cytoscape.ts',
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
