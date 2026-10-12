import { describe, expect, it } from 'vitest';
import { fromMermaidArchitecture, toMermaidArchitecture } from '../../../src/formats/mermaid/architecture';
import { fromMermaidRequirement, toMermaidRequirement } from '../../../src/formats/mermaid/requirement';
import { fromMermaidSankey, toMermaidSankey } from '../../../src/formats/mermaid/sankey';
import { fromMermaidGitGraph, toMermaidGitGraph } from '../../../src/formats/mermaid/git-graph';
import { fromMermaidC4, toMermaidC4 } from '../../../src/formats/mermaid/c4';
import { fromMermaidUseCase, toMermaidUseCase } from '../../../src/formats/mermaid/use-case';

export const expandedProfiles = {
 architecture: 'architecture-beta\ngroup api(cloud)[API]\nservice db(database)[Database] in api\nservice web(server)[Web] in api\njunction hub in api\ndb:R --> L:web\nweb:B -- T:hub',
 requirement: 'requirementDiagram\nrequirement secure {\nid: R1\ntext: "Secure 東京"\nrisk: high\nverifymethod: test\n}\nelement app {\ntype: software\ndocref: "spec v1"\n}\napp - satisfies -> secure',
 sankey: 'sankey-beta\nSource,Store,2.5\nStore,Target,2',
 git: 'gitGraph\ncommit id: "a"\nbranch develop order: 2\ncommit id: "b" tag: "β"\ncheckout main\ncommit id: "c" type: HIGHLIGHT\nmerge develop id: "m"',
 c4: 'C4Container\nPerson(user, "User", "Customer")\nContainer_Boundary(api, "API") {\nContainer(web, "Web", "JS", "Frontend")\nContainerDb(db, "Store", "SQL", "Database")\n}\nRel(user, web, "Uses", "HTTPS")\nRel(web, db, "Reads", "SQL")',
 usecase: 'usecase-beta\nactor User("User")\nsystemBoundary app["App"]\nLogin("Login")\nManage["Manage"]\nend\nUser --> Login\nManage ..> : include Login',
};
describe('expanded Mermaid graph profiles', () => {
 it('maps architecture groups, native sides/ports and arrow modes', () => {
  const graph = fromMermaidArchitecture(expandedProfiles.architecture);
  expect(graph.nodes.find((node) => node.id === 'db')).toMatchObject({ parentId: 'api', data: { kind: 'service', icon: 'database' } });
  expect(graph.edges[0]).toMatchObject({ sourceId: 'db', sourcePort: 'R', targetPort: 'L', mode: 'directed' });
  expect(fromMermaidArchitecture(toMermaidArchitecture(graph))).toEqual(graph);
 });
 it('maps requirement semantic fields and typed relationships', () => {
  const graph = fromMermaidRequirement(expandedProfiles.requirement);
  expect(graph.nodes[0]).toMatchObject({ label: 'Secure 東京', data: { requirementId: 'R1', risk: 'high', verifyMethod: 'test' } });
  expect(graph.edges[0].data.relationship).toBe('satisfies');
  expect(fromMermaidRequirement(toMermaidRequirement(graph))).toEqual(graph);
 });
 it('maps weighted Sankey names and values', () => {
  const graph = fromMermaidSankey(expandedProfiles.sankey);
  expect(graph.edges.map((edge) => edge.weight)).toEqual([2.5, 2]);
  expect(fromMermaidSankey(toMermaidSankey(graph))).toEqual(graph);
 });
 it('maps ordered git actions to a commit DAG', () => {
  const graph = fromMermaidGitGraph(expandedProfiles.git);
  expect(graph.edges.filter((edge) => edge.sourceId === 'm').map((edge) => edge.targetId)).toEqual(['c', 'b']);
  expect(fromMermaidGitGraph(toMermaidGitGraph(graph))).toEqual(graph);
 });
 it('maps C4 typed nodes, boundaries and relation technology', () => {
  const graph = fromMermaidC4(expandedProfiles.c4);
  expect(graph.nodes.find((node) => node.id === 'db')).toMatchObject({ parentId: 'api', data: { kind: 'ContainerDb', technology: 'SQL' } });
  expect(graph.edges[1].data.technology).toBe('SQL');
  expect(fromMermaidC4(toMermaidC4(graph))).toEqual(graph);
 });
 it('maps use-case boundaries, actor kinds and include semantics', () => {
  const graph = fromMermaidUseCase(expandedProfiles.usecase);
  expect(graph.nodes.find((node) => node.id === 'Login')?.parentId).toBe('app');
  expect(graph.edges[1].data.relationship).toBe('include');
  expect(fromMermaidUseCase(toMermaidUseCase(graph))).toEqual(graph);
 });
});

import { createGraph } from '../../../src/graph';
import { escapeMermaidId } from '../../../src/formats/mermaid/shared';
import { mermaidArchitectureDocumentConverter, mermaidRequirementDocumentConverter, mermaidC4DocumentConverter, mermaidUseCaseDocumentConverter, mermaidSankeyDocumentConverter, mermaidGitGraphDocumentConverter } from '../../../src/formats/mermaid/document';
const documentCodecs = {
 architecture: mermaidArchitectureDocumentConverter, requirement: mermaidRequirementDocumentConverter,
 c4: mermaidC4DocumentConverter, usecase: mermaidUseCaseDocumentConverter, sankey: mermaidSankeyDocumentConverter, git: mermaidGitGraphDocumentConverter,
};
const text = '東京 "quote" \\ slash [] () {} #quot;\nnext';
describe('expanded profile boundaries and persistence', () => {
 it.each(Object.entries(documentCodecs))('%s preserves exact comments/frontmatter/directives and unknown syntax after JSON persistence', (kind, codec) => {
  const source = `---\ntitle: opaque\n---\n%%{init: {"theme":"base"}}%%\n%% comment\n${expandedProfiles[kind as keyof typeof expandedProfiles]}\n%% trailing\n`;
  const document = codec.from(source);
  expect(document.graph).not.toBeNull();
  expect(codec.to(JSON.parse(JSON.stringify(document)) as any)).toBe(source);
  const unsupported = codec.from(`${source}\nunknown future statement\n`);
  expect(unsupported.graph).toBeNull();
  expect(codec.to(JSON.parse(JSON.stringify(unsupported)) as any)).toBe(`${source}\nunknown future statement\n`);
 });
 it.each(['architecture', 'requirement', 'c4', 'usecase'] as const)('%s patches verified labels without changing comments/source extensions', (kind) => {
  const codec = documentCodecs[kind];
  const source = `%% Before comment\n${expandedProfiles[kind]}\n%% After comment\n`;
  const document = codec.from(source);
  const node = kind === 'architecture' ? document.graph!.nodes.find((node) => node.id === 'db')! : kind === 'c4' ? document.graph!.nodes.find((node) => node.id === 'web')! : kind === 'usecase' ? document.graph!.nodes.find((node) => node.id === 'Login')! : document.graph!.nodes[0];
  node.label = text;
  const result = codec.to(document as any);
  expect(result.startsWith('%% Before comment\n')).toBe(true);
  expect(result.endsWith('\n%% After comment\n')).toBe(true);
  expect(codec.from(result).graph!.nodes.find((item) => item.id === node.id)!.label).toBe(text);
  node.data = null as any;
  expect(() => codec.to(document as any)).toThrow('unsupported-edit');
 });
 it('uses canonical architecture modes and preserves reverse/group endpoints', () => {
  const graph = fromMermaidArchitecture('architecture-beta\ngroup g[Group]\nservice a[A] in g\nservice b[B]\na{group}:R <-- L:b');
  expect(graph.edges[0]).toMatchObject({ sourceId: 'b', targetId: 'a', sourcePort: 'L', targetPort: 'R', data: { targetGroup: true } });
  expect(fromMermaidArchitecture(toMermaidArchitecture(graph))).toEqual(graph);
  graph.edges[0].mode = 'bidirectional';
  expect(toMermaidArchitecture(graph)).toContain('<-->');
  graph.edges[0].mode = 'undirected';
  expect(fromMermaidArchitecture(toMermaidArchitecture(graph)).edges[0].mode).toBe('undirected');
  delete graph.edges[0].mode; graph.mode = 'undirected';
  expect(toMermaidArchitecture(graph)).not.toContain('<--');
 });
 it('keeps arbitrary escaped IDs injective, numeric starting IDs and Unicode labels', () => {
  const ids = ['a b', '__stately_id_0061', '1', '東京', 'constructor', '__proto__'];
  const graph = fromMermaidArchitecture(`architecture-beta\n${ids.map((id) => `service ${escapeMermaidId(id)}[Label]`).join('\n')}`);
  graph.nodes[0].label = text;
  expect(fromMermaidArchitecture(toMermaidArchitecture(graph)).nodes.map((node) => node.id)).toEqual(ids);
  expect(fromMermaidArchitecture(toMermaidArchitecture(graph)).nodes[0].label).toBe(text);
 });
 it('retains every requirement type, risk, verification and reversed relationship', () => {
  const graph = fromMermaidRequirement('requirementDiagram\nfunctionalRequirement "a name" {\nid: "business ID"\nrisk: Low\nverifymethod: Analysis\n}\ndesignConstraint b {\ntext: B\nrisk: medium\nverifymethod: demonstration\n}\n"a name" <- refines - b\ndirection RL');
  expect(graph.direction).toBe('left');
  expect(graph.edges[0]).toMatchObject({ sourceId: 'b', targetId: 'a name', data: { relationship: 'refines' } });
  graph.nodes[0].label = text;
  expect(fromMermaidRequirement(toMermaidRequirement(graph))).toEqual(graph);
 });
 it('retains weighted quoted Sankey names, parallels, zeroes and a documented unit default', () => {
  const graph = fromMermaidSankey('sankey-beta\n"A,ASCII","B ""quoted"" \\ slash",0\n"A,ASCII","B ""quoted"" \\ slash",3e-2');
  expect(graph.edges.map((edge) => edge.weight)).toEqual([0, 0.03]);
  expect(fromMermaidSankey(toMermaidSankey(graph))).toEqual(graph);
  delete graph.edges[0].weight;
  expect(fromMermaidSankey(toMermaidSankey(graph)).edges[0].weight).toBe(1);
  expect(fromMermaidSankey(toMermaidSankey(graph, { defaultWeight: 2 })).edges[0].weight).toBe(2);
 });
 it('preserves C4 levels, nested deployment boundaries and named arguments', () => {
  const graph = fromMermaidC4('C4Deployment\nDeployment_Node(host, "Host", "VM", "Description") {\nContainer_Boundary(g, "Group") {\nContainer(a, "A,ASCII", "JS", "", $tags="v1", $link="https://example.test")\n}\n}\nPerson(b, "B")\nRel_Back(a, b, "Reverse", "HTTP", $tags="r")');
  expect(graph.nodes[2]).toMatchObject({ parentId: 'g', data: { namedArguments: [{ name: '$tags', value: 'v1' }, { name: '$link', value: 'https://example.test' }] } });
  graph.nodes[2].label = text;
  expect(fromMermaidC4(toMermaidC4(graph))).toEqual(graph);
  graph.edges[0].mode = 'bidirectional';
  expect(toMermaidC4(graph)).toContain('BiRel(');
 });
 it('preserves UseCase native variants, metadata, stereotypes, explicit edges/styles and notes/JSON data', () => {
  const source = 'usecase-beta\ndirection LR\nactor A("Actor")@{ type: hollow, business: true } <<Employee>>:::blue\nactor B\nCase["Case"]\nOther("Other")\nA use@-- "Starts" ---> Case\nCase ..> : extend Other\nA --|> B\nnote for A "Keep this"\njson Payload@{ "active": true, "none": null, "value": [1, false] }\nCase --> Payload\nuse@{ animation: fast }\nstyle use stroke:#06c\nclassDef blue fill:#eef\nclass Case blue';
  const graph = fromMermaidUseCase(source);
  expect(graph.nodes.find((node) => node.id === 'A')!.data).toMatchObject({ properties: { type: 'hollow', business: true }, stereotype: 'Employee', classes: ['blue'] });
  expect(graph.edges[0]).toMatchObject({ id: 'use', label: 'Starts', data: { explicitId: true, minlen: 2, properties: { animation: 'fast' } }, style: { stroke: '#06c' } });
  expect(graph.nodes.find((node) => node.id === 'Payload')!.data.value!.none).toBeNull();
  expect(fromMermaidUseCase(toMermaidUseCase(graph))).toEqual(graph);
 });
 it('uses canonical association modes and keeps marker orientation after edits', () => {
  const graph = fromMermaidUseCase('usecase-beta\nactor A\nB\nB o-- A');
  expect(graph.edges[0]).toMatchObject({ sourceId: 'A', targetId: 'B' });
  expect(fromMermaidUseCase(toMermaidUseCase(graph))).toEqual(graph);
  graph.edges[0].mode = 'undirected';
  expect(fromMermaidUseCase(toMermaidUseCase(graph)).edges[0].mode).toBe('undirected');
 });
 it('preserves GitGraph switch, tags, anonymous commits, branch order and cherry-pick parent history', () => {
  const graph = fromMermaidGitGraph('gitGraph TB:\ncommit id: "a"\nbranch "feature branch" order: 1\ncommit id: "b" tag: "β" type: REVERSE\nswitch main\ncommit\ncherry-pick id: "b"');
  expect(graph.direction).toBe('down');
  expect(graph.nodes.at(-1)!.data.kind).toBe('cherry-pick');
  expect(fromMermaidGitGraph(toMermaidGitGraph(graph))).toEqual(graph);
  graph.nodes[1].data.tags = [text];
  expect(fromMermaidGitGraph(toMermaidGitGraph(graph)).nodes[1].data.tags).toEqual([text]);
  graph.edges[0].targetId = 'b';
  expect(() => toMermaidGitGraph(graph)).toThrow('conflict');
 });
 it.each([
  ['architecture', 'service a[A]\nservice a[B]'], ['architecture', 'service a[A] in absent'], ['architecture', 'service a[A]\na:R -- L:missing'], ['architecture', 'junction a[bad]'], ['architecture', 'group a[A] in b\ngroup b[B] in a'],
  ['requirement', 'requirement a {\nrisk: fatal\n}'], ['requirement', 'requirement a {\nverifymethod: unknown\n}'], ['requirement', 'requirement a {\ntext: "Open"'], ['requirement', 'a - satisfies -> b'], ['requirement', 'element a {\ntext: invalid\n}'],
  ['sankey', 'A,B,-1'], ['sankey', 'A,B,Infinity'], ['sankey', 'A,B,unknown'], ['sankey', 'A,B'],
  ['git', 'checkout missing'], ['git', 'branch main'], ['git', 'commit id: "a"\ncommit id: "a"'], ['git', 'commit type: BAD'], ['git', 'commit id: "a"\nmerge main'], ['git', 'cherry-pick id: "missing"'],
  ['c4', 'Boundary(a, "A") {'], ['c4', '}'], ['c4', 'Rel(a, b, "Missing")'], ['c4', 'Person(a)'], ['c4', 'Person(a, "A") {\n}'],
  ['usecase', 'end'], ['usecase', 'systemBoundary g\nsystemBoundary h'], ['usecase', 'actor A\nB\nA ..> : include B'], ['usecase', 'actor A\nB\nA --|> B'], ['usecase', 'A@{ business: unknown }'], ['usecase', 'json A@{ invalid }'],
 ] as const)('rejects malformed/unrepresentable %s: %s', (kind, body) => {
  const header = expandedProfiles[kind].split('\n')[0];
  expect(documentCodecs[kind].from(`${header}\n${body}`).graph).toBeNull();
 });
 it('rejects unrepresentable exported topology and stale ordered references explicitly', () => {
  const sankey = fromMermaidSankey(expandedProfiles.sankey);
  sankey.nodes.push({ type: 'node', id: 'Isolated', label: 'Isolated', data: null });
  expect(() => toMermaidSankey(sankey)).toThrow('isolated');
  const git = fromMermaidGitGraph(expandedProfiles.git); git.nodes[0].id = 'renamed';
  expect(() => toMermaidGitGraph(git)).toThrow('stale');
  expect(() => toMermaidGitGraph(createGraph({}) as any)).toThrow('ordered actions');
  const c4 = fromMermaidC4(expandedProfiles.c4); c4.edges[0].mode = 'undirected';
  expect(() => toMermaidC4(c4)).toThrow('undirected');
  const usecase = fromMermaidUseCase(expandedProfiles.usecase); usecase.edges[1].mode = 'undirected';
  expect(() => toMermaidUseCase(usecase)).toThrow('incompatible');
 });
});

it('Sankey native names trim quoted outer whitespace and reject Unicode/unsafe outgoing identities', () => {
 const graph = fromMermaidSankey('sankey\n"  A  "," B ", 2 ');
 expect(graph.nodes.map((node) => node.id)).toEqual(['A', 'B']);
 expect(graph.edges[0].weight).toBe(2);
 const unsupported = mermaidSankeyDocumentConverter.from('sankey-beta\n東京,B,1');
 expect(unsupported.graph).toBeNull(); expect(mermaidSankeyDocumentConverter.to(unsupported)).toBe('sankey-beta\n東京,B,1');
 graph.nodes[0].id = ' A '; graph.nodes[0].label = ' A '; graph.edges[0].sourceId = ' A ';
 expect(() => toMermaidSankey(graph)).toThrow('names are identities');
});
it('Requirement empty text omits the invalid empty string token while document comments survive', () => {
 const graph = fromMermaidRequirement('requirementDiagram\nrequirement a {\n}\n');
 expect(graph.nodes[0].label).toBe(''); expect(toMermaidRequirement(graph)).not.toContain('text:');
 const document = mermaidRequirementDocumentConverter.from('requirementDiagram\nrequirement a {\n  text: "Before" %% keep\n}\n');
 document.graph!.nodes[0].label = '';
 const source = mermaidRequirementDocumentConverter.to(document);
 expect(source).toContain('%% keep'); expect(mermaidRequirementDocumentConverter.from(source).graph!.nodes[0].label).toBe('');
});
it('GitGraph live main branch overrides stale init and supports fresh trunk histories', () => {
 const graph = fromMermaidGitGraph('%%{init: {"gitGraph":{"mainBranchName":"trunk"}}}%%\ngitGraph\ncommit id: "a"');
 expect(graph.data.mainBranch).toBe('trunk');
 graph.data.mainBranch = 'live'; graph.nodes[0].data.branch = 'live';
 expect(fromMermaidGitGraph(toMermaidGitGraph(graph)).nodes[0].data.branch).toBe('live');
 const fresh = { ...graph, data: { diagramType: 'gitGraph' as const, mainBranch: 'fresh', actions: [{ kind: 'commit' as const, nodeId: 'a' }] } };
 fresh.nodes = fresh.nodes.map((node) => ({ ...node, data: { ...node.data, branch: 'fresh' } }));
 expect(fromMermaidGitGraph(toMermaidGitGraph(fresh)).data.mainBranch).toBe('fresh');
});
it('UseCase protects note identity/topology, reserved keys and non-JSON table data', () => {
 const graph = fromMermaidUseCase('usecase-beta\nactor __note_0\nnote for __note_0 "Note"\njson Payload@{ "__proto__": null, "constructor": [false] }');
 expect(graph.nodes.find((node) => node.data.kind === 'note')!.id).not.toBe('__note_0');
 expect(Object.hasOwn(graph.nodes.find((node) => node.id === 'Payload')!.data.value!, '__proto__')).toBe(true);
 expect(fromMermaidUseCase(toMermaidUseCase(graph))).toEqual(graph);
 graph.edges = [];
 expect(() => toMermaidUseCase(graph)).toThrow('stale note');
 const json = fromMermaidUseCase('usecase-beta\njson A@{ "safe": null }');
 json.nodes[0].data.value!.unsafe = () => true;
 expect(() => toMermaidUseCase(json)).toThrow('JSON');
 expect(() => fromMermaidUseCase('usecase-beta\na\n__stately_id_0061')).toThrow('ambiguous');
});
it('encodes empty bare IDs injectively and preserves empty hierarchy parent references', () => {
 const source = `architecture-beta\ngroup ${escapeMermaidId('')}[Group]\nservice child[Child] in ${escapeMermaidId('')}`;
 const graph = fromMermaidArchitecture(source);
 expect(graph.nodes[0].id).toBe(''); expect(graph.nodes[1].parentId).toBe('');
 expect(fromMermaidArchitecture(toMermaidArchitecture(graph))).toEqual(graph);
 const usecase = fromMermaidUseCase(`usecase-beta\nsystemBoundary ${escapeMermaidId('')}[Group]\nChild[Child]\nend`);
 expect(usecase.nodes[1].parentId).toBe(''); expect(fromMermaidUseCase(toMermaidUseCase(usecase))).toEqual(usecase);
 expect(() => fromMermaidUseCase(`usecase-beta\nsystemBoundary ${escapeMermaidId('')}[Group]\nsystemBoundary second`)).toThrow('nested');
});
it('GitGraph changing only the canonical main branch updates inherited branch references', () => {
 const graph = fromMermaidGitGraph('%%{init: {"gitGraph":{"mainBranchName":"trunk"}}}%%\ngitGraph\ncommit id: "a"\nbranch feature\ncommit id: "b"\ncheckout trunk\ncommit id: "c"');
 graph.data.mainBranch = 'live';
 const parsed = fromMermaidGitGraph(toMermaidGitGraph(graph));
 expect(parsed.nodes.map((node) => node.data.branch)).toEqual(['live', 'feature', 'live']);
 expect(parsed.data.actions[3]).toEqual({ kind: 'checkout', name: 'live' });
 expect(graph.nodes[0].data.branch).toBe('trunk');
});
it('handles a ten-thousand-node flat architecture and a five-hundred-level C4 hierarchy iteratively', () => {
 const source = `architecture-beta\n${Array.from({ length: 10000 }, (_, index) => `service n${index}[Node]`).join('\n')}`;
 expect(fromMermaidArchitecture(toMermaidArchitecture(fromMermaidArchitecture(source))).nodes).toHaveLength(10000);
 const c4 = `C4Container\n${Array.from({ length: 500 }, (_, index) => `Container_Boundary(g${index}, "Group") {`).join('\n')}\nContainer(leaf, "Leaf", "JS")\n${Array.from({ length: 500 }, () => '}').join('\n')}`;
 const graph = fromMermaidC4(c4);
 expect(fromMermaidC4(toMermaidC4(graph)).nodes.at(-1)?.parentId).toBe('g499');
});
it('rejects unsafe native display text while retaining JSON-escaped data and encoded IDs', () => {
 for (const label of ['A\u0000B', 'A\ud800B', 'A\udc00B']) {
  const document = mermaidUseCaseDocumentConverter.from('usecase-beta\nA("Before")');
  document.graph!.nodes[0].label = label; expect(() => mermaidUseCaseDocumentConverter.to(document)).toThrow('display');
 }
 const graph = fromMermaidUseCase(`usecase-beta\nA("Astral 😀")\njson Payload@{ "nul": "\\u0000", "surrogate": "\\ud800" }`);
 expect(fromMermaidUseCase(toMermaidUseCase(graph)).nodes[1].data.value).toEqual({ nul: '\u0000', surrogate: '\ud800' });
 const architecture = fromMermaidArchitecture(`architecture-beta\nservice ${escapeMermaidId('\ud800')}[Safe]`);
 expect(fromMermaidArchitecture(toMermaidArchitecture(architecture)).nodes[0].id).toBe('\ud800');
 const opaque = mermaidUseCaseDocumentConverter.from('usecase-beta\nA("#0;")'); expect(opaque.graph).toBeNull(); expect(mermaidUseCaseDocumentConverter.to(opaque)).toBe('usecase-beta\nA("#0;")');
});

it('normalizes C4 reverse markers while positional relations remain forward', () => {
 const graph = fromMermaidC4('C4Context\nPerson(a, "A")\nPerson(b, "B")\nPerson(c, "C")\nRel_Back(a,b,"Back")\nRel_L(a,c,"Left")');
 expect(graph.edges.map(({ sourceId, targetId }) => [sourceId, targetId])).toEqual([['b', 'a'], ['a', 'c']]);
 expect(toMermaidC4(graph)).toContain('Rel_Back(a, b, "Back")');
 expect(fromMermaidC4(toMermaidC4(graph))).toEqual(graph);
 graph.edges[0].sourceId = 'a'; graph.edges[0].targetId = 'b';
 expect(toMermaidC4(graph)).toContain('Rel_Back(b, a, "Back")');
});

it('rejects repeated C4 native relationship pairs instead of claiming parallel native edges', () => {
 expect(() => fromMermaidC4('C4Context\nPerson(a,"A")\nPerson(b,"B")\nRel_Back(a,b,"Back")\nRel_U(a,b,"Up")')).toThrow('repeated native relationship');
 const document = mermaidC4DocumentConverter.from('C4Context\nPerson(a,"A")\nPerson(b,"B")\nRel(a,b,"First")\nRel(a,b,"Last")');
 expect(document.graph).toBeNull();
 expect(mermaidC4DocumentConverter.to(document)).toBe(document.source);
});

it('guards C4 display titles without restricting JSON-escaped opaque data', () => {
 const graph = fromMermaidC4('C4Context\ntitle Astral 😀\nPerson(a,"A")');
 expect(toMermaidC4(graph)).toContain('title Astral 😀');
 graph.data.title = 'Lost\u0000'; expect(() => toMermaidC4(graph)).toThrow('display');
 expect(() => fromMermaidC4('C4Context\ntitle Lost\ud800\nPerson(a,"A")')).toThrow('Unicode');
});
