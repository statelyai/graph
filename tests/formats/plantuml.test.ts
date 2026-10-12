import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src/graph';
import { toPlantUML, fromPlantUML, plantumlDocumentConverter, createPlantUMLDocumentConverter } from '../../src/formats/plantuml';
import { getNativeDocumentGraph } from '../../src/formats/preservation';
function getPersisted<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
describe('PlantUML component/class profile', () => {
  it.each(['component', 'class'] as const)('full Graph JSON, members/styles/stereotypes/modes/hierarchy in %s with explicit carrier', (dialect) => {
    const graph = createGraph<any, any, any>({ id: 'uml', direction: 'right', data: [null, 'root'], nodes: [{ id: 'package', label: 'Group', data: null }, { id: '__proto__', parentId: 'package', label: 'Quote " path \\ 雪', data: dialect === 'class' ? { members: ['+name: String', '+f(): void'], stereotypes: 'entity', arbitrary: true } : { stereotypes: 'service' }, color: 'red' }, { id: 'constructor', label: null, data: 42 }], edges: [{ id: 'forward', sourceId: '__proto__', targetId: 'constructor', label: 'Calls', data: ['edge'] }, { id: 'both', sourceId: 'constructor', targetId: 'constructor', mode: 'bidirectional', weight: 0 }, { id: 'undirected', sourceId: 'constructor', targetId: '__proto__', mode: 'undirected', label: '' }] });
    const source = toPlantUML(graph, { dialect }); const restored = getNativeDocumentGraph(fromPlantUML(source), 'plantuml', source); expect(getPersisted(restored)).toEqual(getPersisted(graph));
    const converter = createPlantUMLDocumentConverter({ dialect }), doc = getPersisted(converter.from(source)); expect(converter.to(doc)).toBe(source); doc.graph!.nodes[1].label = 'Changed'; doc.graph!.edges[0].label = 'Changed link';
    const result = converter.to(doc); expect(fromPlantUML(result).nodes[1].label).toBe('Changed'); expect(fromPlantUML(result).edges[0].label).toBe('Changed link');
  });
  it('class native source preserves members, stereotypes, multiplicities, style, comments and CRLF while labels patch', () => {
    const source = '@startuml\r\n!pragma layout smetana\r\nskinparam class {\r\n BackgroundColor white\r\n}\r\n\' comment\r\npackage "Folder" as p {\r\nclass\t"A" as a <<entity>> #red {\r\n +x: int\r\n \' member comment\r\n +f(): void\r\n}\r\n}\r\nclass "B" as b\r\na "1" --|> "many" b : extends \' keep trailing\r\n@enduml\r\n';
    const converter = createPlantUMLDocumentConverter({ dialect: 'class' }), doc = getPersisted(converter.from(source)); expect(doc.graph!.nodes[1].parentId).toBe('p'); expect(doc.graph!.nodes[1].data.members).toEqual(['+x: int', '+f(): void']); expect(doc.graph!.edges[0].data.sourceMultiplicity).toBe('1');
    expect(converter.to(doc)).toBe(source); doc.graph!.nodes[1].label = 'New A'; const output = converter.to(doc); expect(output).toBe(source.replace('"A" as a', '"New A" as a')); expect(output).toContain("' member comment");
    const unsupported = converter.from(source); unsupported.graph!.nodes[1].data.members[0] = '+new: int'; expect(converter.getUpdate(unsupported).ok).toBe(false);
  });
  it.each([['a "1" <-- b', undefined, '1'], ['a <-- "many" b', 'many', undefined], ['a "1" <.. "many" b', 'many', '1']] as const)('normalizes one-sided reversed multiplicities: %s', (link, source, target) => {
    const graph = fromPlantUML(`@startuml\nclass "A" as a\nclass "B" as b\n${link}\n@enduml\n`); expect(graph.edges[0].sourceId).toBe('b'); expect(graph.edges[0].targetId).toBe('a'); expect(graph.edges[0].data.sourceMultiplicity).toBe(source); expect(graph.edges[0].data.targetMultiplicity).toBe(target);
  });
  it('native escaped quotes preserve their visible backslash; fresh literal quotes/backslashes/markup and LF use verified encoding', () => {
    expect(fromPlantUML('@startuml\ncomponent A\ncomponent B\nA --> B : "Quoted"\n@enduml\n').edges[0].label).toBe('Quoted');
    const native = '@startuml\nclass "Quote \\" value" as a\n@enduml\n'; expect(fromPlantUML(native).nodes[0].label).toBe('Quote \\" value');
    const graph = createGraph({ nodes: [{ id: 'a', label: '<b>**literal**</b> &quot; " \\ \nSecond' }] }); const source = toPlantUML(graph, { dialect: 'class' }); expect(source).toContain('&#34;'); expect(getNativeDocumentGraph(fromPlantUML(source), 'plantuml', source).nodes[0].label).toBe(graph.nodes[0].label);
  });
  it('plain implicit aliases get explicit stable alias under supported label edit', () => {
    const source = '@startuml\ncomponent A\ncomponent B\nA --> B : Calls\n@enduml\n'; const doc = plantumlDocumentConverter.from(source); doc.graph!.nodes[0].label = 'Changed'; const output = plantumlDocumentConverter.to(doc);
    expect(output).toContain('component "Changed" as A'); expect(fromPlantUML(output).edges[0].sourceId).toBe('A');
  });
  it('native source changes/opaque styles remain authoritative, same-field conflicts reject', () => {
    const source = '@startuml\ncomponent "A" as a\ncomponent "B" as b\na --> b\n@enduml\n'; const doc = plantumlDocumentConverter.from(source); doc.source = source.replace('component "A"', 'component "Native"'); expect(plantumlDocumentConverter.to(doc)).toBe(doc.source); doc.graph!.nodes[0].label = 'Graph'; expect(plantumlDocumentConverter.getUpdate(doc).ok).toBe(false);
    const independent = plantumlDocumentConverter.from(source); independent.source = source.replace('@enduml', 'skinparam ArrowColor red\n@enduml'); independent.graph!.nodes[0].label = 'Changed'; expect(plantumlDocumentConverter.to(independent)).toContain('skinparam ArrowColor red');
  });
  it.each(['start\n:A;\nstop', 'state A\nstate B\nA --> B', 'participant A\nparticipant B\nA -> B: call', '!include unknown.puml', 'component A\nclass B', 'class A {\n+x:int\n'])('unsupported/opaque native source stays exact, no executable flattening: %s', (body) => {
    const source = `@startuml\n${body}\n@enduml\n`, doc = plantumlDocumentConverter.from(source); expect(doc.graph).toBeNull(); expect(plantumlDocumentConverter.to(getPersisted(doc))).toBe(source);
  });
  it('empty native display names retain opaque source rather than projecting invalid declarations', () => {
    const source = '@startuml\nclass "" as a\n@enduml\n'; expect(() => fromPlantUML(source)).toThrow('empty'); const converter = createPlantUMLDocumentConverter({ dialect: 'class' }); const doc = converter.from(source); expect(doc.graph).toBeNull(); expect(converter.to(getPersisted(doc))).toBe(source);
  });
  it('malformed/unsupported fresh fields reject instead of emitting invalid or truncated native meaning', () => {
    expect(() => toPlantUML(createGraph({ nodes: [{ id: 'a', label: '' }] }), { dialect: 'class' })).toThrow('empty');
    expect(() => toPlantUML(createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', label: "it's truncated" }] }))).toThrow('comment-starting');
    expect(() => toPlantUML(createGraph({ nodes: [{ id: 'a', data: { members: ['!include unknown'] } }] }), { dialect: 'class' })).toThrow('member');
  });
  it('native unquoted component/interface aliases are valid; class/enum aliases require quoted display names', () => {
    const source = '@startuml\ncomponent Employee as Worker\n@enduml\n'; expect(fromPlantUML(source).nodes[0].id).toBe('Worker');
    expect(fromPlantUML('@startuml\ninterface Employee as Worker\n@enduml\n').nodes[0].id).toBe('Worker');
    for (const kind of ['class', 'enum', 'abstract class']) expect(() => fromPlantUML(`@startuml\n${kind} Employee as Worker\n@enduml\n`)).toThrow('quoted');
  });
  it.each(['component', 'class'] as const)('authored children-before-parent order survives fresh %s hierarchy emission', (dialect) => {
    const graph = createGraph({ nodes: [{ id: 'child', parentId: 'parent', label: 'Child' }, { id: 'parent', label: 'Parent' }, { id: 'second', parentId: 'parent', label: 'Second' }] });
    const source = toPlantUML(graph, { dialect }); expect(getNativeDocumentGraph(fromPlantUML(source), 'plantuml', source)).toEqual(getPersisted(graph));
  });
  it('foreign class kinds, directions, block comments and explicit labels preserve complete source', () => {
    const source = '@startuml\n/\' block\ncomment \'/\nleft to right direction\ninterface Employee as Worker\nabstract class "Parent" as p {\n+f(): void\n}\nenum "Choice" as c {\nONE\nTWO\n}\nWorker ..> p : uses\n@enduml\n';
    const converter = createPlantUMLDocumentConverter({ dialect: 'class' }), doc = getPersisted(converter.from(source)); expect(doc.graph!.direction).toBe('right'); expect(doc.graph!.nodes.map((node) => node.data.kind)).toEqual(['interface', 'abstract class', 'enum']); expect(converter.to(doc)).toBe(source);
    doc.graph!.edges[0].label = 'updated'; expect(converter.to(doc)).toBe(source.replace(': uses', ': updated')); doc.graph!.nodes[0].color = 'red'; expect(converter.getUpdate(doc).ok).toBe(false);
  });
  it('unsupported label patches and real user metadata edits never silently replay source', () => {
    const source = '@startuml\n[Simple] as a\ncomponent "B" as b\na --> b : Calls\n@enduml\n';
    for (const label of ['', 'Line\nBreak', '**markup**']) { const doc = plantumlDocumentConverter.from(source); doc.graph!.nodes[0].label = label; expect(plantumlDocumentConverter.getUpdate(doc).ok).toBe(false); }
    const graph = createGraph({ data: { user: true }, nodes: [{ id: 'a', label: 'A', data: { label: 'actual user' } }] }); const emitted = toPlantUML(graph), doc = plantumlDocumentConverter.from(emitted); doc.graph!.nodes[0].data.label = 'changed user'; expect(plantumlDocumentConverter.getUpdate(doc).ok).toBe(false);
    const quoted = plantumlDocumentConverter.from('@startuml\ncomponent "Implicit name"\n@enduml\n'); quoted.graph!.nodes[0].label = 'Changed'; expect(plantumlDocumentConverter.getUpdate(quoted).ok).toBe(false);
  });
  it.each(['@startuml\ncomponent A\ncomponent A\n@enduml\n', '@startuml\ncomponent A\nA --> B\n@enduml\n', '@startuml\npackage P\n@enduml\n', '@startuml\n}\n@enduml\n', '@startuml\ncomponent A {\n}\n@enduml\n', '@startuml\nclass A {\n{nested}\n}\n@enduml\n', '@startuml\n@startuml\n@enduml\n', '@startuml\n@enduml\ncomponent A\n', '@startuml\n[**rich**] as a\n@enduml\n', '@startuml\n/\' incomplete\n@enduml\n', '@startuml\nskinparam class {\n@enduml\n'])('malformed scoped source is opaque and exact %#', (source) => {
    expect(() => fromPlantUML(source)).toThrow(); const doc = plantumlDocumentConverter.from(source); expect(doc.graph).toBeNull(); expect(plantumlDocumentConverter.to(getPersisted(doc))).toBe(source);
  });
  it('invalid private Graph protocol is ordinary source text, never an invalid typed projection', () => {
    const source = toPlantUML(createGraph({ nodes: [{ id: 'a', label: 'A' }] })); const lines = source.split('\n'), metadata = JSON.parse(lines[1].slice("' @statelyai/graph/plantuml ".length)); metadata.graph.nodes[0].label = 42; lines[1] = "' @statelyai/graph/plantuml " + JSON.stringify(metadata); const foreign = lines.join('\n');
    expect(fromPlantUML(foreign).nodes[0].label).toBe('A'); expect(plantumlDocumentConverter.to(plantumlDocumentConverter.from(foreign))).toBe(foreign);
  });

});
