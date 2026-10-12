// @vitest-environment jsdom
import mermaid from 'mermaid';
import { describe, expect, it } from 'vitest';
import { fromMermaidArchitecture, toMermaidArchitecture } from '../../src/formats/mermaid/architecture';
import { fromMermaidRequirement, toMermaidRequirement } from '../../src/formats/mermaid/requirement';
import { fromMermaidSankey, toMermaidSankey } from '../../src/formats/mermaid/sankey';
import { fromMermaidGitGraph, toMermaidGitGraph } from '../../src/formats/mermaid/git-graph';
import { fromMermaidC4, toMermaidC4 } from '../../src/formats/mermaid/c4';
import { fromMermaidUseCase, toMermaidUseCase } from '../../src/formats/mermaid/use-case';
mermaid.initialize({ startOnLoad: false, securityLevel: 'strict' });
import corpus from './fixtures/mermaid-expanded.json';
import packageJSON from '../../package.json';
const fixtures = Object.fromEntries(corpus.fixtures.map(({ format, source }) => [format, source]));
const codecs: Record<string, { from: (source: string) => any; to: (graph: any) => string }> = {
 architecture: { from: fromMermaidArchitecture, to: toMermaidArchitecture }, requirement: { from: fromMermaidRequirement, to: toMermaidRequirement }, sankey: { from: fromMermaidSankey, to: toMermaidSankey }, git: { from: fromMermaidGitGraph, to: toMermaidGitGraph }, c4: { from: fromMermaidC4, to: toMermaidC4 }, usecase: { from: fromMermaidUseCase, to: toMermaidUseCase },
};
function getNativeSummary(kind: string, db: any): any {
 switch (kind) {
  case 'architecture': return { groups: db.getGroups(), services: db.getServices(), junctions: db.getJunctions(), edges: db.getEdges() };
  case 'requirement': return { requirements: [...db.getRequirements()], elements: [...db.getElements()], relations: db.getRelationships() };
  case 'sankey': return db.getGraph();
  case 'git': return { commits: db.getCommitsArray().map((commit: any) => [commit.id, commit.branch, commit.parents, commit.type, commit.tags]), branches: db.getBranchesAsObjArray() };
  case 'c4': return { type: db.getC4Type(), root: db.getC4ShapeArray(), api: db.getC4ShapeArray('api'), boundaries: db.getBoundaries(), relations: db.getRels() };
  case 'usecase': return { actors: [...db.getActors()], usecases: [...db.getUseCases()], boundaries: [...db.getSystemBoundaries()], relations: db.getRelationships() };
 }
}
describe('Mermaid12.1 expanded native grammar and databases', () => {
 it('pins official-profile provenance to the installed independent oracle', () => {
  expect(corpus.oracle).toBe(`mermaid@${packageJSON.devDependencies.mermaid}`);
  expect(corpus.fixtures).toHaveLength(6);
 });
 it.each(Object.entries(fixtures))('%s accepts authored/emitted source and preserves native semantics', async (kind, source) => {
  const native = (await mermaid.mermaidAPI.getDiagramFromText(source)).db as any;
  const baseline = JSON.parse(JSON.stringify(getNativeSummary(kind, native)));
  const generated = codecs[kind].to(codecs[kind].from(source));
  const db = (await mermaid.mermaidAPI.getDiagramFromText(generated)).db as any;
  expect(JSON.parse(JSON.stringify(getNativeSummary(kind, db)))).toEqual(baseline);
  switch (kind) {
   case 'architecture': expect(db.getGroups()).toMatchObject([{ id: 'api', title: 'API' }]); expect(db.getServices()).toMatchObject([{ id: 'db', in: 'api', icon: 'database' }, { id: 'web', in: 'api' }]); expect(db.getJunctions()).toMatchObject([{ id: 'hub', in: 'api' }]); break;
   case 'requirement': expect(db.getRequirements().get('secure')).toMatchObject({ text: 'Secure 東京', risk: 'High', verifyMethod: 'Test' }); expect(db.getRelationships()[0]).toMatchObject({ type: 'satisfies', src: 'app', dst: 'secure' }); break;
   case 'sankey': expect(db.getGraph().links).toEqual([{ source: 'Source', target: 'Store', value: 2.5 }, { source: 'Store', target: 'Target', value: 2 }]); break;
   case 'git': expect(db.getCommits().get('m')).toMatchObject({ branch: 'main', parents: ['c', 'b'], type: 3 }); break;
   case 'c4': expect(db.getC4Shape('db')).toMatchObject({ alias: 'db', label: { text: 'Store' }, techn: { text: 'SQL' } }); break;
   case 'usecase': expect(db.getActors().get('User')).toMatchObject({ label: 'User' }); expect(db.getUseCases().get('Login')).toMatchObject({ parentId: 'app' }); expect(db.getRelationships()[1]).toMatchObject({ type: 'include', source: 'Manage', target: 'Login' }); break;
  }
 });
});

import { getNativeMermaidText } from './mermaid-decoder';
import { escapeMermaidId } from '../../src/formats/mermaid/shared';
import { mermaidArchitectureDocumentConverter, mermaidRequirementDocumentConverter, mermaidC4DocumentConverter, mermaidUseCaseDocumentConverter } from '../../src/formats/mermaid/document';
const unicodeText = '東京 "quoted" \\ slash [] () {} #quot;\nnext';
it.each(['architecture', 'requirement', 'git', 'c4', 'usecase'])('%s native display decodes exact Unicode/quotes/backslashes and line breaks', async (kind) => {
 const graph = codecs[kind].from(fixtures[kind as keyof typeof fixtures]);
 if (kind === 'architecture') graph.nodes.find((node: any) => node.id === 'db').label = unicodeText;
 if (kind === 'requirement') graph.nodes[0].label = unicodeText;
 if (kind === 'git') graph.nodes[1].data.tags = [unicodeText];
 if (kind === 'c4') graph.nodes.find((node: any) => node.id === 'web').label = unicodeText;
 if (kind === 'usecase') graph.nodes.find((node: any) => node.id === 'Login').label = unicodeText;
 const db = (await mermaid.mermaidAPI.getDiagramFromText(codecs[kind].to(graph))).db as any;
 const actual = kind === 'architecture' ? db.getServices().find((node: any) => node.id === 'db').title
  : kind === 'requirement' ? db.getRequirements().get('secure').text
  : kind === 'git' ? db.getCommits().get('b').tags[0]
  : kind === 'c4' ? db.getC4Shape('web').label.text : db.getUseCases().get('Login').label;
 expect(await getNativeMermaidText(actual)).toBe(unicodeText);
});
it('Architecture native sides/arrowheads/group modifiers and align directives agree', async () => {
 const source = 'architecture-beta\ngroup g(cloud)[G]\nservice a(server)[A] in g\nservice b(database)[B]\na{group}:R <--> L:b\nalign row a b';
 const baseline = (await mermaid.mermaidAPI.getDiagramFromText(source)).db as any;
 const expected = JSON.parse(JSON.stringify({ edges: baseline.getEdges(), align: baseline.getLayoutHints() }));
 const db = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidArchitecture(fromMermaidArchitecture(source)))).db as any;
 expect({ edges: db.getEdges(), align: db.getLayoutHints() }).toEqual(expected);
});
it('Requirement native classes/styles, types, directions and semantic relations survive', async () => {
 const source = 'requirementDiagram\ndirection LR\nfunctionalRequirement a:::blue {\nid: "R-東京"\nrisk: low\nverifymethod: inspection\n}\nphysicalRequirement b {\ntext: "Body"\nrisk: medium\nverifymethod: demonstration\n}\na - traces -> b\nclassDef blue fill:#eef\nstyle a stroke:#abc';
 const db0 = (await mermaid.mermaidAPI.getDiagramFromText(source)).db as any;
 const expected = JSON.parse(JSON.stringify(getNativeSummary('requirement', db0)));
 const graph = fromMermaidRequirement(source);
 const db = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidRequirement(graph))).db as any;
 expect(JSON.parse(JSON.stringify(getNativeSummary('requirement', db)))).toEqual(expected);
 expect(db.getDirection()).toBe('LR');
});
it('UseCase variants, stereotypes, explicit IDs/styles/animation, notes and JSON cells retain native semantics', async () => {
 const source = 'usecase-beta\nactor A("Actor")@{ type: hollow, business: true } <<Employee>>:::blue\nactor B\nCase["Case"]\nOther("Other")\nA use@-- "Starts" ---> Case\nCase ..> : extend Other\nA --|> B\nnote for A "Keep this"\njson Payload@{ "active": true, "none": null, "value": [1, false] }\nCase --> Payload\nuse@{ animation: fast }\nstyle use stroke:#06c\nclassDef blue fill:#eef\nclass Case blue';
 const db0 = (await mermaid.mermaidAPI.getDiagramFromText(source)).db as any;
 const expected = JSON.parse(JSON.stringify({ ...getNativeSummary('usecase', db0), notes: [...db0.getNotes()], json: [...db0.getJsonNodes()], classes: [...db0.getClassDefs()] }));
 const db = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidUseCase(fromMermaidUseCase(source)))).db as any;
 expect(JSON.parse(JSON.stringify({ ...getNativeSummary('usecase', db), notes: [...db.getNotes()], json: [...db.getJsonNodes()], classes: [...db.getClassDefs()] }))).toEqual(expected);
 expect(db.getRelationships()[0]).toMatchObject({ explicitId: true, minlen: 2, animate: true, animation: 'fast', styles: ['stroke:#06c'] });
});
it('GitGraph cherry-pick records both copy and current-parent dependencies', async () => {
 const source = 'gitGraph\ncommit id: "a"\nbranch feature\ncommit id: "b"\ncheckout main\ncommit id: "c"\ncherry-pick id: "b"';
 const graph = fromMermaidGitGraph(source); const last = graph.nodes.at(-1)!;
 expect(graph.edges.filter((edge) => edge.sourceId === last.id).map((edge) => edge.targetId)).toEqual(['c', 'b']);
 const db = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidGitGraph(graph))).db as any;
 expect(db.getCommitsArray().at(-1)).toMatchObject({ parents: ['c', 'b'], type: 4, tags: ['cherry-pick:b'] });
});
it('Sankey CSV grammar retains exact quoted Unicode names, zero and parallel weights', async () => {
 const source = 'sankey-beta\n"A,ASCII","B ""quoted"" \\ slash",0\n"A,ASCII","B ""quoted"" \\ slash",3e-2';
 const db = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidSankey(fromMermaidSankey(source)))).db as any;
 expect(db.getGraph()).toEqual({ nodes: [{ id: 'A,ASCII' }, { id: 'B "quoted" \\ slash' }], links: [{ source: 'A,ASCII', target: 'B "quoted" \\ slash', value: 0 }, { source: 'A,ASCII', target: 'B "quoted" \\ slash', value: 0.03 }] });
});
it.each([
 ['architecture', mermaidArchitectureDocumentConverter, 'db'], ['requirement', mermaidRequirementDocumentConverter, 'secure'], ['c4', mermaidC4DocumentConverter, 'web'], ['usecase', mermaidUseCaseDocumentConverter, 'Login'],
] as const)('%s edited document output remains natively valid with untouched comments', async (kind, codec, id) => {
 const document = codec.from(`%% retained\n${fixtures[kind]}\n%% trailing\n`);
 document.graph!.nodes.find((node) => node.id === id)!.label = unicodeText;
 const result = codec.to(JSON.parse(JSON.stringify(document)) as any);
 expect(result.startsWith('%% retained\n')).toBe(true); expect(result.endsWith('%% trailing\n')).toBe(true);
 expect(await mermaid.parse(result)).toHaveProperty('diagramType');
});
it('Architecture IDs and UseCase numeric IDs remain native-safe without collisions', async () => {
 const raw = ['a b', '__stately_id_0061', '1', '東京', 'constructor', '__proto__'];
 const source = `architecture-beta\n${raw.map((id) => `service ${escapeMermaidId(id)}[Service]`).join('\n')}`;
 const db = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidArchitecture(fromMermaidArchitecture(source)))).db as any;
 expect(db.getServices().map((node: any) => node.id)).toEqual(raw.map(escapeMermaidId));
 const usecase = (await mermaid.mermaidAPI.getDiagramFromText('usecase-beta\nactor 1("One")\n3rd("Third")\n1 --> 3rd')).db as any;
 expect([...usecase.getActors()].map(([id]: any) => id)).toEqual(['1']);
});
it('Sankey native whitespace is normalized and Unicode rejection is an explicit upstream control', async () => {
 const native = (await mermaid.mermaidAPI.getDiagramFromText('sankey-beta\n" A "," B ", 2 ')).db as any;
 expect(native.getGraph().nodes).toEqual([{ id: 'A' }, { id: 'B' }]);
 expect(fromMermaidSankey('sankey-beta\n" A "," B ", 2 ').nodes.map((node) => node.id)).toEqual(['A', 'B']);
 await expect(mermaid.parse('sankey-beta\n東京,B,1')).rejects.toThrow();
});
it('Requirement omitted empty text is native-valid, unlike the upstream empty string token', async () => {
 await expect(mermaid.parse('requirementDiagram\nrequirement a {\ntext: ""\n}')).rejects.toThrow();
 const graph = fromMermaidRequirement('requirementDiagram\nrequirement a {\n}');
 const db = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidRequirement(graph))).db as any;
 expect(db.getRequirements().get('a').text).toBe('');
});
it('GitGraph native fresh and modified mainBranchName follow the live graph field', async () => {
 const graph = fromMermaidGitGraph('%%{init: {"gitGraph":{"mainBranchName":"trunk"}}}%%\ngitGraph\ncommit id: "a"');
 graph.data.mainBranch = 'live'; graph.nodes[0].data.branch = 'live';
 const generated = toMermaidGitGraph(graph);
 const config = (await mermaid.parse(generated)) as { config: any };
 expect(config.config.gitGraph.mainBranchName).toBe('live');
 // getDiagramFromText strips directives without applying configuration; initialize
 // from the native parser's extracted config before inspecting its database.
 mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', ...config.config });
 let db = (await mermaid.mermaidAPI.getDiagramFromText(generated)).db as any;
 expect(db.getCommits().get('a').branch).toBe('live');
 graph.data = { diagramType: 'gitGraph', mainBranch: 'fresh', actions: [{ kind: 'commit', nodeId: 'a' }] }; graph.nodes[0].data.branch = 'fresh';
 const fresh = toMermaidGitGraph(graph);
 const freshConfig = (await mermaid.parse(fresh)) as { config: any };
 expect(freshConfig.config.gitGraph.mainBranchName).toBe('fresh');
 mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', ...freshConfig.config });
 db = (await mermaid.mermaidAPI.getDiagramFromText(fresh)).db as any;
 expect(db.getBranchesAsObjArray()).toEqual([{ name: 'fresh' }]);
});
it('native architecture and UseCase empty-ID aliases preserve group membership', async () => {
 const id = escapeMermaidId('');
 const architecture = fromMermaidArchitecture(`architecture-beta\ngroup ${id}[G]\nservice c[C] in ${id}`);
 const db = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidArchitecture(architecture))).db as any;
 expect(db.getGroups()[0].id).toBe(id); expect(db.getServices()[0].in).toBe(id);
 const usecase = fromMermaidUseCase(`usecase-beta\nsystemBoundary ${id}[G]\nC[C]\nend`);
 const useDb = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidUseCase(usecase))).db as any;
 expect(useDb.getUseCases().get('C').parentId).toBe(id);
});
it('native bulk/deep profiles preserve service counts and deployment hierarchy', async () => {
 const architecture = `architecture-beta\n${Array.from({ length: 2000 }, (_, index) => `service n${index}[Node]`).join('\n')}`;
 const db = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidArchitecture(fromMermaidArchitecture(architecture)))).db as any;
 expect(db.getServices()).toHaveLength(2000);
 const c4 = `C4Deployment\n${Array.from({ length: 100 }, (_, index) => `Deployment_Node(g${index}, "Group") {`).join('\n')}\nContainer(leaf, "Leaf", "JS")\n${Array.from({ length: 100 }, () => '}').join('\n')}`;
 const c4Db = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidC4(fromMermaidC4(c4)))).db as any;
 expect(c4Db.getC4Shape('leaf')).toMatchObject({ parentBoundary: 'g99' });
});
it.each(['architecture', 'c4', 'usecase'])('%s native empty/null labels have an explicit valid output or rejection', async (kind) => {
 const graph = codecs[kind].from(fixtures[kind as keyof typeof fixtures]);
 graph.nodes[0].label = '';
 if (kind === 'architecture') expect(() => codecs[kind].to(graph)).toThrow('empty labels');
 else expect(await mermaid.parse(codecs[kind].to(graph))).toHaveProperty('diagramType');
 graph.nodes[0].label = null;
 expect(await mermaid.parse(codecs[kind].to(graph))).toHaveProperty('diagramType');
});

it('Architecture preserves native bracket whitespace and literal quotes', async () => {
 const source = 'architecture-beta\nservice a[  A  ]\nservice b["B"]';
 const db = (await mermaid.mermaidAPI.getDiagramFromText(source)).db as any;
 expect(fromMermaidArchitecture(source).nodes.map((node) => node.label)).toEqual(db.getServices().map((node: any) => node.title));
});
it('native numeric display entities replace NUL and lone surrogates instead of preserving them', async () => {
 const nul = (await mermaid.mermaidAPI.getDiagramFromText('flowchart TD\nA["#0;"]')).db as any;
 expect(await getNativeMermaidText(nul.getVertices().get('A').text)).toBe('\ufffd');
 const surrogate = (await mermaid.mermaidAPI.getDiagramFromText('flowchart TD\nA["#55296;"]')).db as any;
 expect(await getNativeMermaidText(surrogate.getVertices().get('A').text)).toBe('\ufffd');
 expect(await getNativeMermaidText('Astral 😀')).toBe('Astral 😀');
 const graph = fromMermaidArchitecture(fixtures.architecture);
 for (const invalid of ['NUL\0value', 'A\ud800B']) { graph.nodes[0].label = invalid; expect(() => toMermaidArchitecture(graph)).toThrow('display'); }
});

it('C4 native reverse relation uses the start marker and canonical reverse Graph endpoints', async () => {
 const source = 'C4Context\nPerson(a,"A")\nPerson(b,"B")\nPerson(c,"C")\nRel_Back(a,b,"Back")\nRel_U(a,c,"Up")';
 const graph = fromMermaidC4(source);
 expect(graph.edges.map(({ sourceId, targetId }) => [sourceId, targetId])).toEqual([['b', 'a'], ['a', 'c']]);
 const db = (await mermaid.mermaidAPI.getDiagramFromText(toMermaidC4(graph))).db as any;
 expect(db.getRels()).toMatchObject([{ from: 'a', to: 'b', type: 'rel_b' }, { from: 'a', to: 'c', type: 'rel_u' }]);
 // Characterize the pinned renderer itself: its reverse relation lacks the end marker.
 const { createRequire } = await import('node:module');
 const { dirname, join } = await import('node:path');
 const { readdirSync, readFileSync } = await import('node:fs');
 const directory = join(dirname(createRequire(import.meta.url).resolve('mermaid')), 'chunks/mermaid.core');
 const renderer = readFileSync(join(directory, readdirSync(directory).find((file) => /^c4Diagram-.*\.mjs$/.test(file))!), 'utf8');
 expect(renderer).toMatch(/if \(rel\.type !== "rel_b"\) \{\s*line\.attr\("marker-end"/);
 expect(renderer).toMatch(/if \(rel\.type === "birel" \|\| rel\.type === "rel_b"\) \{\s*line\.attr\("marker-start"/);
});
