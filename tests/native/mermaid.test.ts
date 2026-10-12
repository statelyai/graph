// @vitest-environment jsdom
import { readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import mermaid from 'mermaid';
import corpus from './fixtures/mermaid-profiles.json';
import packageJSON from '../../package.json';
import { mermaidFlowchartConverter, mermaidSequenceConverter, mermaidStateConverter, mermaidClassConverter, mermaidERConverter, mermaidBlockConverter, mermaidMindmapConverter, mermaidIshikawaConverter, mermaidFlowchartDocumentConverter } from '../../src/formats/mermaid';
import type { GraphFormatConverter } from '../../src/types';

const converters: Record<string, GraphFormatConverter<string>> = {
  flowchart: mermaidFlowchartConverter, sequence: mermaidSequenceConverter, state: mermaidStateConverter,
  class: mermaidClassConverter, er: mermaidERConverter, block: mermaidBlockConverter,
  mindmap: mermaidMindmapConverter, ishikawa: mermaidIshikawaConverter,
};
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });

async function getNativeMermaidDecodedText(text: string): Promise<string> {
  // Use the pinned native bundle's own entity decoder, then browser HTML decoding.
  const require = createRequire(import.meta.url);
  const directory = join(dirname(require.resolve('mermaid')), 'chunks/mermaid.core');
  const matches = readdirSync(directory).filter((file) => file.endsWith('.mjs') && readFileSync(join(directory, file), 'utf8').includes('var decodeEntities ='));
  if (matches.length !== 1) throw new Error('Pinned Mermaid entity decoder changed; review the oracle integration');
  const native = await import(pathToFileURL(join(directory, matches[0])).href);
  const element = document.createElement('textarea');
  element.innerHTML = native.decodeEntities(text);
  return element.value;
}


describe(`native Mermaid ${corpus.oracle}`, () => {
  it('uses the exact oracle version recorded by the fixture corpus', () => {
    expect(corpus.oracle).toBe(`mermaid@${packageJSON.devDependencies['mermaid']}`);
  });

  it.each(corpus.fixtures)('$format validates independently authored and emitted profile syntax', async (fixture) => {
    expect(await mermaid.parse(fixture.source)).toHaveProperty('diagramType');
    const graph = converters[fixture.format].from(fixture.source);
    expect(graph.nodes.length).toBeGreaterThan(0);
    const emitted = converters[fixture.format].to(graph);
    expect(await mermaid.parse(emitted)).toHaveProperty('diagramType');
  });


  it.each(corpus.fixtures)('$format preserves selected native database semantics after emit', async (fixture) => {
    const emitted = converters[fixture.format].to(converters[fixture.format].from(fixture.source));
    // Pinned native parser databases are the independent semantic oracle.
    const db = (await mermaid.mermaidAPI.getDiagramFromText(emitted)).db as any;
    switch (fixture.format) {
      case 'flowchart':
        expect(db.getVertices().get('A').text).toBe('Start 東京');
        expect(db.getVertices().get('C').type).toBe('cloud');
        expect(db.getVertices().get('Isolated').text).toBe('No edges');
        expect(db.getEdges().map((edge: any) => [edge.start, edge.end, edge.stroke])).toEqual([['A', 'B', 'normal'], ['B', 'C', 'dotted']]);
        break;
      case 'sequence':
        expect([...db.getActors()].map(([id, actor]: any) => [id, actor.description, actor.type])).toEqual([['A', 'Client', 'participant'], ['B', 'Store', 'database']]);
        expect(db.getMessages().map((message: any) => [message.type, message.from, message.to, message.message])).toEqual([
          [26, undefined, undefined, { start: 10, step: 5, visible: true }],
          [0, 'A', 'B', 'Save 東京'], [2, 'A', 'B', 'Keep this note'], [1, 'B', 'A', 'Saved'],
        ]);
        break;
      case 'class':
        expect(db.getClasses().get('Customer').parent).toBe('Domain');
        expect(db.getClasses().get('Customer').members.map((member: any) => [member.id, member.visibility])).toEqual([['String name', '+']]);
        expect(db.getClasses().get('Customer').methods.map((method: any) => [method.id, method.visibility])).toEqual([['save', '+']]);
        expect(db.getRelations()).toMatchObject([{ id1: 'Customer', id2: 'Order', relationTitle1: '1', relationTitle2: 'many', title: 'places' }]);
        break;
      case 'er':
        expect([...db.getEntities().keys()]).toEqual(['CUSTOMER', 'ORDER', 'ISOLATED']);
        expect(db.getEntities().get('CUSTOMER').attributes).toEqual([{ type: 'string', name: 'id', keys: ['PK', 'UK'], comment: 'Identity' }, { type: 'string', name: 'name', keys: [], comment: '' }]);
        expect(db.getRelationships()).toMatchObject([{ roleA: 'places', relSpec: { cardA: 'ZERO_OR_MORE', cardB: 'ONLY_ONE', relType: 'IDENTIFYING' } }]);
        break;
      case 'state':
        expect(db.getStates().get('Idle').descriptions).toEqual(['Idle 東京']);
        expect(db.getRelations()).toContainEqual(expect.objectContaining({ id1: 'Idle', id2: 'Running', relationTitle: 'start' }));
        expect(db.getRootDocV2().doc.find((entry: any) => entry.id === 'Group').doc).toContainEqual(expect.objectContaining({ stmt: 'relation', description: 'nested', state1: expect.objectContaining({ id: 'Inner1' }), state2: expect.objectContaining({ id: 'Inner2' }) }));
        break;
      case 'block':
        expect(db.getColumns('root')).toBe(3);
        expect(db.getColumns('group')).toBe(2);
        expect(db.getBlock('B')).toMatchObject({ label: 'Second block', type: 'circle' });
        expect(db.getBlock('D')).toMatchObject({ label: 'Nested one' });
        expect(db.getEdges()).toMatchObject([{ start: 'A', end: 'B' }]);
        break;
      case 'mindmap':
        expect(db.getMindmap()).toMatchObject({ nodeId: 'root', descr: 'Root 東京', type: 3, children: [{ nodeId: 'a', descr: 'First child', type: 2, children: [{ descr: 'Deep child' }] }, { nodeId: 'b', descr: 'Second child', type: 1 }] });
        break;
      case 'ishikawa':
        expect(db.getRoot()).toEqual({ text: 'Effect 東京', children: [{ text: 'People', children: [{ text: 'Training', children: [] }] }, { text: 'Process', children: [{ text: 'Review', children: [] }] }] });
        break;
    }
  });
  it('native flow database retains labels, parallel edges and isolated nodes', async () => {
    const source = 'flowchart LR\nA["東京 #quot;quoted#quot;"]\nB[Target]\nIsolated[Alone]\nA --> B\nA -.-> B\n';
    const emitted = mermaidFlowchartConverter.to(mermaidFlowchartConverter.from(source));
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(emitted);
    const db = diagram.db as { getVertices(): Map<string, { text: string }>; getEdges(): Array<{ start: string; end: string; stroke: string }> };
    expect(db.getVertices().size).toBe(3);
    expect(db.getVertices().get('A')?.text).toContain('東京');
    expect(db.getEdges().map((edge) => [edge.start, edge.end])).toEqual([['A', 'B'], ['A', 'B']]);
    expect(db.getEdges()[1].stroke).toBe('dotted');
  });

  it('native parser validates edited document output while no-op preserves unsupported annotations exactly', async () => {
    const source = '---\ntitle: Native\n---\n%% retained\nflowchart TD\nA[Before]\n%% trailing\n';
    expect(await mermaid.parse(source)).toHaveProperty('diagramType');
    const document = mermaidFlowchartDocumentConverter.from(source);
    expect(mermaidFlowchartDocumentConverter.to(JSON.parse(JSON.stringify(document)))).toBe(source);
    document.graph!.nodes[0].label = 'After 東京 "quoted" \\';
    const patched = mermaidFlowchartDocumentConverter.to(document);
    expect(patched).toContain('%% trailing');
    expect(await mermaid.parse(patched)).toHaveProperty('diagramType');
  });


  it('native entity decoding preserves exact Unicode, quotes and literal backslash counts', async () => {
    const label = '東京 "quoted" \\ \\\\ # ; | < >';
    const source = 'flowchart TD\nA[Before]';
    const graph = mermaidFlowchartConverter.from(source);
    graph.nodes[0].label = label;
    const diagram = await mermaid.mermaidAPI.getDiagramFromText(mermaidFlowchartConverter.to(graph));
    const db = diagram.db as { getVertices(): Map<string, { text: string }> };
    expect(await getNativeMermaidDecodedText(db.getVertices().get('A')!.text)).toBe(label);
  });


  it('preserves native literal backslashes without interpreting them as a private escape convention', async () => {
    const source = 'flowchart TD\nA["Path\\\\"]';
    const native = await mermaid.mermaidAPI.getDiagramFromText(source);
    const before = await getNativeMermaidDecodedText((native.db as any).getVertices().get('A').text);
    const graph = mermaidFlowchartConverter.from(source);
    expect(graph.nodes[0].label).toBe(before);
    const emitted = await mermaid.mermaidAPI.getDiagramFromText(mermaidFlowchartConverter.to(graph));
    expect(await getNativeMermaidDecodedText((emitted.db as any).getVertices().get('A').text)).toBe(before);
  });

  it('keeps adjacent native block labels ending in literal backslashes distinct', async () => {
    const source = 'block-beta\nA["Path\\"] B["Second"]';
    const before = (await mermaid.mermaidAPI.getDiagramFromText(source)).db as any;
    expect(before.getBlocks()).toHaveLength(2);
    const graph = mermaidBlockConverter.from(source);
    expect(graph.nodes.map((node) => node.label)).toEqual(before.getBlocks().map((block: any) => block.label));
    const after = (await mermaid.mermaidAPI.getDiagramFromText(mermaidBlockConverter.to(graph))).db as any;
    expect(await getNativeMermaidDecodedText(after.getBlock('A').label)).toBe('Path\\');
    expect(after.getBlock('B').label).toBe('Second');
  });
  it('native parser handles a larger chain and bounded deeply nested tree profile', async () => {
    const chain = `flowchart LR\n${Array.from({ length: 250 }, (_, index) => `n${index} --> n${index + 1}`).join('\n')}`;
    const flow = await mermaid.mermaidAPI.getDiagramFromText(mermaidFlowchartConverter.to(mermaidFlowchartConverter.from(chain)));
    expect((flow.db as any).getVertices().size).toBe(251);
    expect((flow.db as any).getEdges()).toHaveLength(250);
    const tree = `mindmap\n${Array.from({ length: 50 }, (_, index) => `${'  '.repeat(index + 1)}Level ${index}`).join('\n')}`;
    const native = await mermaid.mermaidAPI.getDiagramFromText(mermaidMindmapConverter.to(mermaidMindmapConverter.from(tree)));
    let node = (native.db as any).getMindmap();
    let count = 0;
    while (node) { count++; node = node.children[0]; }
    expect(count).toBe(50);
  });
  it('the oracle rejects malformed syntax rather than accepting the converter output blindly', async () => {
    await expect(mermaid.parse('flowchart TD\nA[unterminated')).rejects.toThrow();
    await expect(mermaid.parse('sequenceDiagram\nA->>')).rejects.toThrow();
  });
});
