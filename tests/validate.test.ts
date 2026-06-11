import { describe, it, expect } from 'vitest';
import { createGraph } from '../src/graph';
import { getGraphIssues, type GraphIssue } from '../src/validate';
import type { Graph } from '../src/types';

function codes(issues: GraphIssue[]): string[] {
  return issues.map((i) => i.code);
}

describe('getGraphIssues', () => {
  it('returns [] for a valid graph', () => {
    const graph = createGraph({
      id: 'g',
      initialNodeId: 'a',
      nodes: [
        { id: 'a', ports: [{ name: 'out', direction: 'out' }] },
        { id: 'b', parentId: 'a', initialNodeId: null },
      ],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b', sourcePort: 'out' },
      ],
    });
    expect(getGraphIssues(graph)).toEqual([]);
  });

  it('returns [] for an empty graph', () => {
    expect(getGraphIssues(createGraph())).toEqual([]);
  });

  it('reports duplicate node ids', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'a' }, { id: 'b' }],
    });
    const issues = getGraphIssues(graph).filter(
      (i) => i.code === 'duplicate-node-id',
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].path).toEqual(['nodes', 0, 'id']);
    expect(issues[1].path).toEqual(['nodes', 1, 'id']);
    expect(issues[0].message).toContain('"a"');
    expect(issues[0].message).toContain('unique');
  });

  it('reports duplicate edge ids', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e1', sourceId: 'b', targetId: 'a' },
      ],
    });
    const issues = getGraphIssues(graph).filter(
      (i) => i.code === 'duplicate-edge-id',
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].message).toContain('"e1"');
  });

  it('reports dangling edge endpoints', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }],
      edges: [{ id: 'e1', sourceId: 'ghost', targetId: 'phantom' }],
    });
    const issues = getGraphIssues(graph).filter(
      (i) => i.code === 'dangling-edge-endpoint',
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].path).toEqual(['edges', 0, 'sourceId']);
    expect(issues[0].message).toContain('"e1"');
    expect(issues[0].message).toContain('"ghost"');
    expect(issues[1].path).toEqual(['edges', 0, 'targetId']);
    expect(issues[1].message).toContain('"phantom"');
  });

  it('reports parentId referencing a missing node', () => {
    const graph = createGraph({
      nodes: [{ id: 'a', parentId: 'missing' }],
    });
    const issues = getGraphIssues(graph).filter(
      (i) => i.code === 'missing-parent',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toEqual(['nodes', 0, 'parentId']);
    expect(issues[0].message).toContain('"a"');
    expect(issues[0].message).toContain('"missing"');
  });

  it('reports a parent cycle once, naming the nodes in the cycle', () => {
    const graph = createGraph({
      nodes: [
        { id: 'x', parentId: 'y' },
        { id: 'y', parentId: 'x' },
        // Tail into the cycle — must not produce a second report
        { id: 'z', parentId: 'x' },
      ],
    });
    const issues = getGraphIssues(graph).filter(
      (i) => i.code === 'parent-cycle',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain('x');
    expect(issues[0].message).toContain('y');
    expect(issues[0].message).not.toContain('"z"');
  });

  it('reports each distinct parent cycle once', () => {
    const graph = createGraph({
      nodes: [
        { id: 'a', parentId: 'b' },
        { id: 'b', parentId: 'a' },
        { id: 'c', parentId: 'd' },
        { id: 'd', parentId: 'c' },
      ],
    });
    const issues = getGraphIssues(graph).filter(
      (i) => i.code === 'parent-cycle',
    );
    expect(issues).toHaveLength(2);
  });

  it('reports a self-parented node as a parent cycle', () => {
    const graph = createGraph({
      nodes: [{ id: 'a', parentId: 'a' }],
    });
    expect(codes(getGraphIssues(graph))).toContain('parent-cycle');
  });

  it('reports node initialNodeId referencing a missing node', () => {
    const graph = createGraph({
      nodes: [{ id: 'a', initialNodeId: 'missing' }],
    });
    const issues = getGraphIssues(graph).filter(
      (i) => i.code === 'missing-node-initial',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toEqual(['nodes', 0, 'initialNodeId']);
    expect(issues[0].message).toContain('"a"');
    expect(issues[0].message).toContain('"missing"');
  });

  it('accepts a node initialNodeId that exists but is not a descendant (matches validateGraph semantics)', () => {
    const graph = createGraph({
      nodes: [{ id: 'a', initialNodeId: 'b' }, { id: 'b' }],
    });
    expect(getGraphIssues(graph)).toEqual([]);
  });

  it('reports graph.initialNodeId referencing a missing node', () => {
    const graph = createGraph({
      initialNodeId: 'missing',
      nodes: [{ id: 'a' }],
    });
    const issues = getGraphIssues(graph).filter(
      (i) => i.code === 'missing-initial-node',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].path).toEqual(['initialNodeId']);
    expect(issues[0].message).toContain('"missing"');
  });

  it('reports duplicate port names on a node', () => {
    // createGraph throws on duplicate port names, so author the node
    // directly (untrusted input).
    const graph = createGraph();
    graph.nodes.push({
      type: 'node',
      id: 'a',
      parentId: null,
      label: null,
      data: null,
      ports: [
        { name: 'p', direction: 'in', data: null },
        { name: 'p', direction: 'out', data: null },
      ],
    });
    const issues = getGraphIssues(graph).filter(
      (i) => i.code === 'duplicate-port-name',
    );
    expect(issues).toHaveLength(2);
    expect(issues[0].path).toEqual(['nodes', 0, 'ports', 0, 'name']);
    expect(issues[0].message).toContain('"p"');
    expect(issues[0].message).toContain('"a"');
  });

  it('reports edge ports that do not exist on the endpoint nodes', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [],
    });
    // addEdge validates ports, so author the edge directly (untrusted input).
    graph.edges.push({
      type: 'edge',
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      sourcePort: 'nope',
      targetPort: 'nada',
      label: null,
      data: null,
    });
    const issues = getGraphIssues(graph);
    const srcIssues = issues.filter((i) => i.code === 'missing-source-port');
    const tgtIssues = issues.filter((i) => i.code === 'missing-target-port');
    expect(srcIssues).toHaveLength(1);
    expect(srcIssues[0].path).toEqual(['edges', 0, 'sourcePort']);
    expect(srcIssues[0].message).toContain('"nope"');
    expect(srcIssues[0].message).toContain('"a"');
    expect(tgtIssues).toHaveLength(1);
    expect(tgtIssues[0].path).toEqual(['edges', 0, 'targetPort']);
    expect(tgtIssues[0].message).toContain('"nada"');
    expect(tgtIssues[0].message).toContain('"b"');
  });

  it('skips port checks for edges whose endpoint node is missing', () => {
    const graph = createGraph({ nodes: [], edges: [] });
    graph.edges.push({
      type: 'edge',
      id: 'e1',
      sourceId: 'ghost',
      targetId: 'ghost',
      sourcePort: 'p',
      label: null,
      data: null,
    });
    const issueCodes = codes(getGraphIssues(graph));
    expect(issueCodes).toContain('dangling-edge-endpoint');
    expect(issueCodes).not.toContain('missing-source-port');
  });

  it('does not throw and does not mutate the input', () => {
    const graph: Graph = createGraph({
      nodes: [
        { id: 'x', parentId: 'y' },
        { id: 'y', parentId: 'x' },
      ],
      edges: [{ id: 'e1', sourceId: 'x', targetId: 'x' }],
    });
    const snapshot = JSON.parse(JSON.stringify(graph));
    expect(() => getGraphIssues(graph)).not.toThrow();
    expect(graph).toEqual(snapshot);
  });
});
