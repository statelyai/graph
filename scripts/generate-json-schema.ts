import * as z from 'zod';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { GraphSchema, NodeSchema, EdgeSchema } from '../src/schemas';

const outDir = join(dirname(import.meta.dirname!), 'schemas');
mkdirSync(outDir, { recursive: true });

const schemas = {
  'graph.schema.json': GraphSchema,
  'node.schema.json': NodeSchema,
  'edge.schema.json': EdgeSchema,
} as const;

for (const [filename, schema] of Object.entries(schemas)) {
  const jsonSchema = z.toJSONSchema(schema);
  const outPath = join(outDir, filename);
  writeFileSync(outPath, JSON.stringify(jsonSchema, null, 2) + '\n');
  console.log(`Generated ${outPath}`);
}
