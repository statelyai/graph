import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getXMLValidation } from './xml-oracle';

describe('draw.io published schema preparation; native model semantics remain separate', () => {
  it('validates the byte-pinned authored multipage model using the published unmodified XSD', async () => {
    const directory = new URL('./fixtures/drawio/', import.meta.url);
    const manifest = JSON.parse(readFileSync(new URL('provenance.json', directory), 'utf8'));
    for (const file of [...manifest.files, ...manifest.fixtures]) expect(createHash('sha256').update(readFileSync(new URL(file.file, directory))).digest('hex')).toBe(file.sha256);
    const source = readFileSync(new URL('pages-uncompressed.drawio', directory), 'utf8');
    const result = await getXMLValidation(source, 'drawio');
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });
  it('rejects unsupported geometry children in the actual schema', async () => {
    const source = '<mxfile><diagram id="p"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><mxCell id="a" vertex="1" parent="1"><mxGeometry as="geometry"><unknown/></mxGeometry></mxCell></root></mxGraphModel></diagram></mxfile>';
    expect((await getXMLValidation(source, 'drawio')).valid).toBe(false);
  });
  it('records the published XSD compressed-page limitation without changing its definitions', async () => {
    const source = readFileSync(new URL('./fixtures/drawio/pages-compressed.drawio', import.meta.url), 'utf8');
    const result = await getXMLValidation(source, 'drawio');
    expect(result.valid).toBe(false);
    expect(result.rawOutput).toContain('Character content other than whitespace is not allowed');
    expect(result.rawOutput).toContain('Expected is ( mxGraphModel )');
  });
});
