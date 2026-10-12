import { describe, it, expect } from 'vitest';
import { createGraph } from '../../src/graph';
import { toMatrixMarket, fromMatrixMarket, matrixMarketDocumentConverter } from '../../src/formats/matrix-market';
import { getSciPyOracle } from './scipy-oracle';
describe('actual SciPy 1.18.1 / NumPy 2.5.4 Matrix Market semantics', () => {
  it.each(['coordinate', 'array'] as const)('native %s directed coefficients, isolates and negative values', async (storage) => {
    const graph = createGraph({ nodes: [{ id: 'a' }, { id: 'b' }, { id: 'isolated' }], edges: [{ id: 'zero', sourceId: 'a', targetId: 'b', weight: 0 }, { id: 'negative', sourceId: 'b', targetId: 'b', weight: -2.5 }, { id: 'forward', sourceId: 'a', targetId: 'a', weight: 3 }] });
    const source = toMatrixMarket(graph, { storage }); const oracle = await getSciPyOracle(source, { symmetry: 'general' });
    expect(oracle.shape).toEqual([3, 3]); expect(oracle.dense).toEqual([[3, 0, 0], [0, -2.5, 0], [0, 0, 0]]); expect(oracle.sparse).toBe(storage === 'coordinate');
    if (storage === 'coordinate') { expect(oracle.storedZeros).toBe(1); expect(oracle.entries.some((entry) => entry.row === 0 && entry.col === 1 && entry.value === 0)).toBe(true); }
    const doc = matrixMarketDocumentConverter.from(source); doc.graph!.edges[1].weight = -4;
    expect((await getSciPyOracle(matrixMarketDocumentConverter.to(doc), { symmetry: 'general' })).dense![1][1]).toBe(-4);
  });
  it.each(['coordinate', 'array'] as const)('native %s symmetric lower triangle expands exactly once and keeps zero diagonal', async (storage) => {
    const graph = createGraph({ mode: 'undirected', nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'u', sourceId: 'a', targetId: 'b', weight: -2 }, { id: 'diag', sourceId: 'a', targetId: 'a', weight: 0 }] });
    const source = toMatrixMarket(graph, { storage, field: 'integer' }); const oracle = await getSciPyOracle(source, { symmetry: 'symmetric' });
    expect(oracle.dense).toEqual([[0, -2], [-2, 0]]); if (storage === 'coordinate') expect(oracle.storedZeros).toBe(1);
    expect(fromMatrixMarket(source).edges.map((edge) => edge.id)).toEqual(['u', 'diag']);
  });
  it('native authored array is column-major; duplicate coordinate native reader sums but adapter requires explicit policy', async () => {
    const array = '%%MatrixMarket matrix array real general\n2 2\n1\n2\n3\n4\n'; expect((await getSciPyOracle(array, { symmetry: 'general' })).dense).toEqual([[1, 3], [2, 4]]);
    const duplicate = '%%MatrixMarket matrix coordinate real general\n2 2 2\n1 2 2\n1 2 -1\n'; const oracle = await getSciPyOracle(duplicate, { symmetry: 'general' });
    expect(oracle.entries).toHaveLength(2); expect(oracle.dense).toEqual([[0, 1], [0, 0]]); expect(() => fromMatrixMarket(duplicate)).toThrow('duplicate'); expect(fromMatrixMarket(duplicate, { aggregation: 'sum' }).edges[0].weight).toBe(1);
  });
  it('native pattern represents unit coefficients, malformed dimensions are independently rejected', async () => {
    const source = '%%MatrixMarket matrix coordinate pattern general\n2 2 2\n1 2\n2 2\n'; expect((await getSciPyOracle(source, { symmetry: 'general', field: 'pattern' })).dense).toEqual([[0, 1], [0, 1]]);
    await expect(getSciPyOracle('%%MatrixMarket matrix coordinate real general\n2 2 2\n1 2 1\n')).rejects.toThrow();
  });
  it('sparse large graph has no dense adapter/oracle intermediate', async () => {
    const graph = createGraph({ nodes: Array.from({ length: 20000 }, (_, index) => ({ id: `n${index}` })), edges: [{ id: 'e', sourceId: 'n0', targetId: 'n19999', weight: 0 }] });
    const source = toMatrixMarket(graph); const oracle = await getSciPyOracle(source, { symmetry: 'general' }); expect(oracle.shape).toEqual([20000, 20000]); expect(oracle.dense).toBeUndefined(); expect(oracle.entries).toEqual([{ row: 0, col: 19999, value: 0 }]);
  });
});
