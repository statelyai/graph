import { describe, expect, it } from 'vitest';
import {
  createGraph,
  genMaximalCliques,
  getAdamicAdarIndex,
  getAverageClustering,
  getCenter,
  getClusteringCoefficients,
  getCommonNeighbors,
  getCondensation,
  getContractedGraph,
  getCycleBasis,
  getDiameter,
  getEccentricities,
  getEccentricity,
  getEdgeBetweennessCentrality,
  getGlobalMinCut,
  getJaccardCoefficient,
  getLeidenCommunities,
  getLinkPredictions,
  getLongestPath,
  getMaximalCliques,
  getMaximumMatching,
  getMinimumSpanningArborescence,
  getModularity,
  getPageRank,
  getPeriphery,
  getPreferentialAttachment,
  getRadius,
  getResourceAllocationIndex,
  getSubgraphIsomorphisms,
  getTopologicalGenerations,
  getTransitiveClosure,
  getTransitivity,
  getTriangleCounts,
  getUnweightedDistances,
  hasSubgraphIsomorphism,
  isArborescence,
} from '../src';
import type { EdgeConfig, Graph, GraphMode } from '../src';

const ids = (items: Array<{ id: string }>) => items.map((item) => item.id);
const e = (id: string, sourceId: string, targetId: string, weight?: number) =>
  weight === undefined ? { id, sourceId, targetId } : { id, sourceId, targetId, weight };
const nodes = (...list: string[]) => list.map((id) => ({ id }));

function seeded(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomGraph(
  seed: number,
  n: number,
  p: number,
  mode: GraphMode,
  maxWeight = 1,
): Graph {
  const random = seeded(seed);
  const edges: EdgeConfig[] = [];
  for (let i = 0; i < n; i++) {
    for (let j = mode === 'directed' ? 0 : i + 1; j < n; j++) {
      if (i === j || random() >= p) continue;
      edges.push(e(`e${edges.length}`, `n${i}`, `n${j}`, 1 + Math.floor(random() * maxWeight)));
    }
  }
  return createGraph({
    mode,
    nodes: Array.from({ length: n }, (_, i) => ({ id: `n${i}` })),
    edges,
  });
}

/** Two triangles {a,b,c} and {d,e,f} joined by c–d */
const barbell = () =>
  createGraph({
    mode: 'undirected',
    nodes: nodes('a', 'b', 'c', 'd', 'e', 'f'),
    edges: [
      e('ab', 'a', 'b'),
      e('bc', 'b', 'c'),
      e('ca', 'c', 'a'),
      e('cd', 'c', 'd'),
      e('de', 'd', 'e'),
      e('ef', 'e', 'f'),
      e('fd', 'f', 'd'),
    ],
  });

describe('getCondensation', () => {
  it('collapses strongly connected components into a DAG', () => {
    const graph = createGraph({
      nodes: nodes('a', 'b', 'c', 'd'),
      edges: [
        e('ab', 'a', 'b'),
        e('ba', 'b', 'a'),
        e('bc', 'b', 'c'),
        e('ac', 'a', 'c'),
        e('cd', 'c', 'd'),
        e('dc', 'd', 'c'),
      ],
    });
    const dag = getCondensation(graph);
    expect(dag.mode).toBe('directed');
    expect(dag.nodes.map((node) => [node.id, node.data.nodeIds])).toEqual([
      ['a', ['a', 'b']],
      ['c', ['c', 'd']],
    ]);
    expect(dag.edges).toHaveLength(1);
    expect(dag.edges[0]).toMatchObject({
      id: 'condensation:["a","c"]',
      sourceId: 'a',
      targetId: 'c',
      data: { edgeIds: ['bc', 'ac'] },
    });
  });

  it('merges non-directed edges into one component', () => {
    const graph = createGraph({
      nodes: nodes('a', 'b', 'c'),
      edges: [{ ...e('ab', 'a', 'b'), mode: 'undirected' }, e('bc', 'b', 'c')],
    });
    expect(getCondensation(graph).nodes.map((n) => n.data.nodeIds)).toEqual([
      ['a', 'b'],
      ['c'],
    ]);
  });
});

describe('DAG helpers', () => {
  it('adds an edge for every reachable pair in the transitive closure', () => {
    const graph = createGraph({
      nodes: nodes('a', 'b', 'c', 'd'),
      edges: [e('ab', 'a', 'b'), e('bc', 'b', 'c'), e('ca', 'c', 'a')],
    });
    const closure = getTransitiveClosure(graph);
    const pairs = closure.edges.map((edge) => `${edge.sourceId}${edge.targetId}`).sort();
    expect(pairs).toEqual(['ab', 'ac', 'ba', 'bc', 'ca', 'cb']);
    expect(closure.edges.slice(0, 3).map((edge) => edge.id)).toEqual(['ab', 'bc', 'ca']);
    expect(closure.nodes).toHaveLength(4);
  });

  it('completes each component of an undirected graph once per pair', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: nodes('a', 'b', 'c'),
      edges: [e('ab', 'a', 'b'), e('bc', 'b', 'c')],
    });
    const added = getTransitiveClosure(graph).edges.slice(2);
    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({ sourceId: 'a', targetId: 'c' });
    expect(added[0].mode).toBeUndefined();
  });

  it('marks added edges directed on a mixed graph and avoids id clashes', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: nodes('a', 'b', 'c'),
      edges: [
        { ...e('ab', 'a', 'b'), mode: 'directed' },
        { ...e('closure:["a","c"]', 'b', 'c'), mode: 'directed' },
      ],
    });
    const added = getTransitiveClosure(graph).edges.slice(2);
    expect(added).toEqual([
      expect.objectContaining({
        id: 'closure:["a","c"]#2',
        sourceId: 'a',
        targetId: 'c',
        mode: 'directed',
      }),
    ]);
  });

  it('finds the heaviest path in a DAG', () => {
    const graph = createGraph({
      nodes: nodes('build', 'test', 'lint', 'deploy'),
      edges: [
        e('bt', 'build', 'test', 2),
        e('bl', 'build', 'lint', 5),
        e('td', 'test', 'deploy', 1),
        e('ld', 'lint', 'deploy', 1),
      ],
    });
    const path = getLongestPath(graph)!;
    expect(path.source.id).toBe('build');
    expect(path.steps.map((step) => step.edge.id)).toEqual(['bl', 'ld']);
    // Unweighted: most edges
    const hops = getLongestPath(graph, { getWeight: () => 1 })!;
    expect(hops.steps).toHaveLength(2);
  });

  it('returns a single-node path, undefined when empty, and throws on cycles', () => {
    expect(getLongestPath(createGraph({}))).toBeUndefined();
    expect(getLongestPath(createGraph({ nodes: nodes('a') }))).toMatchObject({
      source: { id: 'a' },
      steps: [],
    });
    const cyclic = createGraph({
      nodes: nodes('a', 'b'),
      edges: [e('ab', 'a', 'b'), e('ba', 'b', 'a')],
    });
    expect(() => getLongestPath(cyclic)).toThrow(/cycle/);
    const undirected = createGraph({
      mode: 'undirected',
      nodes: nodes('a', 'b'),
      edges: [e('ab', 'a', 'b')],
    });
    expect(() => getLongestPath(undirected)).toThrow(/directed/);
  });

  it('skips negative edges when starting later is better', () => {
    const graph = createGraph({
      nodes: nodes('a', 'b', 'c'),
      edges: [e('ab', 'a', 'b', -5), e('bc', 'b', 'c', 3)],
    });
    expect(getLongestPath(graph)).toMatchObject({
      source: { id: 'b' },
      steps: [{ edge: { id: 'bc' } }],
    });
  });

  it('groups nodes into topological generations', () => {
    const graph = createGraph({
      nodes: nodes('d', 'a', 'c', 'b'),
      edges: [e('ac', 'a', 'c'), e('bc', 'b', 'c'), e('cd', 'c', 'd'), e('ad', 'a', 'd')],
    });
    expect(getTopologicalGenerations(graph)?.map(ids)).toEqual([['a', 'b'], ['c'], ['d']]);
    const cyclic = createGraph({
      nodes: nodes('a', 'b'),
      edges: [e('ab', 'a', 'b'), e('ba', 'b', 'a')],
    });
    expect(getTopologicalGenerations(cyclic)).toBeNull();
    expect(getTopologicalGenerations(createGraph({}))).toEqual([]);
  });
});

describe('distance metrics', () => {
  const path = createGraph({
    mode: 'undirected',
    nodes: nodes('a', 'b', 'c', 'd', 'e'),
    edges: [e('ab', 'a', 'b'), e('bc', 'b', 'c'), e('cd', 'c', 'd'), e('de', 'd', 'e')],
  });

  it('computes eccentricity, diameter, radius, center, and periphery', () => {
    expect(getEccentricities(path)).toEqual({ a: 4, b: 3, c: 2, d: 3, e: 4 });
    expect(getDiameter(path)).toBe(4);
    expect(getRadius(path)).toBe(2);
    expect(ids(getCenter(path))).toEqual(['c']);
    expect(ids(getPeriphery(path))).toEqual(['a', 'e']);
    expect(getEccentricity(path, 'b')).toBe(3);
    expect(getEccentricity(path, 'zz')).toBeUndefined();
  });

  it('follows edge direction and reports unreachable nodes as Infinity', () => {
    const dag = createGraph({
      nodes: nodes('root', 'x', 'y'),
      edges: [e('rx', 'root', 'x'), e('xy', 'x', 'y')],
    });
    expect(getEccentricities(dag)).toEqual({ root: 2, x: Infinity, y: Infinity });
    expect(getRadius(dag)).toBe(2);
    expect(getDiameter(dag)).toBe(Infinity);
    expect(ids(getCenter(dag))).toEqual(['root']);
    expect(getDiameter(createGraph({}))).toBeUndefined();
  });

  it('uses weights with getWeight and rejects negative ones', () => {
    const weighted = createGraph({
      mode: 'undirected',
      nodes: nodes('a', 'b', 'c'),
      edges: [e('ab', 'a', 'b', 5), e('bc', 'b', 'c', 1), e('ac', 'a', 'c', 1)],
    });
    const getWeight = (edge: { weight?: number }) => edge.weight ?? 1;
    expect(getEccentricities(weighted, { getWeight })).toEqual({ a: 2, b: 2, c: 1 });
    expect(() =>
      getDiameter(weighted, { getWeight: () => -1 }),
    ).toThrow(/non-negative/);
  });
});

describe('getContractedGraph', () => {
  const graph = createGraph({
    initialNodeId: 'a',
    nodes: [
      { id: 'group' },
      { id: 'a', parentId: 'group', data: 'first' },
      { id: 'b', parentId: 'group', initialNodeId: 'c' },
      { id: 'c', parentId: 'b' },
      { id: 'd', initialNodeId: 'b' },
    ],
    edges: [e('ab', 'a', 'b'), e('bc', 'b', 'c'), e('cd', 'c', 'd'), e('da', 'd', 'a')],
  });

  it('merges nodes, redirects edges, and drops internal edges', () => {
    const result = getContractedGraph(graph, ['a', 'b']);
    expect(ids(result.nodes)).toEqual(['group', 'a', 'c', 'd']);
    expect(result.nodes[1]).toMatchObject({ id: 'a', parentId: 'group', data: 'first' });
    expect(result.nodes[2].parentId).toBe('a');
    expect(result.nodes[3].initialNodeId).toBe('a');
    expect(result.edges.map((edge) => `${edge.id}:${edge.sourceId}->${edge.targetId}`)).toEqual([
      'bc:a->c',
      'cd:c->d',
      'da:d->a',
    ]);
    expect(result.initialNodeId).toBe('a');
  });

  it('supports a custom id, self-loops, and parent resolution', () => {
    const result = getContractedGraph(graph, ['b', 'c'], { id: 'bc', selfLoops: true });
    const merged = result.nodes.find((node) => node.id === 'bc')!;
    expect(merged.parentId).toBe('group');
    expect(merged.initialNodeId).toBeUndefined();
    expect(result.edges.find((edge) => edge.id === 'bc')).toMatchObject({
      sourceId: 'bc',
      targetId: 'bc',
    });
    expect(() => getContractedGraph(graph, ['a', 'b'], { id: 'd' })).toThrow(/outside/);
    expect(getContractedGraph(graph, ['zz']).nodes).toHaveLength(5);
  });

  it('drops port references the merged node does not have', () => {
    const ported = createGraph({
      nodes: [
        { id: 'a', ports: [{ name: 'out' }] },
        { id: 'b', ports: [{ name: 'in' }, { name: 'out' }] },
        { id: 'c', ports: [{ name: 'in' }] },
      ],
      edges: [
        { ...e('ac', 'a', 'c'), sourcePort: 'out', targetPort: 'in' },
        { ...e('bc', 'b', 'c'), sourcePort: 'out', targetPort: 'in' },
      ],
    });
    const result = getContractedGraph(ported, ['a', 'b']);
    expect(result.edges[0].sourcePort).toBe('out');
    expect(result.edges[1].sourcePort).toBeUndefined();
    expect(result.edges[1].targetPort).toBe('in');
  });
});

describe('subgraph isomorphism', () => {
  const pair = createGraph({
    nodes: nodes('x', 'y'),
    edges: [e('xy', 'x', 'y'), e('yx', 'y', 'x')],
  });

  it('finds mutually connected pairs', () => {
    const graph = createGraph({
      nodes: nodes('a', 'b', 'c'),
      edges: [e('ab', 'a', 'b'), e('ba', 'b', 'a'), e('bc', 'b', 'c')],
    });
    expect(getSubgraphIsomorphisms(graph, pair)).toEqual([
      { x: 'a', y: 'b' },
      { x: 'b', y: 'a' },
    ]);
    expect(hasSubgraphIsomorphism(graph, pair)).toBe(true);
  });

  it('distinguishes induced matches from monomorphisms', () => {
    const triangle = createGraph({
      mode: 'undirected',
      nodes: nodes('a', 'b', 'c'),
      edges: [e('ab', 'a', 'b'), e('bc', 'b', 'c'), e('ca', 'c', 'a')],
    });
    const path = createGraph({
      mode: 'undirected',
      nodes: nodes('p', 'q', 'r'),
      edges: [e('pq', 'p', 'q'), e('qr', 'q', 'r')],
    });
    expect(getSubgraphIsomorphisms(triangle, path)).toHaveLength(6);
    expect(getSubgraphIsomorphisms(triangle, path, { induced: true })).toEqual([]);
  });

  it('honors node and edge matchers', () => {
    const graph = createGraph({
      nodes: [
        { id: 'a', data: 'idle' },
        { id: 'b', data: 'busy' },
        { id: 'c', data: 'idle' },
      ],
      edges: [
        { ...e('ab', 'a', 'b'), label: 'start' },
        { ...e('cb', 'c', 'b'), label: 'other' },
      ],
    });
    const pattern = createGraph({
      nodes: [
        { id: 'x', data: 'idle' },
        { id: 'y', data: 'busy' },
      ],
      edges: [{ ...e('xy', 'x', 'y'), label: 'start' }],
    });
    expect(
      getSubgraphIsomorphisms(graph, pattern, {
        nodeMatch: (g, p) => g.data === p.data,
        edgeMatch: (g, p) => g.label === p.label,
      }),
    ).toEqual([{ x: 'a', y: 'b' }]);
  });

  it('matches a brute-force count on random graphs', () => {
    for (let seed = 1; seed <= 25; seed++) {
      const mode = seed % 2 ? 'directed' : 'undirected';
      const graph = randomGraph(seed, 6, 0.45, mode);
      const pattern = randomGraph(seed + 100, 3, 0.6, mode);
      for (const induced of [false, true]) {
        const expected = bruteForceSubgraphCount(graph, pattern, induced);
        expect(getSubgraphIsomorphisms(graph, pattern, { induced })).toHaveLength(expected);
      }
    }
  });
});

function arcSet(graph: Graph): Set<string> {
  const arcs = new Set<string>();
  for (const edge of graph.edges) {
    arcs.add(`${edge.sourceId}>${edge.targetId}`);
    if ((edge.mode ?? graph.mode) !== 'directed') arcs.add(`${edge.targetId}>${edge.sourceId}`);
  }
  return arcs;
}

function bruteForceSubgraphCount(graph: Graph, pattern: Graph, induced: boolean): number {
  const g = arcSet(graph);
  const p = arcSet(pattern);
  const gIds = graph.nodes.map((node) => node.id);
  const pIds = pattern.nodes.map((node) => node.id);
  let count = 0;
  const assign = (k: number, mapping: string[]) => {
    if (k === pIds.length) {
      for (let i = 0; i < pIds.length; i++) {
        for (let j = 0; j < pIds.length; j++) {
          const hasP = p.has(`${pIds[i]}>${pIds[j]}`);
          const hasG = g.has(`${mapping[i]}>${mapping[j]}`);
          if (hasP && !hasG) return;
          if (induced && hasG && !hasP) return;
        }
      }
      count++;
      return;
    }
    for (const id of gIds) {
      if (!mapping.includes(id)) assign(k + 1, [...mapping, id]);
    }
  };
  assign(0, []);
  return count;
}

describe('getEdgeBetweennessCentrality', () => {
  it('scores edges on an undirected path', () => {
    const path = createGraph({
      mode: 'undirected',
      nodes: nodes('a', 'b', 'c'),
      edges: [e('ab', 'a', 'b'), e('bc', 'b', 'c')],
    });
    const scores = getEdgeBetweennessCentrality(path);
    expect(scores.ab).toBeCloseTo(4 / 6);
    expect(scores.bc).toBeCloseTo(4 / 6);
  });

  it('sums raw scores to the total shortest-path length', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const graph = randomGraph(seed, 7, 0.35, seed % 2 ? 'directed' : 'undirected');
      const n = graph.nodes.length;
      const scores = getEdgeBetweennessCentrality(graph);
      const raw = Object.values(scores).reduce((sum, s) => sum + s, 0) * n * (n - 1);
      let total = 0;
      for (const node of graph.nodes) {
        for (const d of getUnweightedDistances(graph, node.id).values()) total += d;
      }
      expect(raw).toBeCloseTo(total);
    }
  });

  it('splits paths across parallel edges', () => {
    const graph = createGraph({
      nodes: nodes('a', 'b'),
      edges: [e('ab1', 'a', 'b'), e('ab2', 'a', 'b')],
    });
    expect(getEdgeBetweennessCentrality(graph)).toEqual({ ab1: 0.25, ab2: 0.25 });
  });
});

describe('personalized PageRank', () => {
  const graph = createGraph({
    nodes: nodes('a', 'b', 'c', 'd'),
    edges: [e('ab', 'a', 'b'), e('bc', 'b', 'c'), e('ca', 'c', 'a'), e('cd', 'c', 'd')],
  });

  it('matches plain PageRank with a uniform personalization', () => {
    const plain = getPageRank(graph);
    const uniform = getPageRank(graph, {
      personalization: { a: 1, b: 1, c: 1, d: 1 },
    });
    for (const id of ['a', 'b', 'c', 'd']) expect(uniform[id]).toBeCloseTo(plain[id]);
  });

  it('biases scores toward personalized nodes', () => {
    const plain = getPageRank(graph);
    const biased = getPageRank(graph, { personalization: { d: 1 } });
    expect(biased.d).toBeGreaterThan(plain.d);
    expect(Object.values(biased).reduce((sum, s) => sum + s, 0)).toBeCloseTo(1);
    expect(() => getPageRank(graph, { personalization: { zz: 1 } })).toThrow(/no positive/);
    expect(() => getPageRank(graph, { personalization: { a: -1 } })).toThrow(/non-negative/);
  });
});

describe('cliques and clustering', () => {
  const graph = createGraph({
    nodes: nodes('a', 'b', 'c', 'd', 'e'),
    edges: [e('ab', 'a', 'b'), e('bc', 'b', 'c'), e('ca', 'c', 'a'), e('cd', 'c', 'd')],
  });

  it('enumerates maximal cliques, including isolated nodes', () => {
    const cliques = getMaximalCliques(graph).map(ids).sort();
    expect(cliques).toEqual([['a', 'b', 'c'], ['c', 'd'], ['e']]);
    expect(genMaximalCliques(createGraph({})).next().done).toBe(true);
  });

  it('matches brute-force maximal cliques on random graphs', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const random = randomGraph(seed, 8, 0.5, 'undirected');
      const found = getMaximalCliques(random).map((c) => ids(c).join(',')).sort();
      expect(found).toEqual(bruteForceMaximalCliques(random));
    }
  });

  it('counts triangles and clustering coefficients', () => {
    expect(getTriangleCounts(graph)).toEqual({ a: 1, b: 1, c: 1, d: 0, e: 0 });
    expect(getClusteringCoefficients(graph)).toEqual({ a: 1, b: 1, c: 1 / 3, d: 0, e: 0 });
    expect(getAverageClustering(graph)).toBeCloseTo((1 + 1 + 1 / 3) / 5);
    // 3 triangles-at-nodes over 1 + 1 + 3 connected triples
    expect(getTransitivity(graph)).toBeCloseTo(3 / 5);
    expect(getAverageClustering(createGraph({}))).toBe(0);
    expect(getTransitivity(createGraph({}))).toBe(0);
  });
});

function bruteForceMaximalCliques(graph: Graph): string[] {
  const n = graph.nodes.length;
  const adjacent = new Set<string>();
  for (const edge of graph.edges) {
    adjacent.add(`${edge.sourceId}|${edge.targetId}`);
    adjacent.add(`${edge.targetId}|${edge.sourceId}`);
  }
  const isClique = (members: string[]) =>
    members.every((a, i) => members.slice(i + 1).every((b) => adjacent.has(`${a}|${b}`)));
  const cliques: string[][] = [];
  for (let mask = 1; mask < 1 << n; mask++) {
    const members = graph.nodes.filter((_, i) => mask & (1 << i)).map((node) => node.id);
    if (isClique(members)) cliques.push(members);
  }
  return cliques
    .filter(
      (clique) =>
        !cliques.some(
          (other) => other.length > clique.length && clique.every((id) => other.includes(id)),
        ),
    )
    .map((clique) => clique.join(','))
    .sort();
}

describe('link prediction', () => {
  const graph = createGraph({
    mode: 'undirected',
    nodes: nodes('a', 'b', 'c', 'd', 'e'),
    edges: [e('ab', 'a', 'b'), e('ac', 'a', 'c'), e('bd', 'b', 'd'), e('cd', 'c', 'd'), e('de', 'd', 'e')],
  });

  it('scores pairs', () => {
    expect(ids(getCommonNeighbors(graph, 'a', 'd'))).toEqual(['b', 'c']);
    expect(getJaccardCoefficient(graph, 'a', 'd')).toBeCloseTo(2 / 3);
    expect(getAdamicAdarIndex(graph, 'a', 'd')).toBeCloseTo(2 / Math.log(2));
    expect(getResourceAllocationIndex(graph, 'a', 'd')).toBeCloseTo(1);
    expect(getPreferentialAttachment(graph, 'a', 'd')).toBe(6);
    expect(getJaccardCoefficient(graph, 'a', 'zz')).toBe(0);
  });

  it('ranks non-adjacent pairs', () => {
    const predictions = getLinkPredictions(graph, { method: 'common-neighbors' });
    expect(predictions[0]).toEqual({ sourceId: 'a', targetId: 'd', score: 2 });
    expect(predictions.map((p) => `${p.sourceId}${p.targetId}`)).toEqual([
      'ad',
      'bc',
      'be',
      'ce',
    ]);
    expect(getLinkPredictions(graph, { from: 'e', method: 'jaccard' })).toEqual([
      { sourceId: 'e', targetId: 'b', score: 1 / 2 },
      { sourceId: 'e', targetId: 'c', score: 1 / 2 },
    ]);
    expect(getLinkPredictions(graph, { limit: 1 })).toHaveLength(1);
    expect(
      getLinkPredictions(graph, { method: 'preferential-attachment', from: 'a' }).map(
        (p) => p.targetId,
      ),
    ).toEqual(['d', 'e']);
  });
});

describe('getLeidenCommunities', () => {
  it('separates the two halves of a barbell graph', () => {
    expect(getLeidenCommunities(barbell())).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e', 'f'],
    ]);
  });

  it('returns connected communities with competitive modularity', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const graph = randomGraph(seed, 30, 0.12, 'undirected');
      const communities = getLeidenCommunities(graph);
      expect(communities.flat().sort()).toEqual(graph.nodes.map((n) => n.id).sort());
      for (const community of communities) {
        const sub = new Set(community);
        const reached = new Set([community[0]]);
        const stack = [community[0]];
        while (stack.length > 0) {
          const id = stack.pop()!;
          for (const edge of graph.edges) {
            const other =
              edge.sourceId === id ? edge.targetId : edge.targetId === id ? edge.sourceId : undefined;
            if (other && sub.has(other) && !reached.has(other)) {
              reached.add(other);
              stack.push(other);
            }
          }
        }
        expect(reached.size).toBe(community.length);
      }
      expect(getModularity(graph, communities)).toBeGreaterThan(0.2);
    }
  });

  it('handles edgeless graphs', () => {
    expect(getLeidenCommunities(createGraph({ nodes: nodes('a', 'b') }))).toEqual([['a'], ['b']]);
    expect(getLeidenCommunities(createGraph({}))).toEqual([]);
  });
});

describe('getGlobalMinCut', () => {
  it('finds the bridge of a barbell graph', () => {
    const cut = getGlobalMinCut(barbell())!;
    expect(cut.value).toBe(1);
    expect(cut.partition).toEqual([['a', 'b', 'c'], ['d', 'e', 'f']]);
    expect(ids(cut.cutEdges)).toEqual(['cd']);
  });

  it('returns 0 for disconnected graphs and undefined below two nodes', () => {
    const graph = createGraph({ nodes: nodes('a', 'b', 'c'), edges: [e('ab', 'a', 'b')] });
    expect(getGlobalMinCut(graph)).toMatchObject({ value: 0, cutEdges: [] });
    expect(getGlobalMinCut(createGraph({ nodes: nodes('a') }))).toBeUndefined();
    expect(() =>
      getGlobalMinCut(graph, { getWeight: () => -1 }),
    ).toThrow(/non-negative/);
  });

  it('matches brute force on random weighted graphs', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const graph = randomGraph(seed, 7, 0.5, 'undirected', 9);
      const cut = getGlobalMinCut(graph)!;
      let best = Infinity;
      const n = graph.nodes.length;
      for (let mask = 1; mask < (1 << n) - 1; mask++) {
        const side = (id: string) => (mask >> Number(id.slice(1))) & 1;
        let value = 0;
        for (const edge of graph.edges) {
          if (side(edge.sourceId) !== side(edge.targetId)) value += edge.weight!;
        }
        best = Math.min(best, value);
      }
      expect(cut.value).toBe(best);
      expect(cut.cutEdges.reduce((sum, edge) => sum + edge.weight!, 0)).toBe(best);
    }
  });
});

describe('getMinimumSpanningArborescence', () => {
  it('picks the cheapest incoming edges and handles cycles', () => {
    const graph = createGraph({
      nodes: nodes('r', 'a', 'b', 'c'),
      edges: [
        e('ra', 'r', 'a', 10),
        e('rb', 'r', 'b', 10),
        e('ab', 'a', 'b', 1),
        e('ba', 'b', 'a', 1),
        e('bc', 'b', 'c', 2),
        e('ca', 'c', 'a', 1),
      ],
    });
    const tree = getMinimumSpanningArborescence(graph)!;
    expect(isArborescence(tree)).toBe(true);
    expect(tree.edges.reduce((sum, edge) => sum + edge.weight!, 0)).toBe(13);
    expect(getMinimumSpanningArborescence(graph, { from: 'a' })).toBeUndefined();
    expect(getMinimumSpanningArborescence(graph, { from: 'zz' })).toBeUndefined();
  });

  it('returns undefined when no root reaches everything', () => {
    const graph = createGraph({
      nodes: nodes('a', 'b', 'c'),
      edges: [e('ab', 'a', 'b'), e('cb', 'c', 'b')],
    });
    expect(getMinimumSpanningArborescence(graph)).toBeUndefined();
    expect(getMinimumSpanningArborescence(createGraph({}))).toBeUndefined();
  });

  it('matches brute force on random directed graphs', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const graph = randomGraph(seed, 3 + (seed % 4), 0.5, 'directed', 9);
      for (const maximum of [false, true]) {
        const expected = bruteForceArborescence(graph, maximum);
        const tree = getMinimumSpanningArborescence(graph, { maximum });
        if (expected === undefined) {
          expect(tree).toBeUndefined();
          continue;
        }
        expect(tree).toBeDefined();
        expect(isArborescence(tree!)).toBe(true);
        expect(tree!.edges.reduce((sum, edge) => sum + edge.weight!, 0)).toBe(expected);
      }
    }
  });
});

function bruteForceArborescence(graph: Graph, maximum: boolean): number | undefined {
  let best: number | undefined;
  const n = graph.nodes.length;
  const choose = (k: number, chosen: EdgeConfig[]) => {
    if (chosen.length === n - 1) {
      const tree = createGraph({ mode: 'directed', nodes: graph.nodes, edges: chosen });
      if (!isArborescence(tree)) return;
      const weight = chosen.reduce((sum, edge) => sum + edge.weight!, 0);
      if (best === undefined || (maximum ? weight > best : weight < best)) best = weight;
      return;
    }
    if (k === graph.edges.length) return;
    choose(k + 1, [...chosen, graph.edges[k]]);
    choose(k + 1, chosen);
  };
  choose(0, []);
  return best;
}

describe('getMaximumMatching', () => {
  it('matches a path and an odd cycle (blossom)', () => {
    const path = createGraph({
      mode: 'undirected',
      nodes: nodes('a', 'b', 'c', 'd'),
      edges: [e('ab', 'a', 'b'), e('bc', 'b', 'c'), e('cd', 'c', 'd')],
    });
    expect(getMaximumMatching(path).map((m) => m.edgeId)).toEqual(['ab', 'cd']);
    const pentagonWithTail = createGraph({
      mode: 'undirected',
      nodes: nodes('a', 'b', 'c', 'd', 'e', 'f'),
      edges: [
        e('ab', 'a', 'b'),
        e('bc', 'b', 'c'),
        e('cd', 'c', 'd'),
        e('de', 'd', 'e'),
        e('ea', 'e', 'a'),
        e('af', 'a', 'f'),
      ],
    });
    expect(getMaximumMatching(pentagonWithTail)).toHaveLength(3);
  });

  it('maximizes weight, or cardinality first', () => {
    const graph = createGraph({
      mode: 'undirected',
      nodes: nodes('a', 'b', 'c', 'd'),
      edges: [e('ab', 'a', 'b', 2), e('bc', 'b', 'c', 5), e('cd', 'c', 'd', 2)],
    });
    expect(getMaximumMatching(graph).map((m) => m.edgeId)).toEqual(['bc']);
    expect(getMaximumMatching(graph, { maxCardinality: true }).map((m) => m.edgeId)).toEqual([
      'ab',
      'cd',
    ]);
  });

  it('matches brute force on random weighted graphs', () => {
    for (let seed = 1; seed <= 150; seed++) {
      const n = 3 + (seed % 6);
      const graph = randomGraph(seed, n, 0.55, 'undirected', 12);
      for (const maxCardinality of [false, true]) {
        const matching = getMaximumMatching(graph, { maxCardinality });
        const used = new Set<string>();
        for (const match of matching) {
          expect(used.has(match.sourceId) || used.has(match.targetId)).toBe(false);
          used.add(match.sourceId);
          used.add(match.targetId);
        }
        const weightOf = (edgeId: string) => graph.edges.find((edge) => edge.id === edgeId)!.weight!;
        const weight = matching.reduce((sum, m) => sum + weightOf(m.edgeId), 0);
        const expected = bruteForceMatching(graph, maxCardinality);
        expect([matching.length, weight]).toEqual(
          maxCardinality ? expected : [matching.length, expected[1]],
        );
      }
    }
  });
});

/** Best [cardinality, weight] (lexicographic when maxCardinality, else weight only). */
function bruteForceMatching(graph: Graph, maxCardinality: boolean): [number, number] {
  let best: [number, number] = [0, 0];
  const better = (a: [number, number], b: [number, number]) =>
    maxCardinality ? a[0] > b[0] || (a[0] === b[0] && a[1] > b[1]) : a[1] > b[1];
  const search = (k: number, used: Set<string>, size: number, weight: number) => {
    if (better([size, weight], best)) best = [size, weight];
    for (let i = k; i < graph.edges.length; i++) {
      const edge = graph.edges[i];
      if (used.has(edge.sourceId) || used.has(edge.targetId)) continue;
      used.add(edge.sourceId);
      used.add(edge.targetId);
      search(i + 1, used, size + 1, weight + edge.weight!);
      used.delete(edge.sourceId);
      used.delete(edge.targetId);
    }
  };
  search(0, new Set(), 0, 0);
  return best;
}

describe('getCycleBasis', () => {
  it('returns one cycle per non-tree edge', () => {
    const graph = createGraph({
      nodes: nodes('a', 'b', 'c', 'd'),
      edges: [
        e('ab', 'a', 'b'),
        e('bc', 'b', 'c'),
        e('ca', 'c', 'a'),
        e('cd', 'c', 'd'),
        e('dd', 'd', 'd'),
        e('cd2', 'c', 'd'),
      ],
    });
    expect(getCycleBasis(graph).map(ids)).toEqual([['b', 'a', 'c'], ['d'], ['c', 'd']]);
  });

  it('has m − n + c valid cycles on random graphs', () => {
    for (let seed = 1; seed <= 20; seed++) {
      const graph = randomGraph(seed, 9, 0.3, seed % 2 ? 'directed' : 'undirected');
      const adjacent = new Set<string>();
      for (const edge of graph.edges) {
        adjacent.add(`${edge.sourceId}|${edge.targetId}`);
        adjacent.add(`${edge.targetId}|${edge.sourceId}`);
      }
      const basis = getCycleBasis(graph);
      // Components of the undirected projection
      const seen = new Set<string>();
      let components = 0;
      for (const node of graph.nodes) {
        if (seen.has(node.id)) continue;
        components++;
        const stack = [node.id];
        seen.add(node.id);
        while (stack.length > 0) {
          const id = stack.pop()!;
          for (const other of graph.nodes) {
            if (!seen.has(other.id) && adjacent.has(`${id}|${other.id}`)) {
              seen.add(other.id);
              stack.push(other.id);
            }
          }
        }
      }
      expect(basis).toHaveLength(graph.edges.length - graph.nodes.length + components);
      for (const cycle of basis) {
        for (let i = 0; i < cycle.length; i++) {
          const next = cycle[(i + 1) % cycle.length];
          expect(adjacent.has(`${cycle[i].id}|${next.id}`)).toBe(true);
        }
      }
    }
  });
});
