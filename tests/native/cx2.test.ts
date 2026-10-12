import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import {
  fromCX2,
  toCX2,
  cx2DocumentConverter,
  type CX2JSON,
} from '../../src/formats/cx2';
import fixture from './fixtures/cx2/profile.json';
import provenance from './fixtures/cx2/provenance.json';
import { getCX2Oracle } from './cx2-oracle';
it('independent maintained NDEx reader preserves selected aliases/defaults/typed topology', () => {
  expect(
    createHash('sha256')
      .update(
        readFileSync(new URL('./fixtures/cx2/profile.json', import.meta.url))
      )
      .digest('hex')
  ).toBe(provenance.sha256);
  const source = fixture as CX2JSON,
    native = getCX2Oracle(source),
    graph = fromCX2(source);
  expect(native.version).toBe('3.12.0');
  expect(native.nodes[0].v).toEqual({
    score: 2.5,
    name: '東京 "quoted" \\',
    alias: ['A', 'B'],
  });
  expect(native.edges.map((e) => [e.id, e.s, e.t])).toEqual([
    [2, 0, 1],
    [3, 0, 1],
    [4, 1, 1],
  ]);
  expect(graph.nodes[0].label).toBe(native.nodes[0].v.name);
  expect(graph.nodes[0].data.attributes).toEqual({
    score: 2.5,
    alias: ['A', 'B'],
  });
  expect(getCX2Oracle(toCX2(graph))).toEqual(native);
});
it('fresh emitted values and strict document label/attribute edits reach the native reader', () => {
  const source = fixture as CX2JSON;
  const regenerated = toCX2(cx2DocumentConverter.from(source).graph!, { nativeCarrier: false });
  expect(getCX2Oracle(regenerated).nodes[0].v).toEqual(
    getCX2Oracle(source).nodes[0].v
  );
  const doc = cx2DocumentConverter.from(source);
  doc.graph!.nodes[0].label = 'Changed 東京';
  doc.graph!.nodes[0].data.attributes!.score = 8;
  const output = cx2DocumentConverter.to(doc),
    native = getCX2Oracle(output);
  expect(native.nodes[0].v).toMatchObject({ name: 'Changed 東京', score: 8 });
  expect(output[5]).toEqual(source[5]);
});
it('records NDEx3.12 false/zero-default omission as upstream-negative controls', () => {
  const source: CX2JSON = [
    { CXVersion: '2.0' },
    {
      attributeDeclarations: [
        {
          nodes: {
            active: { d: 'boolean', v: false },
            score: { d: 'double', v: 0 },
          },
        },
      ],
    },
    { nodes: [{ id: 1 }] },
    { status: [{ success: true }] },
  ];
  expect(getCX2Oracle(source).nodes[0].v).toEqual({});
  expect(fromCX2(source).nodes[0].data.attributes).toEqual({
    active: false,
    score: 0,
  });
});
it('records native-reader null omission without claiming null interpretation', () => {
  const source: CX2JSON = [
    { CXVersion: '2.0' },
    { attributeDeclarations: [{ nodes: { score: { d: 'double' } } }] },
    { nodes: [{ id: 1, v: { score: null } }] },
    { status: [{ success: true }] },
  ];
  expect(getCX2Oracle(source).nodes[0].v).toEqual({});
  const document = cx2DocumentConverter.from(source);
  expect(document.graph).toBeNull();
  expect(cx2DocumentConverter.to(document)).toEqual(source);
});
