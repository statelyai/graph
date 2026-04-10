import * as z from 'zod';
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { GraphSchema, NodeSchema, EdgeSchema } from '../src/schemas';

const outDir = join(dirname(import.meta.dirname!), 'schemas');
mkdirSync(outDir, { recursive: true });
const checkMode = process.argv.includes('--check');

const schemas = {
  'graph.schema.json': GraphSchema,
  'node.schema.json': NodeSchema,
  'edge.schema.json': EdgeSchema,
} as const;

for (const [filename, schema] of Object.entries(schemas)) {
  const jsonSchema = z.toJSONSchema(schema);
  const nextContents = JSON.stringify(jsonSchema, null, 2) + '\n';
  const outPath = join(outDir, filename);

  if (checkMode) {
    const currentContents = existsSync(outPath)
      ? readFileSync(outPath, 'utf8')
      : null;
    if (currentContents !== nextContents) {
      console.error(`Schema drift detected in ${outPath}`);
      process.exitCode = 1;
    }
    continue;
  }

  writeFileSync(outPath, nextContents);
  console.log(`Generated ${outPath}`);
}

if (checkMode && process.exitCode) {
  console.error('Run `pnpm generate-schema` to update generated schema files.');
}
