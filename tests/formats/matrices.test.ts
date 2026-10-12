import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src/graph';
import { toAdjacencyMatrix, fromAdjacencyMatrix, adjacencyMatrixDocumentConverter } from '../../src/formats/adjacency-matrix';
import { toMatrixMarket, fromMatrixMarket, matrixMarketDocumentConverter } from '../../src/formats/matrix-market';
import { getNativeDocumentGraph } from '../../src/formats/preservation';
function getPersisted<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function createFixture(mode: 'directed' | 'undirected' = 'directed') {
  return createGraph<any, any, any>({ mode, id: 'matrix', data: [null, 'root'], nodes: [{ id: '__proto__', label: '', data: 42, ports: [{ name: 'p', data: null }] }, { id: 'constructor', label: null, data: { weight: 'user' } }, { id: 'isolated', data: null }], edges: [{ id: 'zero', sourceId: '__proto__', targetId: 'constructor', weight: 0, data: ['edge'] }, { id: 'negative', sourceId: 'constructor', targetId: 'constructor', weight: -2.5 }, { id: 'default', sourceId: 'isolated', targetId: '__proto__' }] });
}
describe('adjacency matrix explicit profile', () => {
  it.each(['directed', 'undirected'] as const)('round-trips complete Graph JSON in %s mode including zero presence and isolates', (mode) => {
    const graph = createFixture(mode), source = toAdjacencyMatrix(graph); expect(source.nodeIds).toEqual(graph.nodes.map((node) => node.id));
    expect(source.matrix[0][1]).toBe(0); expect(source.presence![0][1]).toBe(true); expect(source.matrix[1][1]).toBe(-2.5);
    const restored = getNativeDocumentGraph(fromAdjacencyMatrix(getPersisted(source)), 'adjacency-matrix', source); expect(getPersisted(restored)).toEqual(getPersisted(graph));
    const doc = getPersisted(adjacencyMatrixDocumentConverter.from(source)); expect(adjacencyMatrixDocumentConverter.to(doc)).toEqual(source);
    doc.graph!.edges[0].weight = -4; const output = adjacencyMatrixDocumentConverter.to(doc); expect(output.matrix[0][1]).toBe(-4); if (mode === 'undirected') expect(output.matrix[1][0]).toBe(-4);
  });
  it('plain native zero absence, empty IDs and null foreign metadata are retained', () => {
    const source = { nodeIds: ['', '__proto__'], matrix: [[0, -1], [0, 0]], mode: 'directed' as const, __statelyai: null, extension: [1, null] };
    const doc = getPersisted(adjacencyMatrixDocumentConverter.from(source)); expect(doc.graph!.edges).toHaveLength(1); expect(adjacencyMatrixDocumentConverter.to(doc)).toEqual(source);
    doc.graph!.edges[0].weight = 0; const output = adjacencyMatrixDocumentConverter.to(doc); expect(output.presence![0][1]).toBe(true); expect(output.extension).toEqual([1, null]); expect(output.__statelyai).toBeNull();
  });
  it('current row order, coefficients and presence override snapshots without losing surviving identity', () => {
    const source = toAdjacencyMatrix(createFixture()); source.matrix[1][1] = -3; source.presence![0][1] = false;
    const graph = fromAdjacencyMatrix(source); expect(graph.edges.map((edge) => edge.id)).toEqual(['negative', 'default']); expect(graph.edges[0].weight).toBe(-3);
    source.nodeIds.reverse(); const reinterpreted = fromAdjacencyMatrix(source); expect(reinterpreted.nodes.map((node) => node.id)).toEqual(source.nodeIds); expect(reinterpreted.edges.some((edge) => edge.sourceId === '__proto__' && edge.targetId === 'isolated')).toBe(true);
  });
  it('new native coefficients inherit actual matrix direction over an authored root override', () => {
    const graph = createGraph({ mode: 'directed', nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'u', sourceId: 'a', targetId: 'b', mode: 'undirected', weight: 1 }] });
    const source = toAdjacencyMatrix(graph); source.matrix[1][2] = 2; source.matrix[2][1] = 2;
    const restored = fromAdjacencyMatrix(source); const added = restored.edges.find((edge) => edge.id !== 'u')!; expect(added.mode ?? restored.mode).toBe('undirected');
  });
  it.each(['sum', 'min', 'max', 'count'] as const)('explicit %s aggregation retains original IDs but rejects ambiguous coefficient edits', (aggregation) => {
    const graph = createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'x', sourceId: 'a', targetId: 'b', weight: 2 }, { id: 'y', sourceId: 'a', targetId: 'b', weight: -1 }] });
    expect(() => toAdjacencyMatrix(graph)).toThrow('parallel'); const source = toAdjacencyMatrix(graph, { aggregation });
    expect(source.matrix[0][1]).toBe({ sum: 1, min: -1, max: 2, count: 2 }[aggregation]); expect(fromAdjacencyMatrix(source).edges.map((edge) => edge.id)).toEqual(['x', 'y']);
    source.matrix[0][1] += 1; expect(() => fromAdjacencyMatrix(source)).toThrow('ambiguous');
  });
  it('maxCells rejects before dense allocation, sparse format remains practical', () => {
    const graph = createGraph({ nodes: Array.from({ length: 20000 }, (_, index) => ({ id: `n${index}` })), edges: [{ id: 'edge', sourceId: 'n0', targetId: 'n19999', weight: 0 }] });
    expect(() => toAdjacencyMatrix(graph)).toThrow('maxCells'); const text = toMatrixMarket(graph); expect(text).toContain('20000 20000 1'); expect(fromMatrixMarket(text).nodes).toHaveLength(20000);
  });
  it('count coefficients never infer individual weights, even for one original edge', () => {
    const graph = createGraph({ nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e', sourceId: 'a', targetId: 'b', weight: 7 }] });
    const source = toAdjacencyMatrix(graph, { aggregation: 'count' }); expect(fromAdjacencyMatrix(source).edges[0].weight).toBe(7); expect(toAdjacencyMatrix(fromAdjacencyMatrix(source)).matrix[0][1]).toBe(1);
    for (const change of ['weight', 'remove', 'add'] as const) {
      const edited = getPersisted(source); if (change === 'weight') edited.matrix[0][1] = 2; else if (change === 'remove') edited.matrix[0][1] = 0; else edited.matrix[1][0] = 1;
      expect(() => fromAdjacencyMatrix(edited)).toThrow('count aggregate');
    }
    const text = toMatrixMarket(graph, { aggregation: 'count' }); expect(fromMatrixMarket(text).edges[0].weight).toBe(7); expect(toMatrixMarket(fromMatrixMarket(text))).toContain('1 2 1');
    expect(() => fromMatrixMarket(text.replace(/1 2 1\n$/, '1 2 2\n'))).toThrow('count aggregate');
  });
  it.each([
    { nodeIds: ['a'], matrix: [[NaN]], mode: 'directed' }, { nodeIds: ['a'], matrix: [], mode: 'directed' },
    { nodeIds: ['a', 'a'], matrix: [[0, 0], [0, 0]], mode: 'directed' }, { nodeIds: ['a'], matrix: [[1]], presence: [[false]], mode: 'directed' },
    { nodeIds: ['a', 'b'], matrix: [[0, 1], [0, 0]], mode: 'undirected' }, { nodeIds: ['a'], matrix: [[0]], presence: [[null]], mode: 'directed' },
  ])('rejects malformed or contradictory native matrix %#', (source) => expect(() => fromAdjacencyMatrix(source as any)).toThrow());
  it('native unknown source changes survive, structural/data edits reject and same coefficient conflicts diagnose', () => {
    const source = toAdjacencyMatrix(createFixture()); const doc = adjacencyMatrixDocumentConverter.from(source); doc.source.unknown = { retained: true }; doc.graph!.edges[1].weight = -4;
    expect(adjacencyMatrixDocumentConverter.to(doc).unknown).toEqual({ retained: true }); doc.source.matrix[1][1] = -5; expect(adjacencyMatrixDocumentConverter.getUpdate(doc).ok).toBe(false);
    const data = adjacencyMatrixDocumentConverter.from(source); data.graph!.nodes[0].data = 1; expect(adjacencyMatrixDocumentConverter.getUpdate(data).ok).toBe(false);
  });
});
describe('Matrix Market scoped grammar and source fidelity', () => {
  it.each(['coordinate', 'array'] as const)('complete Graph JSON, zero presence, comments and native edits in %s storage', (storage) => {
    const graph = createFixture(), source = toMatrixMarket(graph, { storage }); const restored = getNativeDocumentGraph(fromMatrixMarket(source), 'matrix-market', source); expect(getPersisted(restored)).toEqual(getPersisted(graph));
    const doc = getPersisted(matrixMarketDocumentConverter.from(source)); expect(matrixMarketDocumentConverter.to(doc)).toBe(source); doc.graph!.edges[1].weight = -7;
    expect(fromMatrixMarket(matrixMarketDocumentConverter.to(doc)).edges.find((edge) => edge.id === 'negative')!.weight).toBe(-7);
  });
  it('stored coordinate zeros are edges even without metadata; CRLF/comments/order/spacing survive native coefficient patch', () => {
    const source = '%%MatrixMarket matrix coordinate real general\r\n% before\r\n3 3 2\r\n  3\t1\t-2.5  \r\n% between records\r\n1 2 0\r\n';
    const doc = getPersisted(matrixMarketDocumentConverter.from(source)); expect(doc.graph!.edges.map((edge) => edge.weight)).toEqual([-2.5, 0]); doc.graph!.edges[0].weight = -4;
    expect(matrixMarketDocumentConverter.to(doc)).toBe(source.replace('-2.5', '-4')); expect(matrixMarketDocumentConverter.to(getPersisted(matrixMarketDocumentConverter.from(source)))).toBe(source);
  });
  it('array column-major and symmetric lower triangle map correctly; dense zeros are absent', () => {
    const general = fromMatrixMarket('%%MatrixMarket matrix array real general\n2 2\n1\n2\n3\n0\n'); expect(general.edges.map((edge) => [edge.sourceId, edge.targetId, edge.weight])).toEqual([['0', '0', 1], ['1', '0', 2], ['0', '1', 3]]);
    const symmetric = fromMatrixMarket('%%MatrixMarket matrix array integer symmetric\n2 2\n0\n-2\n3\n'); expect(symmetric.mode).toBe('undirected'); expect(symmetric.edges.map((edge) => [edge.sourceId, edge.targetId, edge.weight])).toEqual([['1', '0', -2], ['1', '1', 3]]);
  });
  it('coordinate symmetric diagonals and pattern unit coefficients are explicit', () => {
    const source = '%%MatrixMarket matrix coordinate pattern symmetric\n2 2 2\n2 1\n2 2\n'; const graph = fromMatrixMarket(source); expect(graph.edges.map((edge) => edge.weight)).toEqual([1, 1]); expect(graph.mode).toBe('undirected');
    const doc = matrixMarketDocumentConverter.from(source); doc.graph!.edges[0].weight = 2; expect(matrixMarketDocumentConverter.getUpdate(doc).ok).toBe(false);
  });
  it('general undirected coordinate zeros require mirrored stored presence in both orientations', () => {
    for (const [row, col] of [[1, 2], [2, 1]]) expect(() => fromMatrixMarket(`%%MatrixMarket matrix coordinate real general\n2 2 1\n${row} ${col} 0\n`, { mode: 'undirected' })).toThrow('stored presence');
    const mirrored = '%%MatrixMarket matrix coordinate real general\n2 2 2\n2 1 0\n1 2 0\n'; expect(fromMatrixMarket(mirrored, { mode: 'undirected' }).edges.map((edge) => edge.weight)).toEqual([0]);
    const duplicated = '%%MatrixMarket matrix coordinate real general\n2 2 3\n2 1 0\n1 2 0\n1 2 0\n'; expect(() => fromMatrixMarket(duplicated, { mode: 'undirected' })).toThrow('duplicate'); expect(fromMatrixMarket(duplicated, { mode: 'undirected', aggregation: 'sum' }).edges[0].weight).toBe(0);
  });
  it('duplicate coordinates reject by default, explicit sum is mathematical aggregation with declared loss', () => {
    const source = '%%MatrixMarket matrix coordinate real general\n2 2 2\n1 2 2\n1 2 -1\n'; expect(() => fromMatrixMarket(source)).toThrow('duplicate'); expect(fromMatrixMarket(source, { aggregation: 'sum' }).edges[0].weight).toBe(1);
    const doc = matrixMarketDocumentConverter.from(source); expect(doc.graph).toBeNull(); expect(matrixMarketDocumentConverter.to(getPersisted(doc))).toBe(source);
  });
  it('explicit nodeIds cannot override recognized sidecar silently', () => {
    const source = toMatrixMarket(createFixture()); expect(() => fromMatrixMarket(source, { nodeIds: ['x', 'y', 'z'] })).toThrow('conflicts');
    expect(fromMatrixMarket(source, { nodeIds: ['x', 'y', 'z'], metadata: 'native' }).nodes.map((node) => node.id)).toEqual(['x', 'y', 'z']);
  });
  it.each([
    '%%MatrixMarket matrix coordinate complex general\n2 2 1\n1 2 1 2\n', '%%MatrixMarket matrix coordinate real hermitian\n2 2 0\n',
    '%%MatrixMarket matrix coordinate real skew-symmetric\n2 2 0\n', '%%MatrixMarket matrix coordinate real general\n2 3 0\n',
    '%%MatrixMarket matrix coordinate real general\n2 2 2\n1 2 1\n', '%%MatrixMarket matrix coordinate real general\n2 2 1\n0 2 1\n',
    '%%MatrixMarket matrix coordinate real symmetric\n2 2 1\n1 2 1\n', '%%MatrixMarket matrix coordinate integer general\n2 2 1\n1 2 1.5\n',
    '%%MatrixMarket matrix coordinate real general\n100000000000 100000000000 0\n', '%%MatrixMarket matrix array real general\n10000 10000\n',
  ])('opaque preservation for unsupported/malformed native source %#', (source) => {
    expect(() => fromMatrixMarket(source)).toThrow(); const doc = matrixMarketDocumentConverter.from(source); expect(doc.graph).toBeNull(); expect(matrixMarketDocumentConverter.to(getPersisted(doc))).toBe(source);
  });
  it('bulk sparse document weights update every stable record once and preserve comments/order', () => {
    const count = 10000, source = `%%MatrixMarket matrix coordinate real general\n% bulk\n${count + 1} ${count + 1} ${count}\n` + Array.from({ length: count }, (_, index) => `${index + 1} ${index + 2} 1\n`).join('');
    const doc = matrixMarketDocumentConverter.from(source); for (const edge of doc.graph!.edges) edge.weight = -2;
    const output = matrixMarketDocumentConverter.to(doc); expect(output).toBe(source.replace(/ 1\n/g, ' -2\n')); expect(fromMatrixMarket(output).edges).toHaveLength(count);
  }, 30_000);
  it('untrusted zero-presence sidecars remain ordinary data rather than unsafe tuple projections', () => {
    const source = toMatrixMarket(createFixture(), { storage: 'array' }), lines = source.split('\n'), metadata = JSON.parse(lines[1].slice('% @statelyai/graph/matrix '.length)); metadata.zeroPresence = [null]; lines[1] = '% @statelyai/graph/matrix ' + JSON.stringify(metadata);
    expect(() => fromMatrixMarket(lines.join('\n'))).not.toThrow(); expect(fromMatrixMarket(lines.join('\n')).edges.some((edge) => edge.weight === 0)).toBe(false);
  });

});
