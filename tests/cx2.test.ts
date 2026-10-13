import { expect, it } from 'vitest';
import { fromCX2, toCX2, cx2DocumentConverter } from '../src/formats/cx2';
import { createGraph } from '../src/graph';
const source: any = [
  { CXVersion: '2.0', hasFragments: false },
  {
    attributeDeclarations: [
      {
        nodes: {
          name: { d: 'string', a: 'n' },
          score: { d: 'double', v: 2 },
          active: { d: 'boolean', v: false },
        },
        edges: { name: { d: 'string' }, weight: { d: 'double' } },
      },
    ],
  },
  {
    nodes: [
      { id: 0, x: 1, y: 2, v: { n: '', score: 3 } },
      { id: 1, x: 3, y: 4, v: { n: '東京' } },
    ],
  },
  {
    edges: [
      { id: 2, s: 0, t: 1, v: { name: 'Go', weight: 2 } },
      { id: 3, s: 0, t: 1 },
      { id: 4, s: 0, t: 0 },
    ],
  },
  { visualProperties: [{ default: { node: { NODE_FILL_COLOR: '#fff' } } }] },
  { vendor: [{ opaque: true }] },
  { status: [{ success: true }] },
];
it('resolves aliases/defaults without losing topology/empty labels', () => {
  const graph = fromCX2(source);
  expect(graph.nodes[0]).toMatchObject({
    id: '0',
    label: '',
    x: 1,
    y: 2,
    data: { attributes: { score: 3, active: false } },
  });
  expect(graph.nodes[1].data.attributes!.score).toBe(2);
  expect(graph.edges.map((e) => [e.id, e.sourceId, e.targetId])).toEqual([
    ['2', '0', '1'],
    ['3', '0', '1'],
    ['4', '0', '0'],
  ]);
  expect(toCX2(JSON.parse(JSON.stringify(graph)))).toEqual(source);
});
it('patches known labels/typed properties while preserving opaque aspects/field presence', () => {
  const doc = cx2DocumentConverter.from(source);
  expect(cx2DocumentConverter.to(JSON.parse(JSON.stringify(doc)))).toEqual(
    source
  );
  doc.graph!.nodes[0].label = 'After';
  doc.graph!.nodes[1].data.attributes!.score = 4;
  const output = cx2DocumentConverter.to(doc);
  expect(output[4]).toEqual(source[4]);
  expect(output[5]).toEqual(source[5]);
  expect((output[2] as any).nodes[0].v).toEqual({ n: 'After', score: 3 });
  expect(fromCX2(output).nodes[1].data.attributes!.score).toBe(4);
});
it('fresh export accepts canonical numeric identities and rejects arbitrary IDs', () => {
  const graph = createGraph({
    nodes: [
      { id: '0', label: 'A' },
      { id: '1', label: 'B' },
    ],
    edges: [{ id: '2', sourceId: '0', targetId: '1', label: 'Go' }],
  });
  const parsed = fromCX2(toCX2(graph));
  expect(parsed.edges[0]).toMatchObject({
    id: '2',
    sourceId: '0',
    label: 'Go',
  });
  graph.nodes[0].id = 'named';
  graph.edges[0].sourceId = 'named';
  expect(() => toCX2(graph, { nativeCarrier: false })).toThrow(/canonical/);
});
it('widens inferred mixed numeric scalars and lists regardless of value order', () => {
  const graph = createGraph({
    nodes: [
      {
        id: '0',
        data: { attributes: { score: 1, samples: [1, 1.5] } },
      },
      { id: '1', data: { attributes: { score: 1.5 } } },
    ],
  });
  const output: any = toCX2(graph);
  const declarations = output[1].attributeDeclarations[0].nodes;
  expect(declarations.score.d).toBe('double');
  expect(declarations.samples.d).toBe('list_of_double');
  expect(fromCX2(output).nodes.map((node) => node.data.attributes?.score)).toEqual([
    1,
    1.5,
  ]);
});
it.each([
  (s: any) => s[2].nodes.push({ id: 0 }),
  (s: any) => (s[3].edges[0].t = 99),
  (s: any) => (s[2].nodes[0].id = 9007199254740992),
  (s: any) => (s[2].nodes[0].v.score = 'heavy'),
  (s: any) => (s[2].nodes[0].v.name = 'full alias'),
  (s: any) => s.pop(),
  (s: any) => delete s[2].nodes[1].y,
])('rejects malformed native inputs', (mutate) => {
  const value = JSON.parse(JSON.stringify(source));
  mutate(value);
  expect(() => fromCX2(value)).toThrow();
});
it('rejects structural/data type edits and retains unsupported source in documents', () => {
  const doc = cx2DocumentConverter.from(source);
  doc.graph!.nodes[0].data.attributes!.score = 'heavy';
  expect(() => cx2DocumentConverter.to(doc)).toThrow();
  const malformed = JSON.parse(JSON.stringify(source));
  malformed[3].edges[0].t = 99;
  const native = cx2DocumentConverter.from(malformed);
  expect(native.graph).toBeNull();
  expect(cx2DocumentConverter.to(native)).toEqual(malformed);
});

it.each(['hidden', 'sparse-custom'])(
  'rejects arrays that JSON cloning would silently change: %s',
  (kind) => {
    const value = JSON.parse(JSON.stringify(source));
    if (kind === 'hidden')
      Object.defineProperty(value, 'hidden', {
        value: value.length,
        enumerable: false,
      });
    else {
      delete value[0];
      Object.defineProperty(value, 'custom', {
        value: { CXVersion: '2.0' },
        enumerable: true,
      });
    }
    expect(() => fromCX2(value)).toThrow(/JSON|array|sparse/);
  }
);
it('rejects late fragmented declarations whose defaults could change earlier records', () => {
  const value = JSON.parse(JSON.stringify(source));
  value[0].hasFragments = true;
  value.splice(3, 0, {
    attributeDeclarations: [{ nodes: { late: { d: 'boolean', v: false } } }],
  });
  expect(() => fromCX2(value)).toThrow(/late|declaration/);
});
it('keeps null typed attributes outside the interpreted profile, retaining native documents', () => {
  const value = JSON.parse(JSON.stringify(source));
  value[2].nodes[0].v.score = null;
  expect(() => fromCX2(value)).toThrow(/numeric/);
  const document = cx2DocumentConverter.from(value);
  expect(document.graph).toBeNull();
  expect(cx2DocumentConverter.to(document)).toEqual(value);
});

it('native label edits win over stale carrier fields and conflicts remain explicit', () => {
  const graph = fromCX2(source);
  (graph.data as any).__statelyaiNative.native[2].nodes[0].v.n = 'Native';
  expect(fromCX2(toCX2(graph)).nodes[0].label).toBe('Native');
  graph.nodes[0].label = 'Graph';
  expect(() => toCX2(graph)).toThrow(/conflict/);
});
it('preserves independently edited opaque aspects alongside Graph label changes', () => {
  const doc = cx2DocumentConverter.from(source);
  doc.source[5].vendor[0].opaque = 'native';
  doc.graph!.nodes[0].label = 'Graph';
  const out = cx2DocumentConverter.to(doc);
  expect(out[5].vendor[0].opaque).toBe('native');
  expect(fromCX2(out).nodes[0].label).toBe('Graph');
});
it('concatenates supported fragments without allowing late declarations', () => {
  const value: any = [
    { CXVersion: '2.0', hasFragments: true },
    { attributeDeclarations: [{ nodes: { name: { d: 'string' } } }] },
    { nodes: [{ id: 0, v: { name: 'A' } }] },
    { edges: [{ id: 5, s: 0, t: 1 }] },
    { nodes: [{ id: 1, v: { name: 'B' } }] },
    { status: [{ success: true }] },
  ];
  expect(fromCX2(value).nodes.map((n) => n.id)).toEqual(['0', '1']);
  expect(toCX2(fromCX2(value))).toEqual(value);
});
it('handles 10k numeric topology and label edits with stable IDs', () => {
  const value: any = [
    { CXVersion: '2.0' },
    { attributeDeclarations: [{ nodes: { name: { d: 'string' } } }] },
    {
      nodes: Array.from({ length: 10000 }, (_, id) => ({
        id,
        v: { name: 'Before' },
      })),
    },
    {
      edges: Array.from({ length: 9999 }, (_, id) => ({
        id,
        s: id,
        t: id + 1,
      })),
    },
    { status: [{ success: true }] },
  ];
  const document = cx2DocumentConverter.from(value);
  for (const node of document.graph!.nodes) node.label = `After ${node.id}`;
  const graph = fromCX2(cx2DocumentConverter.to(document));
  expect(graph.nodes).toHaveLength(10000);
  expect(graph.edges).toHaveLength(9999);
  expect(graph.nodes[9999].label).toBe('After 9999');
}, 30000);

it.each([
  ['string', '', true],
  ['boolean', false, true],
  ['integer', -2147483648, true],
  ['integer', 2147483648, false],
  ['long', Number.MAX_SAFE_INTEGER, true],
  ['long', Number.MAX_SAFE_INTEGER + 1, false],
  ['double', 0.5, true],
  ['double', Infinity, false],
  ['list_of_string', ['', '東京'], true],
  ['list_of_boolean', [false, true], true],
  ['list_of_integer', [0, 2], true],
  ['list_of_double', [0.5, 3], true],
  ['list_of_long', [Number.MAX_SAFE_INTEGER], true],
  ['list_of_string', [1], false],
  ['integer', '3', false],
  ['string', null, false],
  ['unknown', 1, false],
] as Array<[string, any, boolean]>)(
  'validates declared %s values without changing types (%j)',
  (type, value, valid) => {
    const input: any = [
      { CXVersion: '2.0' },
      { attributeDeclarations: [{ nodes: { value: { d: type } } }] },
      { nodes: [{ id: 1, v: { value } }] },
      { status: [{ success: true }] },
    ];
    if (valid)
      expect(fromCX2(input).nodes[0].data.attributes!.value).toEqual(value);
    else expect(() => fromCX2(input)).toThrow();
  }
);
it.each([
  (s: any) => (s[0].CXVersion = '1.0'),
  (s: any) => (s[0].hasFragments = 'false'),
  (s: any) => (s[6].status[0].success = false),
  (s: any) => s.splice(3, 0, { nodes: [] }),
  (s: any) => (s[1].attributeDeclarations[0].nodes.score.a = 'n'),
  (s: any) => (s[1].attributeDeclarations[0].nodes.name.d = 'double'),
  (s: any) => (s[1].attributeDeclarations[0].nodes.name.a = 'id'),
  (s: any) =>
    (s[1].attributeDeclarations[0].networkAttributes = {
      name: { d: 'string', a: 'n' },
    }),
  (s: any) =>
    (s[1].attributeDeclarations[0].networkAttributes = {
      name: { d: 'string', v: 'default' },
    }),
  (s: any) => (s[1].attributeDeclarations[0].nodes.id = { d: 'long' }),
  (s: any) => s[3].edges.push({ ...s[3].edges[0] }),
  (s: any) => (s[2].nodes[0].z = 1),
  (s: any) => (s[2].nodes[0].x = null),
  (s: any) =>
    s.splice(1, 0, { metaData: [{ name: 'nodes', elementCount: 999 }] }),
  (s: any) =>
    s.splice(3, 0, { metaData: [{ name: 'nodes', elementCount: 2 }] }),
  (s: any) => (s[2].extra = []),
])('rejects invalid declaration/envelope/coordinate state %#', (mutate) => {
  const value = JSON.parse(JSON.stringify(source));
  mutate(value);
  expect(() => fromCX2(value)).toThrow();
});
it('handles numeric defaults encoded as lexical strings and explicit absent/empty/null labels', () => {
  const value: any = [
    { CXVersion: '2.0' },
    {
      attributeDeclarations: [
        { nodes: { name: { d: 'string' }, score: { d: 'double', v: '0.0' } } },
      ],
    },
    { nodes: [{ id: -1 }, { id: 0, v: { name: '' } }] },
    { status: [{ success: true }] },
  ];
  const graph = fromCX2(value);
  expect(graph.nodes.map((n) => n.label)).toEqual([null, '']);
  expect(graph.nodes[0].data.attributes).toEqual({ score: 0 });
  const doc = cx2DocumentConverter.from(value);
  doc.graph!.nodes[1].label = null;
  expect(fromCX2(cx2DocumentConverter.to(doc)).nodes[1].label).toBeNull();
});
it('supports declared empty lists and rejects ambiguous fresh inferred values/data collisions', () => {
  const graph = createGraph({
    nodes: [{ id: '1', label: 'A', data: { attributes: { values: [] } } }],
  });
  expect(() => toCX2(graph)).toThrow(/declaration/);
  graph.data = { declarations: { nodes: { values: { d: 'list_of_string' } } } };
  expect(fromCX2(toCX2(graph)).nodes[0].data.attributes!.values).toEqual([]);
  (graph.nodes[0].data as any).attributes = { name: 'collision' };
  expect(() => toCX2(graph)).toThrow(/collision/);
});
it('rejects JSON functions/cycles/accessors/classes and preserves prototype-like declared keys', () => {
  for (const value of [() => 1, new Date(), undefined, Symbol('x')]) {
    const input = JSON.parse(JSON.stringify(source));
    input[5].vendor[0].opaque = value;
    expect(() => fromCX2(input)).toThrow(/JSON/);
  }
  const cycle: any = [];
  cycle.push(cycle);
  expect(() => fromCX2(cycle)).toThrow(/JSON/);
  const input = JSON.parse(JSON.stringify(source));
  Object.defineProperty(input[5].vendor[0], 'opaque', {
    get() {
      throw new Error('getter must not execute');
    },
    enumerable: true,
  });
  expect(() => fromCX2(input)).toThrow(/accessor/);
  const safe: any = JSON.parse(
    '[{"CXVersion":"2.0"},{"attributeDeclarations":[{"nodes":{"__proto__":{"d":"string"},"constructor":{"d":"string"}}}]},{"nodes":[{"id":0,"v":{"__proto__":"safe","constructor":"data"}}]},{"status":[{"success":true}]}]'
  );
  expect(
    Object.hasOwn(fromCX2(safe).nodes[0].data.attributes!, '__proto__')
  ).toBe(true);
  expect(toCX2(fromCX2(safe))).toEqual(safe);
});
it('rejects unsupported structure/root/schema/coordinate edits and detects same-label conflicts', () => {
  for (const edit of [
    (g: any) => g.nodes.pop(),
    (g: any) => (g.nodes[0].x = 9),
    (g: any) => (g.nodes[0].data = { vendor: 42 }),
    (g: any) => (g.data.attributes = { name: 'changed' }),
    (g: any) => (g.data.declarations.nodes.score.d = 'integer'),
  ]) {
    const doc = cx2DocumentConverter.from(source);
    edit(doc.graph);
    expect(() => cx2DocumentConverter.to(doc)).toThrow();
  }
  const doc = cx2DocumentConverter.from(source);
  doc.source[2].nodes[0].v.n = 'Native';
  doc.graph!.nodes[0].label = 'Graph';
  expect(() => cx2DocumentConverter.to(doc)).toThrow(/conflict/);
});

it('does not silently convert null labels into declared name defaults', () => {
  const graph = createGraph({
    data: {
      declarations: { nodes: { name: { d: 'string' as const, v: 'default' } } },
    },
    nodes: [{ id: '0', label: null }],
  });
  expect(() => toCX2(graph)).toThrow(/default/);
});

it.each([
  ['nodes', 'alias', 'string'],
  ['nodes', 'represents', 'long'],
  ['networkAttributes', 'name', 'integer'],
  ['networkAttributes', 'description', 'boolean'],
  ['networkAttributes', 'version', 'double'],
])('honors reserved %s.%s native declaration types', (aspect, name, type) => {
  const input: any = [
    { CXVersion: '2.0' },
    { attributeDeclarations: [{ [aspect]: { [name]: { d: type } } }] },
    { status: [{ success: true }] },
  ];
  expect(() => fromCX2(input)).toThrow(/requires/);
});
it('distinguishes ordinary x/y/z attributes from native coordinate fields and retains opaque z', () => {
  const input: any = [
    { CXVersion: '2.0' },
    {
      attributeDeclarations: [
        { nodes: { name: { d: 'string' }, x: { d: 'double' } } },
      ],
    },
    {
      nodes: [
        { id: 0, x: 1, y: 2, z: 0, v: { name: 'A', x: 99 } },
        { id: 1, x: 3, y: 4, z: 5, v: { name: 'B', x: 98 } },
      ],
    },
    { status: [{ success: true }] },
  ];
  const graph = fromCX2(input);
  expect(graph.nodes[0].x).toBe(1);
  expect(graph.nodes[0].data.attributes!.x).toBe(99);
  const doc = cx2DocumentConverter.from(input);
  doc.graph!.nodes[0].label = 'After';
  const output = cx2DocumentConverter.to(doc);
  expect(output[2].nodes[0].z).toBe(0);
  expect(output[2].nodes[1].z).toBe(5);
});

it('never silently drops non-JSON declaration extensions during fresh export', () => {
  const graph = createGraph({
    data: {
      declarations: {
        nodes: { name: { d: 'string' as const, extra: () => 1 } },
      },
    },
    nodes: [{ id: '0', label: 'A' }],
  });
  expect(() => toCX2(graph)).toThrow(/JSON/);
  const valid = createGraph({
    data: {
      declarations: { nodes: { name: { d: 'string' as const, a: undefined } } },
    },
    nodes: [{ id: '0', label: 'A' }],
  });
  expect(fromCX2(toCX2(valid)).nodes[0].label).toBe('A');
});
