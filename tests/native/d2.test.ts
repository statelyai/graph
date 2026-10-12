import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import corpus from './fixtures/d2-profiles.json';
import packageJSON from '../../package.json';
import { d2Converter, d2DocumentConverter } from '../../src/formats/d2';

interface NativeD2Diagram { shapes: Array<{ id: string; label: string; type: string; fill: string; columns?: Array<{ name: { label: string }; type: { label: string }; constraint?: string[] }> }>; connections: Array<{ src: string; dst: string; label: string; srcArrow: string; dstArrow: string }> }
type NativeD2Result = { ok: true; diagram: NativeD2Diagram; graphEdges: Array<{ srcTableColumnIndex?: number; dstTableColumnIndex?: number }> } | { ok: false; error: string };
function getNativeD2Results(sources: string[]): NativeD2Result[] {
  const child = spawnSync(process.execPath, [resolve('scripts/native/d2-compile.mjs')], { input: JSON.stringify(sources), encoding: 'utf8', timeout: 25_000, maxBuffer: 10 * 1024 * 1024 });
  if (child.error || child.status !== 0) throw new Error(`D2 compiler subprocess failed: ${child.error?.message ?? child.stderr}`);
  return JSON.parse(child.stdout);
}

describe(`native D2 ${corpus.oracle}`, () => {
  it('uses the exact oracle version recorded by the fixture corpus', () => {
    expect(corpus.oracle).toBe(`@terrastruct/d2@${packageJSON.devDependencies['@terrastruct/d2']}`);
  });

  it('compiles all external and emitted profiles with the portable native compiler', () => {
    const emitted = corpus.fixtures.map((fixture) => d2Converter.to(d2Converter.from(fixture.source)));
    const results = getNativeD2Results([...corpus.fixtures.map((fixture) => fixture.source), ...emitted]);
    expect(results).toHaveLength(corpus.fixtures.length * 2);
    for (let index = 0; index < results.length; index++) {
      expect(results[index], `${corpus.fixtures[index % corpus.fixtures.length].name}: ${index < corpus.fixtures.length ? 'external' : 'emitted'}`).toMatchObject({ ok: true });
    }
    const escaped = results[corpus.fixtures.length] as Extract<NativeD2Result, { ok: true }>;
    expect(escaped.diagram.shapes.map((shape) => shape.label)).toContain('東京 "quoted" path\\');
    expect(escaped.diagram.shapes.map((shape) => shape.label)).toContain('Alone');
    expect(escaped.diagram.connections).toHaveLength(1);
    const arrows = results[corpus.fixtures.length + 2] as Extract<NativeD2Result, { ok: true }>;
    expect(arrows.diagram.connections.map((edge) => [edge.srcArrow, edge.dstArrow])).toEqual([['diamond', 'triangle'], ['none', 'none'], ['none', 'triangle']]);
    const ports = results[corpus.fixtures.length + 1] as Extract<NativeD2Result, { ok: true }>;
    expect(ports.diagram.shapes.find((shape) => shape.id === 'db')).toMatchObject({ type: 'sql_table', columns: [{ name: { label: 'id' }, type: { label: 'int' }, constraint: ['primary_key'] }, { name: { label: 'name' }, type: { label: 'string' } }] });
    expect(ports.graphEdges[0].dstTableColumnIndex).toBe(0);
    const scoped = results[corpus.fixtures.length + 3] as Extract<NativeD2Result, { ok: true }>;
    expect(scoped.diagram.shapes.map((shape) => shape.id)).toEqual(['outer', 'outer.a', 'outer.nested', 'outer.nested.c']);
    expect(scoped.diagram.connections).toMatchObject([{ src: 'outer.nested.c', dst: 'outer.a' }]);
    const substitution = results[corpus.fixtures.length + 4] as Extract<NativeD2Result, { ok: true }>;
    expect(substitution.diagram.shapes).toMatchObject([{ id: 'a', label: 'Styled', fill: 'blue' }]);

  });

  it('compiles source-preserving edited labels with comments and JSON persistence', () => {
    const source = '# retained\r\na: "Before" # trailing\r\na -> b\r\n';
    const document = d2DocumentConverter.from(source);
    expect(d2DocumentConverter.to(JSON.parse(JSON.stringify(document)))).toBe(source);
    document.graph!.nodes[0].label = 'After 東京 "quote" \\';
    const patched = d2DocumentConverter.to(document);
    expect(patched).toContain('# trailing');
    const [result] = getNativeD2Results([patched]);
    expect(result).toMatchObject({ ok: true });
    if (result.ok) expect(result.diagram.shapes[0].label).toBe(document.graph!.nodes[0].label);
  });


  it('compiles a larger chain and bounded deeply scoped identity profile', () => {
    const chain = Array.from({ length: 60 }, (_, index) => `n${index}: Node 東京 ${index}\n${index < 59 ? `n${index} -> n${index + 1}` : ''}`).join('\n');
    const deep = `${Array.from({ length: 20 }, (_, index) => `${'  '.repeat(index)}level${index}: {`).join('\n')}\n${'  '.repeat(20)}leaf: Deep 東京\n${Array.from({ length: 20 }, (_, index) => `${'  '.repeat(19 - index)}}`).join('\n')}`;
    const [chainResult, deepResult] = getNativeD2Results([d2Converter.to(d2Converter.from(chain)), d2Converter.to(d2Converter.from(deep))]);
    expect(chainResult).toMatchObject({ ok: true });
    expect(deepResult).toMatchObject({ ok: true });
    if (chainResult.ok) { expect(chainResult.diagram.shapes).toHaveLength(60); expect(chainResult.diagram.connections).toHaveLength(59); }
    if (deepResult.ok) expect(deepResult.diagram.shapes.find((shape) => shape.label === 'Deep 東京')?.id).toBe(`${Array.from({ length: 20 }, (_, index) => `level${index}`).join('.')}.leaf`);
  });

  it('native compiler rejects malformed source within a bounded subprocess', () => {
    const [result] = getNativeD2Results(['a: {\nshape: definitely-not-a-shape']);
    expect(result).toMatchObject({ ok: false, error: expect.any(String) });
  });
});
it('native D2 retains NUL and astral labels but replaces lone surrogates; adapters reject that wire loss', () => {
 const invalid = 'a: "A\ud800B"';
 const valid = d2Converter.from('a: "A\u0000B 😀"');
 const results = getNativeD2Results([invalid, d2Converter.to(valid)]);
 expect(results[0]).toMatchObject({ ok: true });
 if (results[0].ok) expect(results[0].diagram.shapes[0].label).toBe('A\ufffdB');
 expect(results[1]).toMatchObject({ ok: true });
 if (results[1].ok) expect(results[1].diagram.shapes[0].label).toBe('A\u0000B 😀');
 expect(() => d2Converter.from(invalid)).toThrow('Unicode scalar');
 valid.nodes[0].label = 'A\ud800B'; expect(() => d2Converter.to(valid)).toThrow('Unicode scalar');
 const document = d2DocumentConverter.from('# comment\na: "Before"\n');
 document.graph!.nodes[0].label = 'A\ud800B'; expect(() => d2DocumentConverter.to(document)).toThrow('Unicode scalar');
 const unsupported = d2DocumentConverter.from(invalid); expect(unsupported.graph).toBeNull(); expect(d2DocumentConverter.to(unsupported)).toBe(invalid);
});
