import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { validateXML, type XMLValidationResult } from 'xmllint-wasm';

interface SchemaManifest { entry: string; files: Array<{ file: string; sha256: string; resolverRewrites: Array<{ from: string; to: string }> }> }

/** Real libxml2 XSD validation; every imported/redefined schema is vendored and hash checked. */
export async function getXMLValidation(source: string, profile: 'graphml/1.0' | 'gexf/1.3' | 'gexf/1.2draft' | 'drawio'): Promise<XMLValidationResult> {
  const directory = new URL(`./fixtures/${profile}/`, import.meta.url);
  const manifest = JSON.parse(readFileSync(new URL('provenance.json', directory), 'utf8')) as SchemaManifest;
  const schemas = manifest.files.map((file) => {
    const bytes = readFileSync(fileURLToPath(new URL(file.file, directory)));
    if (createHash('sha256').update(bytes).digest('hex') !== file.sha256) throw new Error(`Native schema provenance changed: ${profile}/${file.file}`);
    let contents = bytes.toString('utf8');
    for (const rewrite of file.resolverRewrites) contents = contents.split(`schemaLocation="${rewrite.from}"`).join(`schemaLocation="${rewrite.to}"`);
    return { fileName: file.file, contents };
  }).filter((file) => file.fileName.endsWith('.xsd'));
  const entry = schemas.find((schema) => schema.fileName === manifest.entry);
  if (!entry) throw new Error(`Missing native schema entry: ${profile}`);
  return validateXML({ xml: { fileName: 'fixture.xml', contents: source }, schema: entry,
    preload: schemas.filter((schema) => schema !== entry), modifyArguments: (args) => ['--nonet', ...args] });
}
