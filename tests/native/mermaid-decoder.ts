import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
/** Pinned Mermaid native decoding, followed by its browser text interpretation. */
export async function getNativeMermaidText(text: string): Promise<string> {
 const require = createRequire(import.meta.url);
 const directory = join(dirname(require.resolve('mermaid')), 'chunks/mermaid.core');
 const matches = readdirSync(directory).filter((file) => file.endsWith('.mjs') && readFileSync(join(directory, file), 'utf8').includes('var decodeEntities ='));
 if (matches.length !== 1) throw new Error('Pinned Mermaid entity decoder changed; review oracle');
 const native = await import(pathToFileURL(join(directory, matches[0])).href);
 const element = document.createElement('textarea'); element.innerHTML = native.decodeEntities(text); return element.value;
}
