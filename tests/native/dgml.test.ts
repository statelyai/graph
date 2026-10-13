import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { validateXML } from 'xmllint-wasm';
import {
  fromDGML,
  toDGML,
  dgmlDocumentConverter,
} from '../../src/formats/dgml';
import { createGraph } from '../../src/graph';
import provenance from './fixtures/dgml/provenance.json';
const bytes = readFileSync(
  new URL('./fixtures/dgml/dgml.xsd', import.meta.url)
);
async function getValidation(source: string) {
  expect(createHash('sha256').update(bytes).digest('hex')).toBe(
    provenance.sha256
  );
  return validateXML({
    xml: { fileName: 'profile.dgml', contents: source },
    schema: { fileName: 'dgml.xsd', contents: bytes.toString('utf8') },
    modifyArguments: (args) => ['--nonet', ...args],
  });
}
it('official schema accepts native groups/multicategories/implicit endpoints and emitted directed topology', async () => {
  const source =
    '<DirectedGraph xmlns="http://schemas.microsoft.com/vs/2009/dgml"><Nodes><Node Id="g" Group="Expanded"/><Node Id="a" Label="A" Category="Thing"><Category Ref="Other"/></Node></Nodes><Links><Link Source="g" Target="a" Category="Contains"/><Link Source="a" Target="implicit"/><Link Source="a" Target="a" Label="Loop"/></Links><Categories><Category Id="Thing"/><Category Id="Other"/></Categories></DirectedGraph>';
  expect((await getValidation(source)).valid).toBe(true);
  const graph = fromDGML(source);
  expect(graph.nodes.map((n) => [n.id, n.parentId])).toEqual([
    ['g', null],
    ['a', 'g'],
    ['implicit', null],
  ]);
  expect(graph.nodes[1].data.categories).toEqual(['Thing', 'Other']);
  const fresh = createGraph({
    nodes: [
      { id: 'a', label: '東京 " \\ &\r\n' },
      { id: 'b', label: '' },
    ],
    edges: [
      { id: 'dgml_link_0', sourceId: 'a', targetId: 'b', label: 'Go' },
      { id: 'dgml_link_1', sourceId: 'a', targetId: 'b', label: 'Parallel' },
      { id: 'dgml_link_2', sourceId: 'b', targetId: 'b', label: 'Loop' },
    ],
  });
  const emitted = toDGML(fresh);
  expect((await getValidation(emitted)).valid).toBe(true);
  expect(fromDGML(emitted).nodes[0].label).toBe(fresh.nodes[0].label);
  expect(fromDGML(emitted).edges.map((e) => e.id)).toEqual(
    fresh.edges.map((e) => e.id)
  );
});
it('schema validates literal text-span edits with untouched comments and namespaces', async () => {
  const source =
    '<?xml version="1.0"?><d:DirectedGraph xmlns:d="http://schemas.microsoft.com/vs/2009/dgml"><!-- comment --><d:Nodes><d:Node Id="a" Label="Before"/></d:Nodes></d:DirectedGraph>';
  const doc = dgmlDocumentConverter.from(source);
  doc.graph!.nodes[0].label = 'After 東京 " &\r\n';
  const patched = dgmlDocumentConverter.to(doc);
  expect(patched).toContain('<!-- comment -->');
  expect((await getValidation(patched)).valid).toBe(true);
  expect(fromDGML(patched).nodes[0].label).toBe(doc.graph!.nodes[0].label);
});
it('characterizes published schema custom-property gap without claiming renderer proof', async () => {
  const source =
    '<DirectedGraph xmlns="http://schemas.microsoft.com/vs/2009/dgml"><Nodes><Node Id="a" Count="2"/></Nodes><Properties><Property Id="Count" DataType="System.Int32"/></Properties></DirectedGraph>';
  const result = await getValidation(source);
  expect(result.valid).toBe(false);
  expect(result.rawOutput).toContain('Count');
  expect(fromDGML(source).nodes[0].data.properties).toEqual({ Count: 2 });
});
it('official schema rejects malformed Group values independently', async () => {
  expect(
    (
      await getValidation(
        '<DirectedGraph xmlns="http://schemas.microsoft.com/vs/2009/dgml"><Nodes><Node Id="a" Group="Unknown"/></Nodes></DirectedGraph>'
      )
    ).valid
  ).toBe(false);
});

it('native DOM XML decoding agrees on attribute whitespace and character references', async () => {
  const source =
    '<DirectedGraph xmlns="http://schemas.microsoft.com/vs/2009/dgml"><Nodes><Node Id="a" Label="A\r\nB\tC&#10;D&#13;E"/></Nodes></DirectedGraph>';
  expect((await getValidation(source)).valid).toBe(true);
  const { JSDOM } = await import('jsdom');
  const { window } = new JSDOM();
  const native = new window.DOMParser().parseFromString(source, 'application/xml');
  expect(native.querySelector('parsererror')).toBeNull();
  expect(fromDGML(source).nodes[0].label).toBe(
    native.getElementsByTagName('Node')[0].getAttribute('Label')
  );
  expect(fromDGML(source).nodes[0].label).toBe('A B C\nD\rE');
  window.close();
});
