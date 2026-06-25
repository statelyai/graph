import { describe, it, expect } from 'vitest';
import {
  createGraph,
  updateNode,
  updateEdge,
  getSuccessors,
  getPredecessors,
  getDegree,
  getInDegree,
  getOutDegree,
  getSources,
  getSinks,
  getDiff,
  getPatches,
  updateGraphWithPatches,
  isEmptyDiff,
  getInvertedDiff,
  toPatches,
  getChildren,
  getFlattenedGraph,
  getSubgraph,
  getReversedGraph,
  areEntitiesEqual,
  isNonLayoutEqual,
  genRandomWalk,
  genQuickRandomWalk,
  genPredefinedWalk,
  genWalkSteps,
  genWalkUntilNodeCoverage,
  bfs as deprecatedBFS,
  dfs as deprecatedDFS,
  joinPaths as deprecatedJoinPaths,
  applyPatches as deprecatedApplyPatches,
  invertDiff as deprecatedInvertDiff,
  flatten as deprecatedFlatten,
  reverseGraph as deprecatedReverseGraph,
  takeSteps as deprecatedTakeSteps,
  takeUntilNode as deprecatedTakeUntilNode,
  takeUntilEdge as deprecatedTakeUntilEdge,
  takeUntilNodeCoverage as deprecatedTakeUntilNodeCoverage,
  takeUntilEdgeCoverage as deprecatedTakeUntilEdgeCoverage,
} from '../src';
import { createGraphNode } from '../src/graph';

describe('deprecated unprefixed aliases', () => {
  it('remain callable for backwards compatibility', () => {
    expect(typeof deprecatedBFS).toBe('function');
    expect(typeof deprecatedDFS).toBe('function');
    expect(typeof deprecatedJoinPaths).toBe('function');
    expect(typeof deprecatedApplyPatches).toBe('function');
    expect(typeof deprecatedInvertDiff).toBe('function');
    expect(typeof deprecatedFlatten).toBe('function');
    expect(typeof deprecatedReverseGraph).toBe('function');
    expect(typeof deprecatedTakeSteps).toBe('function');
    expect(typeof deprecatedTakeUntilNode).toBe('function');
    expect(typeof deprecatedTakeUntilEdge).toBe('function');
    expect(typeof deprecatedTakeUntilNodeCoverage).toBe('function');
    expect(typeof deprecatedTakeUntilEdgeCoverage).toBe('function');
  });
});

describe('updateNode/updateEdge apply all declared fields', () => {
  it('updateNode applies visual and style fields', () => {
    const g = createGraph({ nodes: [{ id: 'a' }] });
    const updated = updateNode(g, 'a', {
      x: 10,
      y: 20,
      width: 30,
      height: 40,
      shape: 'circle',
      color: 'red',
      style: { stroke: 'blue' },
    });
    expect(updated.x).toBe(10);
    expect(updated.y).toBe(20);
    expect(updated.width).toBe(30);
    expect(updated.height).toBe(40);
    expect(updated.shape).toBe('circle');
    expect(updated.color).toBe('red');
    expect(updated.style).toEqual({ stroke: 'blue' });
  });

  it('updateNode unsets optional fields with null', () => {
    const g = createGraph({ nodes: [{ id: 'a', x: 5, color: 'red' }] });
    const updated = updateNode(g, 'a', { x: null, color: null });
    expect('x' in updated).toBe(false);
    expect('color' in updated).toBe(false);
  });

  it('updateEdge applies mode, weight and visual fields', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    const updated = updateEdge(g, 'e', {
      weight: 5,
      mode: 'undirected',
      x: 1,
      color: 'green',
      style: { dashed: true },
    });
    expect(updated.weight).toBe(5);
    expect(updated.mode).toBe('undirected');
    expect(updated.x).toBe(1);
    expect(updated.color).toBe('green');
    expect(updated.style).toEqual({ dashed: true });
  });

  it('updateEdge unsets weight/mode with null', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e', sourceId: 'a', targetId: 'b', weight: 3, mode: 'undirected' },
      ],
    });
    const updated = updateEdge(g, 'e', { weight: null, mode: null });
    expect('weight' in updated).toBe(false);
    expect('mode' in updated).toBe(false);
  });
});

describe('updateEdge port reference validation', () => {
  const makeGraph = () =>
    createGraph({
      nodes: [
        { id: 'a', ports: [{ name: 'p' }] },
        { id: 'b', ports: [{ name: 'q' }] },
        { id: 'c' },
      ],
      edges: [
        { id: 'e', sourceId: 'a', targetId: 'b', sourcePort: 'p', targetPort: 'q' },
      ],
    });

  it('rejects an endpoint change that would orphan a port reference', () => {
    const g = makeGraph();
    expect(() => updateEdge(g, 'e', { sourceId: 'c' })).toThrowError(
      /sourcePort "p" does not exist on the new source node "c"/,
    );
  });

  it('allows endpoint change when the port is cleared with null', () => {
    const g = makeGraph();
    const updated = updateEdge(g, 'e', { sourceId: 'c', sourcePort: null });
    expect(updated.sourceId).toBe('c');
    expect('sourcePort' in updated).toBe(false);
  });

  it('allows endpoint change when a valid port on the new node is given', () => {
    const g = makeGraph();
    const updated = updateEdge(g, 'e', { targetId: 'a', targetPort: 'p' });
    expect(updated.targetId).toBe('a');
    expect(updated.targetPort).toBe('p');
  });
});

describe('updateNode port replacement validation', () => {
  it('rejects removing a port that an edge references', () => {
    const g = createGraph({
      nodes: [{ id: 'a', ports: [{ name: 'p' }] }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', sourcePort: 'p' }],
    });
    expect(() => updateNode(g, 'a', { ports: [{ name: 'other' }] })).toThrowError(
      /edge "e" references port "p"/,
    );
    expect(() => updateNode(g, 'a', { ports: null })).toThrowError(
      /edge "e" references port "p"/,
    );
  });

  it('allows removing unreferenced ports with null', () => {
    const g = createGraph({
      nodes: [{ id: 'a', ports: [{ name: 'p' }] }],
    });
    const updated = updateNode(g, 'a', { ports: null });
    expect('ports' in updated).toBe(false);
  });
});

describe('updateNode hierarchy cycle guard', () => {
  it('rejects reparenting a node under its own descendant', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b', parentId: 'a' }, { id: 'c', parentId: 'b' }],
    });
    expect(() => updateNode(g, 'a', { parentId: 'c' })).toThrowError(
      /hierarchy cycle/,
    );
  });

  it('rejects self-parenting', () => {
    const g = createGraph({ nodes: [{ id: 'a' }] });
    expect(() => updateNode(g, 'a', { parentId: 'a' })).toThrowError(
      /hierarchy cycle/,
    );
  });

  it('still allows valid reparenting', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b', parentId: 'a' }, { id: 'c' }],
    });
    expect(updateNode(g, 'b', { parentId: 'c' }).parentId).toBe('c');
  });

  it('does not hang when the graph has a pre-existing authored parent cycle', () => {
    // createGraph does not validate parent cycles; the ancestry walk must
    // still terminate when reparenting an unrelated node into such a cycle.
    const g = createGraph({
      nodes: [
        { id: 'x', parentId: 'y' },
        { id: 'y', parentId: 'x' },
        { id: 'c' },
      ],
    });
    expect(updateNode(g, 'c', { parentId: 'x' }).parentId).toBe('x');
  });
});

describe('mode-aware neighbor and degree queries', () => {
  it('getSuccessors/getPredecessors traverse undirected edges both ways', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    expect(getSuccessors(g, 'b').map((n) => n.id)).toEqual(['a']);
    expect(getPredecessors(g, 'a').map((n) => n.id)).toEqual(['b']);
  });

  it('respects per-edge mode overrides in a directed graph', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', mode: 'undirected' },
        { id: 'e2', sourceId: 'a', targetId: 'c' },
      ],
    });
    expect(getSuccessors(g, 'b').map((n) => n.id)).toEqual(['a']);
    expect(getSuccessors(g, 'c').map((n) => n.id)).toEqual([]);
    expect(getPredecessors(g, 'a').map((n) => n.id)).toEqual(['b']);
  });

  it('treats bidirectional edges as traversable both ways', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b', mode: 'bidirectional' }],
    });
    expect(getSuccessors(g, 'b').map((n) => n.id)).toEqual(['a']);
  });

  it('getDegree respects per-edge mode for self-loops', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }],
      edges: [{ id: 'loop', sourceId: 'a', targetId: 'a', mode: 'undirected' }],
    });
    expect(getDegree(g, 'a')).toBe(1); // non-directed self-loop counts once

    const g2 = createGraph({
      nodes: [{ id: 'a' }],
      edges: [{ id: 'loop', sourceId: 'a', targetId: 'a' }],
    });
    expect(getDegree(g2, 'a')).toBe(2); // directed self-loop: in + out
  });

  it('getInDegree/getOutDegree count non-directed edges both ways', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    expect(getInDegree(g, 'a')).toBe(1);
    expect(getOutDegree(g, 'b')).toBe(1);
  });

  it('getSources/getSinks: nodes on undirected edges are neither', () => {
    const g = createGraph({
      mode: 'undirected',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'isolated' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    expect(getSources(g).map((n) => n.id)).toEqual(['isolated']);
    expect(getSinks(g).map((n) => n.id)).toEqual(['isolated']);
  });

  it('directed behavior is unchanged', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    expect(getSuccessors(g, 'b').map((n) => n.id)).toEqual(['c']);
    expect(getPredecessors(g, 'b').map((n) => n.id)).toEqual(['a']);
    expect(getSources(g).map((n) => n.id)).toEqual(['a']);
    expect(getSinks(g).map((n) => n.id)).toEqual(['c']);
    expect(getInDegree(g, 'b')).toBe(1);
    expect(getOutDegree(g, 'b')).toBe(1);
  });
});

describe('index staleness on array replacement', () => {
  it('rebuilds the index when graph.edges is replaced with a same-length array', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    expect(getSuccessors(g, 'a').map((n) => n.id)).toEqual(['b']);

    // Immutable-style update: new array, same length
    g.edges = g.edges.map((e) => ({ ...e, sourceId: 'b', targetId: 'a' }));
    expect(getSuccessors(g, 'a').map((n) => n.id)).toEqual([]);
    expect(getSuccessors(g, 'b').map((n) => n.id)).toEqual(['a']);
  });

  it('rebuilds the index when graph.nodes is replaced with a same-length array', () => {
    const g = createGraph({
      nodes: [{ id: 'p' }, { id: 'c', parentId: 'p' }],
    });
    expect(getSuccessors(g, 'p')).toEqual([]);
    g.nodes = g.nodes.map((n) =>
      n.id === 'c' ? { ...n, parentId: null } : n,
    );
    // index must reflect the reparenting
    expect(getChildren(g, 'p')).toEqual([]);
  });
});

describe('diff covers ports, weight, mode and port refs', () => {
  it('detects port changes on nodes', () => {
    const a = createGraph({ nodes: [{ id: 'n', ports: [{ name: 'p' }] }] });
    const b = createGraph({
      nodes: [{ id: 'n', ports: [{ name: 'p' }, { name: 'q' }] }],
    });
    expect(isEmptyDiff(getDiff(a, b))).toBe(false);
  });

  it('detects edge weight/mode/port-ref changes', () => {
    const nodes = [
      { id: 'x', ports: [{ name: 'out' }] },
      { id: 'y', ports: [{ name: 'in' }] },
    ];
    const a = createGraph({
      nodes,
      edges: [{ id: 'e', sourceId: 'x', targetId: 'y', weight: 1 }],
    });
    const b = createGraph({
      nodes,
      edges: [
        {
          id: 'e',
          sourceId: 'x',
          targetId: 'y',
          weight: 2,
          mode: 'undirected',
          sourcePort: 'out',
        },
      ],
    });
    const diff = getDiff(a, b);
    expect(diff.edges.updated).toHaveLength(1);
    expect(diff.edges.updated[0].new).toMatchObject({
      weight: 2,
      mode: 'undirected',
      sourcePort: 'out',
    });
  });

  it('diff → patches → apply converges for visual props', () => {
    const a = createGraph({ nodes: [{ id: 'n', x: 0 }] });
    const b = createGraph({ nodes: [{ id: 'n', x: 100, color: 'red' }] });
    updateGraphWithPatches(a, getPatches(a, b));
    expect(isEmptyDiff(getDiff(a, b))).toBe(true);
  });

  it('diff → patches → apply converges when fields are removed', () => {
    const a = createGraph({
      nodes: [{ id: 'x', shape: 'circle' }, { id: 'y' }],
      edges: [{ id: 'e', sourceId: 'x', targetId: 'y', weight: 5 }],
    });
    const b = createGraph({
      nodes: [{ id: 'x' }, { id: 'y' }],
      edges: [{ id: 'e', sourceId: 'x', targetId: 'y' }],
    });
    updateGraphWithPatches(a, getPatches(a, b));
    expect(isEmptyDiff(getDiff(a, b))).toBe(true);
    expect('weight' in a.edges[0]).toBe(false);
    expect('shape' in a.nodes[0]).toBe(false);
  });

  it('diff → patches → apply converges for port changes', () => {
    const a = createGraph({ nodes: [{ id: 'n', ports: [{ name: 'p' }] }] });
    const b = createGraph({ nodes: [{ id: 'n', ports: [{ name: 'q' }] }] });
    updateGraphWithPatches(a, getPatches(a, b));
    expect(isEmptyDiff(getDiff(a, b))).toBe(true);
  });

  it('added nodes/edges keep ports, weight, mode and port refs', () => {
    const empty = createGraph();
    const b = createGraph({
      nodes: [
        { id: 'x', ports: [{ name: 'out' }] },
        { id: 'y', ports: [{ name: 'in' }] },
      ],
      edges: [
        {
          id: 'e',
          sourceId: 'x',
          targetId: 'y',
          weight: 2,
          mode: 'undirected',
          sourcePort: 'out',
          targetPort: 'in',
        },
      ],
    });
    updateGraphWithPatches(empty, getPatches(empty, b));
    expect(isEmptyDiff(getDiff(empty, b))).toBe(true);
    expect(empty.edges[0].sourcePort).toBe('out');
    expect(empty.nodes[0].ports?.[0].name).toBe('out');
  });

  it('applying an inverted diff restores the original graph', () => {
    const a = createGraph({ nodes: [{ id: 'n', x: 0 }] });
    const b = createGraph({ nodes: [{ id: 'n', x: 100 }] });
    const inverted = getInvertedDiff(getDiff(a, b));
    const c = createGraph({ nodes: [{ id: 'n', x: 100 }] });
    updateGraphWithPatches(c, toPatches(inverted));
    expect(isEmptyDiff(getDiff(c, a))).toBe(true);
  });
});

describe('transforms preserve ports, mode and weight', () => {
  it('getReversedGraph swaps port references and keeps mode/weight/node ports', () => {
    const g = createGraph({
      nodes: [
        { id: 'a', ports: [{ name: 'out' }] },
        { id: 'b', ports: [{ name: 'in' }] },
      ],
      edges: [
        {
          id: 'e',
          sourceId: 'a',
          targetId: 'b',
          sourcePort: 'out',
          targetPort: 'in',
          mode: 'undirected',
          weight: 3,
        },
      ],
    });
    const rev = getReversedGraph(g);
    const e = rev.edges[0];
    expect(e.sourceId).toBe('b');
    expect(e.targetId).toBe('a');
    expect(e.sourcePort).toBe('in');
    expect(e.targetPort).toBe('out');
    expect(e.mode).toBe('undirected');
    expect(e.weight).toBe(3);
    expect(rev.nodes[0].ports?.[0].name).toBe('out');
  });

  it('getSubgraph keeps ports and per-edge mode, strips dangling initialNodeId', () => {
    const g = createGraph({
      nodes: [
        { id: 'p', initialNodeId: 'outside', ports: [{ name: 'x' }] },
        { id: 'q' },
        { id: 'outside' },
      ],
      edges: [{ id: 'e', sourceId: 'p', targetId: 'q', mode: 'undirected' }],
    });
    const sub = getSubgraph(g, ['p', 'q']);
    expect(sub.nodes[0].ports?.[0].name).toBe('x');
    expect(sub.nodes[0].initialNodeId ?? null).toBe(null);
    expect(sub.edges[0].mode).toBe('undirected');
  });

  it('getFlattenedGraph preserves authored leaf self-loops with weight and mode', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'loop', sourceId: 'a', targetId: 'a', weight: 2, mode: 'undirected' },
        { id: 'e', sourceId: 'a', targetId: 'b' },
      ],
    });
    const flat = getFlattenedGraph(g);
    const loop = flat.edges.find((e) => e.sourceId === 'a' && e.targetId === 'a');
    expect(loop).toBeDefined();
    expect(loop?.weight).toBe(2);
    expect(loop?.mode).toBe('undirected');
  });

  it('getFlattenedGraph resolves graph initialNodeId to the initial leaf', () => {
    const g = createGraph({
      initialNodeId: 'p',
      nodes: [
        { id: 'p', initialNodeId: 'c1' },
        { id: 'c1', parentId: 'p' },
        { id: 'c2', parentId: 'p' },
      ],
    });
    expect(getFlattenedGraph(g).initialNodeId).toBe('c1');
  });

  it('getFlattenedGraph survives malformed initialNodeId cycles', () => {
    const g = createGraph({
      nodes: [
        { id: 'p', initialNodeId: 'q' },
        { id: 'q', parentId: 'p', initialNodeId: 'p' },
        { id: 'r', parentId: 'q' },
      ],
    });
    expect(() => getFlattenedGraph(g)).not.toThrow();
  });
});

describe('equivalence is symmetric', () => {
  it('areEntitiesEqual sees fields present on only one side', () => {
    const a = createGraphNode({ id: 'n' });
    const b = createGraphNode({ id: 'n', color: 'red' });
    expect(areEntitiesEqual(a, b)).toBe(false);
    expect(areEntitiesEqual(b, a)).toBe(false);
  });

  it('isNonLayoutEqual is symmetric for non-layout fields', () => {
    const a = createGraphNode({ id: 'n' });
    const b = createGraphNode({ id: 'n', ports: [{ name: 'p' }] });
    expect(isNonLayoutEqual(a, b)).toBe(false);
    expect(isNonLayoutEqual(b, a)).toBe(false);
  });
});

describe('mode-aware walks', () => {
  it('random walk traverses undirected edges both ways', () => {
    const g = createGraph({
      mode: 'undirected',
      initialNodeId: 'b',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    const steps = [...genWalkSteps(genRandomWalk(g, { seed: 1 }), 1)];
    expect(steps).toHaveLength(1);
    expect(steps[0].node.id).toBe('a');
  });

  it('predefined walk traverses non-directed edges backwards', () => {
    const g = createGraph({
      mode: 'undirected',
      initialNodeId: 'b',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    const steps = [...genPredefinedWalk(g, ['e'])];
    expect(steps[0].node.id).toBe('a');
  });

  it('predefined walk still rejects traversing directed edges backwards', () => {
    const g = createGraph({
      initialNodeId: 'b',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e', sourceId: 'a', targetId: 'b' }],
    });
    expect(() => [...genPredefinedWalk(g, ['e'])]).toThrowError(
      /current position/,
    );
  });

  it('quick walk never traverses filtered-out edges during detours', () => {
    const g = createGraph({
      initialNodeId: 'a',
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' }, // forbidden
        { id: 'e3', sourceId: 'c', targetId: 'd' },
      ],
    });
    const steps = [
      ...genQuickRandomWalk(g, { seed: 1, filter: (e) => e.id !== 'e2' }),
    ];
    expect(steps.map((s) => s.edge.id)).not.toContain('e2');
    // e3 is unreachable without e2, so the walk ends after e1
    expect(steps.map((s) => s.edge.id)).toEqual(['e1']);
  });

  it('genWalkUntilNodeCoverage yields no steps when target is already met', () => {
    const g = createGraph({
      initialNodeId: 'a',
      nodes: [{ id: 'a' }],
      edges: [{ id: 'loop', sourceId: 'a', targetId: 'a' }],
    });
    const steps = [
      ...genWalkUntilNodeCoverage(genRandomWalk(g, { seed: 1 }), g, 1),
    ];
    expect(steps).toHaveLength(0);
  });
});
