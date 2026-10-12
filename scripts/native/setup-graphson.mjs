import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';

const metadata = JSON.parse(await readFile(new URL('./graphson-tools.json', import.meta.url), 'utf8'));
const directory = resolve('.tools-native/graphson/lib');
await mkdir(directory, { recursive: true });
for (const artifact of metadata.artifacts) {
  const path = resolve(directory, artifact.filename);
  let bytes;
  try { bytes = await readFile(path); } catch {
    const response = await fetch(artifact.url, { signal: AbortSignal.timeout(30_000) });
    if (!response.ok) throw new Error(`GraphSON native artifact: HTTP ${response.status} ${artifact.filename}`);
    bytes = Buffer.from(await response.arrayBuffer());
  }
  if (createHash('sha256').update(bytes).digest('hex') !== artifact.sha256) throw new Error(`GraphSON native artifact checksum mismatch: ${artifact.filename}`);
  await writeFile(path, bytes);
}
console.log(`Pinned TinkerPop ${metadata.version}: ${metadata.artifacts.length} native development jars verified`);
