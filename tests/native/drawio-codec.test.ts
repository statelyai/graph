// @vitest-environment jsdom
import { createGraph } from '../../src/graph';
import { toDrawio, createDrawioDocumentConverter } from '../../src/formats/drawio';
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { getDrawioNativeSummary } from './drawio-oracle';

describe('actual maxgraph0.25 mxGraph/draw.io model import compatibility', () => {
  it('uses the exact pinned codec and reproduces captured native models', () => {
    expect(JSON.parse(readFileSync(resolve('node_modules/@maxgraph/core/package.json'), 'utf8')).version).toBe('0.25.0');
    for (const page of ['first', 'second']) {
      const native = getDrawioNativeSummary(readFileSync(resolve(`tests/native/fixtures/drawio/page-${page}.mxgraph.xml`), 'utf8'));
      const captured = JSON.parse(readFileSync(resolve(`tests/native/fixtures/drawio/page-${page}.maxgraph.json`), 'utf8'));
      expect(JSON.parse(JSON.stringify(native))).toEqual(captured.summary);
    }
  });
  it('imports layers, grouped geometry, UserObject/raw HTML, style, topology and relative edge label geometry', () => {
    const model = readFileSync(resolve('tests/native/fixtures/drawio/page-first.mxgraph.xml'), 'utf8');
    const native = getDrawioNativeSummary(model);
    expect(native).toHaveLength(7);
    expect(native.find((cell) => cell.id === 'a')).toMatchObject({ parent: 'group', vertex: 1, edge: false,
      value: { element: 'UserObject', attributes: { label: '<b>Alpha &amp; α</b>', vendor: 'KEEP', count: '007' } },
      geometry: { x: 20, y: 30, width: 120, height: 60, relative: false }, style: { rounded: 1, html: 1, fillColor: '#dae8fc' } });
    expect(native.find((cell) => cell.id === 'b')).toMatchObject({ parent: 'layer-extra', value: '', geometry: { x: 500, y: 80 } });
    expect(native.find((cell) => cell.id === 'edge')).toMatchObject({ edge: 1, source: 'a', target: 'b', parent: '1',
      geometry: { x: 0.5, y: -12, relative: 1, offset: { x: 3, y: 4 }, points: [{ x: 250, y: 140 }, { x: 400, y: 140 }] }, style: { endArrow: 'none' } });
  });
  it('independently inflates compressed pages and imports each page through the native codec', () => {
    const source = readFileSync(resolve('tests/native/fixtures/drawio/pages-compressed.drawio'), 'utf8');
    const document = new DOMParser().parseFromString(source, 'application/xml');
    for (const page of document.querySelectorAll('diagram')) {
      const inflated = decodeURIComponent(inflateRawSync(Buffer.from(page.textContent!, 'base64')).toString('utf8'));
      const expected = readFileSync(resolve(`tests/native/fixtures/drawio/page-${page.id}.mxgraph.xml`), 'utf8');
      expect(inflated).toBe(expected);
      expect(getDrawioNativeSummary(inflated)).toEqual(getDrawioNativeSummary(expected));
    }
    expect(document.querySelectorAll('diagram')).toHaveLength(2);
  });
});

it('imports fresh emitted UserObject carriers, hierarchy and native endpoints in the real codec', () => {
  const source = toDrawio(createGraph({ nodes: [{ id: 'a', label: 'A', x: 10, y: 20, width: 30, height: 40 }, { id: 'b', parentId: 'a', label: '' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', points: [{ x: 50, y: 60 }] }] }));
  const model = new DOMParser().parseFromString(source, 'application/xml').querySelector('mxGraphModel')!;
  const native = getDrawioNativeSummary(new XMLSerializer().serializeToString(model));
  const a = native.find((cell) => cell.value?.attributes?.label === 'A')!, b = native.find((cell) => cell.value?.attributes?.label === '')!;
  expect(a.geometry).toMatchObject({ x: 10, y: 20, width: 30, height: 40 }); expect(b.parent).toBe(a.id);
  expect(native.find((cell) => cell.edge)).toMatchObject({ source: a.id, target: b.id, geometry: { points: [{ x: 50, y: 60 }] } });
});
it('imports a changed compressed selected page through independent inflate and the real codec', () => {
  const source = readFileSync(resolve('tests/native/fixtures/drawio/pages-compressed.drawio'), 'utf8'), converter = createDrawioDocumentConverter({ pageId: 'first' }), document = converter.from(source);
  document.graph!.nodes.find((node) => node.id === 'b')!.label = 'CHANGED';
  const output = converter.to(document), page = new DOMParser().parseFromString(output, 'application/xml').querySelector('diagram[id="first"]')!;
  const model = decodeURIComponent(inflateRawSync(Buffer.from(page.textContent!, 'base64')).toString('utf8'));
  expect(getDrawioNativeSummary(model).find((cell) => cell.id === 'b')!.value).toBe('CHANGED');
});
