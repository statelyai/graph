import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: [
    'src/index.ts',
    'src/schemas.ts',
    'src/algorithms.ts',
    'src/queries.ts',
    'src/formats/graphml.ts',
    'src/formats/dot.ts',
    'src/formats/adjacency-list.ts',
    'src/formats/edge-list.ts',
  ],
  exports: true,
})
