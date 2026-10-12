import { describe, it, expect } from 'vitest';
import { JSDOM } from 'jsdom';
import { createGraph } from '../../src/graph';
import { toPlantUML, fromPlantUML, createPlantUMLDocumentConverter } from '../../src/formats/plantuml';
import { getPlantUMLOracle, getPlantUMLOracleVersion } from './plantuml-oracle';
function getRectDistance(x: number, y: number, rectangle: Element): number {
  const left = Number(rectangle.getAttribute('x')), top = Number(rectangle.getAttribute('y')), right = left + Number(rectangle.getAttribute('width')), bottom = top + Number(rectangle.getAttribute('height'));
  return Math.hypot(Math.max(left - x, 0, x - right), Math.max(top - y, 0, y - bottom));
}
function getSVG(source: string): Document { return new JSDOM(source, { contentType: 'image/svg+xml' }).window.document; }
describe('official PlantUML 1.2026.8 isolated Java21 native semantics', () => {
  it('runtime overrides must retain the pinned compiler and Java major', async () => {
    const version = await getPlantUMLOracleVersion(); expect(version.compiler).toContain('PlantUML version 1.2026.8'); expect(version.java).toMatch(/version "21[.\"]/);
    expect([0, 16]).toContain(version.compilerExitCode); if (version.compilerExitCode === 16) expect(version.compiler).toContain('Error: Dot executable does not exist');
  });
  it.each(['component', 'class'] as const)('native %s reader observes qualified aliases, hierarchy, links, labels and stereo', async (dialect) => {
    const graph = createGraph<any, any, any>({ nodes: [{ id: 'group', label: 'Folder' }, { id: 'a', parentId: 'group', label: 'Alpha', data: dialect === 'class' ? { members: ['+x: int', '+f(): void'], stereotypes: 'entity' } : { stereotypes: 'service' }, color: 'red' }, { id: 'b', label: 'Beta' }, { id: 'isolated', label: 'Isolated' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: 'Calls' }] });
    const source = toPlantUML(graph, { dialect }), svg = getSVG(await getPlantUMLOracle(source));
    expect(svg.documentElement.getAttribute('data-diagram-type')).toBe(dialect === 'class' ? 'CLASS' : 'DESCRIPTION');
    const text = [...svg.querySelectorAll('text')].map((node) => node.textContent); expect(text).toContain('Folder'); expect(text).toContain('Alpha'); expect(text).toContain('Beta'); expect(text).toContain('Isolated'); expect(text).toContain('Calls'); if (dialect === 'class') expect(text.some((value) => value?.includes('x: int'))).toBe(true);
    const entities = [...svg.querySelectorAll('g.entity')]; expect(entities).toHaveLength(3); const byName = new Map(entities.map((entity) => [entity.getAttribute('data-qualified-name'), entity.id]));
    expect([...byName.keys()].some((name) => name?.endsWith('g1'))).toBe(true); const link = svg.querySelector('g.link')!; expect(link).not.toBeNull(); expect(link.getAttribute('data-entity-1')).toBe([...byName].find(([name]) => name?.endsWith('g1'))![1]); expect(link.getAttribute('data-entity-2')).toBe(byName.get('g2'));
    const converter = createPlantUMLDocumentConverter({ dialect }), doc = converter.from(source); doc.graph!.nodes[1].label = 'Changed'; const changed = getSVG(await getPlantUMLOracle(converter.to(doc))); expect([...changed.querySelectorAll('text')].map((node) => node.textContent)).toContain('Changed');
  });
  it('native SVG validates literal quotes/backslashes/markup/LF encoding rather than JSON assumptions', async () => {
    const labels = ['Quote " value', 'Path \\ folder', '<b>**literal**</b> &quot;', 'First\nSecond', '雪🙂']; const source = toPlantUML(createGraph({ nodes: labels.map((label, index) => ({ id: `n${index}`, label })) }), { dialect: 'class' });
    const svg = getSVG(await getPlantUMLOracle(source)), text = [...svg.querySelectorAll('text')].map((node) => node.textContent);
    for (const label of labels.filter((label) => !label.includes('\n'))) expect(text).toContain(label); expect(text).toContain('First'); expect(text).toContain('Second');
    const literal = '@startuml\n!pragma layout smetana\nclass "Quote \\" value" as a\n@enduml\n'; const visible = [...getSVG(await getPlantUMLOracle(literal)).querySelectorAll('text')].map((node) => node.textContent); expect(visible).toContain(fromPlantUML(literal).nodes[0].label);
  });
  it.each(['a "1" <-- b', 'a <-- "many" b'])('native SVG preserves one-sided reverse multiplicity and direction: %s', async (link) => {
    const source = `@startuml\n!pragma layout smetana\nclass "A" as a\nclass "B" as b\n${link}\n@enduml\n`, graph = fromPlantUML(source); expect(graph.edges[0].sourceId).toBe('b'); expect(graph.edges[0].targetId).toBe('a');
    const svg = getSVG(await getPlantUMLOracle(source)); const text = [...svg.querySelectorAll('text')].map((node) => node.textContent); expect(text).toContain(link.includes('"1"') ? '1' : 'many'); const polygon = svg.querySelector('g.link polygon')!; expect(polygon).not.toBeNull();
    const [x, y] = polygon.getAttribute('points')!.split(/[, ]/).map(Number), target = svg.querySelector('g.entity[data-qualified-name="a"] rect')!, origin = svg.querySelector('g.entity[data-qualified-name="b"] rect')!; expect(getRectDistance(x, y, target)).toBeLessThan(getRectDistance(x, y, origin));
  });
  it('native class XMI contains actual class/member and relationship model, independent of sidecars', async () => {
    const source = '@startuml\n!pragma layout smetana\nclass "A" as a {\n+x: int\n+f(): void\n}\nclass "B" as b\na --|> b\n@enduml\n';
    const basic = await getPlantUMLOracle(source, 'xmi'); expect(basic).not.toContain('UML:Generalization');
    const xmi = await getPlantUMLOracle(source, 'xmi:star'), xml = new JSDOM(xmi, { contentType: 'text/xml' }).window.document;
    const names = [...xml.querySelectorAll('[name]')].map((node) => node.getAttribute('name')); expect(names).toContain('A'); expect(names).toContain('B'); expect(names.some((name) => name?.includes('x'))).toBe(true);
    expect([...xml.getElementsByTagName('*')].some((node) => node.localName === 'Generalization')).toBe(true); expect(xml.querySelector('parsererror')).toBeNull();
  });
  it('native display does not decode JSON unicode escapes for NUL/lone surrogates; emission rejects them', async () => {
    const source = '@startuml\nclass "NUL \\u0000" as a\nclass "Surrogate \\ud800" as b\n@enduml\n';
    const text = [...getSVG(await getPlantUMLOracle(source)).querySelectorAll('text')].map((node) => node.textContent);
    expect(text).toContain('NUL \\u0000'); expect(text).toContain('Surrogate \\ud800');
    for (const label of ['NUL \0', 'Surrogate \ud800', 'CR\r', 'TAB\t', 'DEL\u007f']) expect(() => toPlantUML(createGraph({ nodes: [{ id: 'a', label }] }))).toThrow('display');
  });
  it('official reader rejects empty quoted class names; emitter rejects before native execution', async () => {
    await expect(getPlantUMLOracle('@startuml\nclass "" as a\n@enduml\n')).rejects.toThrow(); expect(() => toPlantUML(createGraph({ nodes: [{ id: 'a', label: '' }] }), { dialect: 'class' })).toThrow('empty');
  });
  it('native link labels display literal markup, quotes and backslashes before/after strict patches', async () => {
    const quoted = '@startuml\n!pragma layout smetana\ncomponent A\ncomponent B\nA --> B : "Quoted"\n@enduml\n'; expect(fromPlantUML(quoted).edges[0].label).toBe('Quoted');
    const graph = createGraph({ nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: 'Literal **bold** " \\ &amp;' }] });
    const source = toPlantUML(graph), text = [...getSVG(await getPlantUMLOracle(source)).querySelectorAll('text')].map((node) => node.textContent); expect(text).toContain(graph.edges[0].label);
    const converter = createPlantUMLDocumentConverter(), doc = converter.from(source); doc.graph!.edges[0].label = '<b>literal</b> ~link';
    expect([...getSVG(await getPlantUMLOracle(converter.to(doc))).querySelectorAll('text')].map((node) => node.textContent)).toContain(doc.graph!.edges[0].label);
  });

});
