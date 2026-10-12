import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import { jgfDocumentConverter } from '../src/formats/jgf';
import { graphologyDocumentConverter } from '../src/formats/graphology';
import { networkxDocumentConverter } from '../src/formats/networkx';
import { plantumlDocumentConverter, toPlantUML } from '../src/formats/plantuml';
import { pajekDocumentConverter, toPajek } from '../src/formats/pajek';

type Case = {
  name: string;
  converter: any;
  base: any;
  insert(source: any): any;
  records(source: any): any[];
};
const cases: Case[] = [
  {
    name: 'JGF',
    converter: jgfDocumentConverter,
    base: {
      graph: {
        nodes: [{ id: 'a' }, { id: 'b' }],
        edges: [
          {
            source: 'a',
            target: 'b',
            label: 'Same',
            metadata: { Marker: 'original' },
          },
        ],
      },
    },
    insert(source) {
      source.graph.edges.unshift({
        id: 'e0',
        source: 'a',
        target: 'b',
        label: 'Same',
        metadata: { Marker: 'inserted' },
      });
      return source;
    },
    records: (source) => source.graph.edges,
  },
  {
    name: 'Graphology',
    converter: graphologyDocumentConverter,
    base: {
      options: { type: 'directed', multi: true },
      attributes: {},
      nodes: [{ key: 'a' }, { key: 'b' }],
      edges: [
        {
          source: 'a',
          target: 'b',
          attributes: { label: 'Same', Marker: 'original' },
        },
      ],
    },
    insert(source) {
      source.edges.unshift({
        key: 'e0',
        source: 'a',
        target: 'b',
        attributes: { label: 'Same', Marker: 'inserted' },
      });
      return source;
    },
    records: (source) => source.edges,
  },
  {
    name: 'NetworkX',
    converter: networkxDocumentConverter,
    base: {
      directed: true,
      multigraph: true,
      graph: {},
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ source: 'a', target: 'b', label: 'Same', Marker: 'original' }],
    },
    insert(source) {
      source.edges.unshift({
        source: 'a',
        target: 'b',
        key: 0,
        label: 'Same',
        Marker: 'inserted',
      });
      return source;
    },
    records: (source) => source.edges,
  },
  {
    name: 'PlantUML',
    converter: plantumlDocumentConverter,
    base: '@startuml\ncomponent "A" as a\ncomponent "B" as b\n\' original\na --> b : Same\n@enduml',
    insert(source) {
      return source.replace(
        "' original\na --> b : Same",
        "' inserted\na --> b : Same\n' original\na --> b : Same"
      );
    },
    records: () => [],
  },
  {
    name: 'Pajek',
    converter: pajekDocumentConverter,
    base: '*Vertices 2\n1 "A"\n2 "B"\n*Arcs\n% original\n1 2 1 l "Same"\n',
    insert(source) {
      return source.replace(
        '% original\n1 2 1 l "Same"',
        '% inserted\n1 2 1 l "Same"\n% original\n1 2 1 l "Same"'
      );
    },
    records: () => [],
  },
];
function getClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}
function getChangedSequence(
  test: Case,
  operation: 'insert' | 'remove' | 'reorder'
) {
  let source = getClone(test.base);
  if (operation === 'insert')
    return { base: source, changed: test.insert(getClone(source)) };
  if (typeof source !== 'string') {
    const rows = test.records(source),
      second = getClone(rows[0]);
    if (test.name === 'JGF') second.metadata.Marker = 'second';
    else if (test.name === 'Graphology') second.attributes.Marker = 'second';
    else second.Marker = 'second';
    rows.push(second);
    const changed = getClone(source),
      records = test.records(changed);
    if (operation === 'remove') records.shift();
    else records.reverse();
    return { base: source, changed };
  }
  const first =
    test.name === 'PlantUML'
      ? "' original\na --> b : Same"
      : '% original\n1 2 1 l "Same"';
  const second =
    test.name === 'PlantUML'
      ? "' second\na --> b : Same"
      : '% second\n1 2 1 l "Same"';
  source = source.replace(first, first + '\n' + second);
  return {
    base: source,
    changed: source.replace(
      first + '\n' + second,
      operation === 'remove' ? second : second + '\n' + first
    ),
  };
}

describe('remaining generated document identity guards', () => {
  for (const test of cases) {
    it.each(['insert', 'remove', 'reorder'] as const)(
      `${test.name}: rejects pending edge edits after %s`,
      (operation) => {
        const { base, changed } = getChangedSequence(test, operation),
          document = test.converter.from(base);
        expect(document.graph).not.toBeNull();
        document.source = changed;
        document.graph.edges[0].label = 'Graph edit';
        const result = test.converter.getUpdate(document);
        expect(result.ok).toBe(false);
        if (!result.ok)
          expect(result.diagnostics).toContainEqual(
            expect.objectContaining({
              code: 'ambiguous-native-identity',
              path: expect.stringContaining('/edges/'),
            })
          );
        expect(() => test.converter.to(document)).toThrow(
          /identity|ambiguous/i
        );
      }
    );
    it(`${test.name}: keeps changed source authoritative without a Graph edit`, () => {
      const document = test.converter.from(test.base);
      document.source = test.insert(getClone(test.base));
      expect(test.converter.to(document)).toEqual(document.source);
    });
    it(`${test.name}: node-ID edits survive independent native edge insertion`, () => {
      const document = test.converter.from(test.base);
      document.source = test.insert(getClone(test.base));
      document.graph.nodes[0].label = 'Node edit';
      const output = test.converter.to(document),
        projected = test.converter.from(output).graph;
      expect(
        projected.nodes.find(
          (node: any) => node.id === document.graph.nodes[0].id
        )?.label
      ).toBe('Node edit');
      expect(projected.edges.map((edge: any) => edge.label)).toEqual([
        'Same',
        'Same',
      ]);
    });
    it(`${test.name}: unchanged native sequences retain ordinary edge edit support`, () => {
      const document = test.converter.from(test.base);
      document.graph.edges[0].label = 'Graph edit';
      expect(
        test.converter.from(test.converter.to(document)).graph.edges[0].label
      ).toBe('Graph edit');
    });
  }
});

it.each(cases.slice(0, 3))(
  '$name: stable explicit native identities allow insertion/reordering',
  (test) => {
    const source = getClone(test.base),
      original = test.records(source)[0];
    if (test.name === 'JGF') original.id = 'original';
    else if (test.name === 'Graphology') original.key = 'original';
    else original.key = false;
    const document = test.converter.from(source);
    document.source = test.insert(getClone(source));
    if (test.name === 'NetworkX') document.source.edges[0].key = 1;
    document.graph.edges[0].label = 'Graph edit';
    const output = test.converter.to(document),
      records = test.records(output);
    const label = (record: any) =>
      test.name === 'Graphology' ? record.attributes.label : record.label;
    expect(label(records[0])).toBe('Same');
    expect(label(records[1])).toBe('Graph edit');
  }
);
it.each(cases.slice(0, 3))(
  '$name: explicit identities survive native reordering',
  (test) => {
    const source = getClone(test.base),
      first = test.records(source)[0];
    if (test.name === 'JGF') first.id = 'original';
    else if (test.name === 'Graphology') first.key = 'original';
    else first.key = false;
    test.insert(source);
    if (test.name === 'NetworkX') source.edges[0].key = 1;
    const document = test.converter.from(source);
    document.source = getClone(source);
    test.records(document.source).reverse();
    document.graph.edges[1].label = 'Graph edit';
    const output = test.records(test.converter.to(document));
    const label = (record: any) =>
      test.name === 'Graphology' ? record.attributes.label : record.label;
    expect(output.map(label)).toEqual(['Graph edit', 'Same']);
  }
);
it.each(cases.slice(0, 3))(
  '$name: removing an explicit key cannot bless generated current identity',
  (test) => {
    const source = getClone(test.base),
      first = test.records(source)[0];
    if (test.name === 'JGF') first.id = 'e0';
    else if (test.name === 'Graphology') first.key = 'e0';
    else first.key = 0;
    const document = test.converter.from(source);
    delete test.records(document.source)[0][test.name === 'JGF' ? 'id' : 'key'];
    document.graph.edges[0].label = 'Graph edit';
    expect(() => test.converter.to(document)).toThrow(/identity|ambiguous/i);
  }
);
it.each(cases)('$name: persisted baseline retains identity guards', (test) => {
  const document = getClone(test.converter.from(test.base));
  document.source = test.insert(getClone(test.base));
  document.graph.edges[0].label = 'Graph edit';
  expect(() => test.converter.to(document)).toThrow(/identity|ambiguous/i);
});
it('NetworkX: simple endpoint identity is stable without explicit keys', () => {
  const source: any = {
    directed: true,
    multigraph: false,
    graph: {},
    nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    edges: [{ source: 'a', target: 'b', label: 'Same' }],
  };
  const document = networkxDocumentConverter.from(source);
  document.source.edges!.unshift({ source: 'a', target: 'c', label: 'Same' });
  document.graph!.edges[0].label = 'Graph edit';
  expect(
    networkxDocumentConverter.to(document).edges!.map((edge) => edge.label)
  ).toEqual(['Same', 'Graph edit']);
});
it('NetworkX: Python-equivalent explicit boolean/numeric keys remain the same identity', () => {
  const source: any = {
    directed: true,
    multigraph: true,
    graph: {},
    nodes: [{ id: 'a' }, { id: 'b' }],
    edges: [{ source: 'a', target: 'b', key: false, label: 'Same' }],
  };
  const document = networkxDocumentConverter.from(source);
  document.source.edges![0].key = 0;
  document.graph!.edges[0].label = 'Graph edit';
  expect(networkxDocumentConverter.to(document).edges![0]).toMatchObject({
    key: 0,
    label: 'Graph edit',
  });
});
it.each(['PlantUML', 'Pajek'])(
  '%s: genuine occurrence-indexed sidecars cannot bless inserted relationships',
  (name) => {
    const graph = createGraph({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      edges: [
        {
          id: 'original-edge',
          sourceId: 'a',
          targetId: 'b',
          label: 'Same',
          data: { Marker: 'original' },
        },
      ],
    });
    const converter =
      name === 'PlantUML' ? plantumlDocumentConverter : pajekDocumentConverter;
    const source = name === 'PlantUML' ? toPlantUML(graph) : toPajek(graph),
      document = converter.from(source);
    expect(document.graph!.edges[0].id).toBe('original-edge');
    if (name === 'PlantUML') {
      const row = source
        .split(/\r?\n/)
        .find((line) => !line.trimStart().startsWith("'") && /-->/.test(line))!;
      document.source = source.replace(
        row,
        "' inserted\n" + row + "\n' original\n" + row
      );
    } else {
      const row = source.split(/\r?\n/).find((line) => /^\d+ \d+ /.test(line))!;
      document.source = source.replace(
        row,
        '% inserted\n' + row + '\n% original\n' + row
      );
    }
    document.graph!.edges[0].label = 'Graph edit';
    expect(() => converter.to(document)).toThrow(/identity|ambiguous/i);
  }
);
it('PlantUML: block comments distinguish otherwise identical relationship reordering', () => {
  const source =
    '@startuml\ncomponent "A" as a\ncomponent "B" as b\n/\' first\nmarker first\n\'/\na --> b : Same\n/\' second\nmarker second\n\'/\na --> b : Same\n@enduml';
  const document = plantumlDocumentConverter.from(source);
  document.source = source
    .replace('marker first', 'temporary')
    .replace('marker second', 'marker first')
    .replace('temporary', 'marker second');
  document.graph!.edges[0].label = 'Graph edit';
  expect(() => plantumlDocumentConverter.to(document)).toThrow(
    /identity|ambiguous/i
  );
});
