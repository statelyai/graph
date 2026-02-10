import { describe, it, expect } from 'vitest';
import type { Graph } from '../src/types';
import {
  createGraph,
  getNode,
  getEdge,
  hasNode,
  hasEdge,
  addNode,
  addEdge,
  deleteNode,
  deleteEdge,
  updateNode,
  updateEdge,
  addEntities,
  deleteEntities,
  updateEntities,
  GraphInstance,
} from '../src/graph';

describe('createGraph', () => {
  it('creates an empty directed graph by default', () => {
    const g = createGraph();
    expect(g.id).toBe('');
    expect(g.type).toBe('directed');
    expect(g.nodes).toEqual([]);
    expect(g.edges).toEqual([]);
  });

  it('creates a graph from config', () => {
    const g = createGraph({
      id: 'g1',
      type: 'undirected',
      nodes: [{ id: 'a', label: 'A' }],
      edges: [],
      data: { name: 'test' },
    });
    expect(g.id).toBe('g1');
    expect(g.type).toBe('undirected');
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0]).toEqual({
      type: 'node',
      id: 'a',
      parentId: null,
      initialNodeId: null,
      label: 'A',
      data: undefined,
    });
    expect(g.data).toEqual({ name: 'test' });
  });

  it('resolves default values for nodes and edges', () => {
    const g = createGraph({
      nodes: [{ id: 'n1' }],
      edges: [],
    });
    expect(g.nodes[0].parentId).toBe(null);
    expect(g.nodes[0].label).toBe('');
    expect(g.nodes[0].type).toBe('node');
  });

  it('supports plain object literal via satisfies', () => {
    const g = {
      id: 'manual',
      type: 'directed',
      initialNodeId: null,
      nodes: [
        {
          type: 'node',
          id: 'a',
          parentId: null,
          initialNodeId: null,
          label: 'A',
          data: null,
        },
      ],
      edges: [],
      data: null,
    } satisfies Graph;

    expect(hasNode(g, 'a')).toBe(true);
    expect(getNode(g, 'a')?.label).toBe('A');
  });

  it('supports type annotation', () => {
    const g: Graph = {
      id: 'typed',
      type: 'directed',
      initialNodeId: null,
      nodes: [],
      edges: [],
      data: undefined,
    };
    expect(g.nodes).toEqual([]);
  });
});

describe('Lookup helpers', () => {
  it('getNode() / getEdge()', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(getNode(g, 'a')?.id).toBe('a');
    expect(getNode(g, 'missing')).toBeUndefined();
    expect(getEdge(g, 'e1')?.sourceId).toBe('a');
    expect(getEdge(g, 'missing')).toBeUndefined();
  });

  it('hasNode() / hasEdge()', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }],
      edges: [],
    });
    expect(hasNode(g, 'a')).toBe(true);
    expect(hasNode(g, 'b')).toBe(false);
    expect(hasEdge(g, 'e1')).toBe(false);
  });
});

describe('Mutable: addNode / addEdge', () => {
  it('addNode() mutates in place', () => {
    const g = createGraph();
    const node = addNode(g, { id: 'a', label: 'A' });
    expect(node.type).toBe('node');
    expect(node.id).toBe('a');
    expect(g.nodes).toHaveLength(1);
  });

  it('addNode() throws on duplicate id', () => {
    const g = createGraph({ nodes: [{ id: 'a' }] });
    expect(() => addNode(g, { id: 'a' })).toThrow('already exists');
  });

  it('addNode() throws on invalid parentId', () => {
    const g = createGraph();
    expect(() => addNode(g, { id: 'a', parentId: 'missing' })).toThrow(
      'does not exist',
    );
  });

  it('addEdge() mutates in place', () => {
    const g = createGraph({ nodes: [{ id: 'a' }, { id: 'b' }] });
    const edge = addEdge(g, { id: 'e1', sourceId: 'a', targetId: 'b' });
    expect(edge.type).toBe('edge');
    expect(g.edges).toHaveLength(1);
  });

  it('addEdge() throws on missing source/target', () => {
    const g = createGraph({ nodes: [{ id: 'a' }] });
    expect(() =>
      addEdge(g, { id: 'e1', sourceId: 'a', targetId: 'missing' }),
    ).toThrow('does not exist');
  });
});

describe('Mutable: deleteNode / deleteEdge', () => {
  it('deleteNode() removes node and connected edges', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    deleteNode(g, 'b');
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(0);
  });

  it('deleteNode() cascade deletes children', () => {
    const g = createGraph({
      nodes: [
        { id: 'root' },
        { id: 'child', parentId: 'root' },
        { id: 'grandchild', parentId: 'child' },
        { id: 'other' },
      ],
      edges: [{ id: 'e1', sourceId: 'grandchild', targetId: 'other' }],
    });
    deleteNode(g, 'root');
    expect(g.nodes).toHaveLength(1);
    expect(g.nodes[0].id).toBe('other');
    expect(g.edges).toHaveLength(0);
  });

  it('deleteNode({ reparent: true }) re-parents children', () => {
    const g = createGraph({
      nodes: [
        { id: 'root' },
        { id: 'mid', parentId: 'root' },
        { id: 'leaf', parentId: 'mid' },
      ],
      edges: [],
    });
    deleteNode(g, 'mid', { reparent: true });
    expect(g.nodes).toHaveLength(2);
    expect(getNode(g, 'leaf')?.parentId).toBe('root');
  });

  it('deleteEdge() mutates in place', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    deleteEdge(g, 'e1');
    expect(g.edges).toHaveLength(0);
  });
});

describe('Mutable: updateNode / updateEdge', () => {
  it('updateNode() mutates in place', () => {
    const g = createGraph({ nodes: [{ id: 'a', label: 'old' }] });
    const updated = updateNode(g, 'a', { label: 'new' });
    expect(updated.label).toBe('new');
    expect(getNode(g, 'a')?.label).toBe('new');
  });

  it('updateNode() updates data', () => {
    const g = createGraph({ nodes: [{ id: 'a', data: { x: 1 } }] });
    updateNode(g, 'a', { data: { x: 2 } });
    expect(getNode(g, 'a')?.data).toEqual({ x: 2 });
  });

  it('updateNode() throws on missing node', () => {
    const g = createGraph();
    expect(() => updateNode(g, 'missing', { label: 'x' })).toThrow(
      'does not exist',
    );
  });

  it('updateEdge() mutates in place', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    const updated = updateEdge(g, 'e1', { targetId: 'c', label: 'updated' });
    expect(updated.targetId).toBe('c');
    expect(updated.label).toBe('updated');
    expect(getEdge(g, 'e1')?.targetId).toBe('c');
  });

  it('updateEdge() updates data', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', data: { w: 1 } }],
    });
    updateEdge(g, 'e1', { data: { w: 5 } });
    expect(getEdge(g, 'e1')?.data).toEqual({ w: 5 });
  });

  it('updateEdge() throws on missing edge', () => {
    const g = createGraph();
    expect(() => updateEdge(g, 'missing', { label: 'x' })).toThrow(
      'does not exist',
    );
  });
});

describe('JSON serialization', () => {
  it('plain graph object works with JSON.stringify', () => {
    const g = createGraph({ id: 'g1', nodes: [{ id: 'a' }] });
    const str = JSON.stringify(g);
    const parsed = JSON.parse(str);
    expect(parsed.id).toBe('g1');
    expect(parsed.nodes[0].id).toBe('a');
  });

  it('round-trips through JSON', () => {
    const g1 = createGraph({
      id: 'test',
      type: 'undirected',
      nodes: [{ id: 'a', label: 'A' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', label: 'connects' }],
      data: { meta: true },
    });
    const g2: Graph = JSON.parse(JSON.stringify(g1));
    expect(g2).toEqual(g1);
  });
});

// ---------------------------------------------------------------------------
// Batch operations
// ---------------------------------------------------------------------------

describe('Mutable batch: addEntities()', () => {
  it('adds multiple nodes and edges', () => {
    const g = createGraph();
    addEntities(g, {
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    expect(g.nodes).toHaveLength(3);
    expect(g.edges).toHaveLength(2);
  });

  it('edges can reference nodes added in same call', () => {
    const g = createGraph();
    addEntities(g, {
      nodes: [{ id: 'x' }, { id: 'y' }],
      edges: [{ id: 'e1', sourceId: 'x', targetId: 'y' }],
    });
    expect(g.edges).toHaveLength(1);
  });

  it('adds only nodes when no edges provided', () => {
    const g = createGraph();
    addEntities(g, { nodes: [{ id: 'a' }] });
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
  });

  it('adds only edges when no nodes provided', () => {
    const g = createGraph({ nodes: [{ id: 'a' }, { id: 'b' }] });
    addEntities(g, { edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }] });
    expect(g.edges).toHaveLength(1);
  });
});

describe('Mutable batch: deleteEntities()', () => {
  it('deletes a single node by id string', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    deleteEntities(g, 'a');
    expect(g.nodes).toHaveLength(1);
    expect(g.edges).toHaveLength(0);
  });

  it('deletes multiple entities by id array', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
      edges: [
        { id: 'e1', sourceId: 'a', targetId: 'b' },
        { id: 'e2', sourceId: 'b', targetId: 'c' },
      ],
    });
    deleteEntities(g, ['a', 'e2']);
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(0); // e1 removed with node a, e2 explicitly
  });

  it('auto-detects nodes vs edges', () => {
    const g = createGraph({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    deleteEntities(g, 'e1');
    expect(g.nodes).toHaveLength(2);
    expect(g.edges).toHaveLength(0);
  });

  it('supports reparent option for nodes', () => {
    const g = createGraph({
      nodes: [
        { id: 'root' },
        { id: 'mid', parentId: 'root' },
        { id: 'leaf', parentId: 'mid' },
      ],
      edges: [],
    });
    deleteEntities(g, 'mid', { reparent: true });
    expect(g.nodes).toHaveLength(2);
    expect(getNode(g, 'leaf')?.parentId).toBe('root');
  });

  it('silently skips unknown ids', () => {
    const g = createGraph({ nodes: [{ id: 'a' }] });
    deleteEntities(g, ['a', 'nonexistent']);
    expect(g.nodes).toHaveLength(0);
  });
});

describe('Mutable batch: updateEntities()', () => {
  it('updates multiple nodes and edges', () => {
    const g = createGraph({
      nodes: [
        { id: 'a', label: 'A' },
        { id: 'b', label: 'B' },
      ],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', label: 'old' }],
    });
    updateEntities(g, {
      nodes: [
        { id: 'a', label: 'A-updated' },
        { id: 'b', label: 'B-updated' },
      ],
      edges: [{ id: 'e1', label: 'new' }],
    });
    expect(getNode(g, 'a')?.label).toBe('A-updated');
    expect(getNode(g, 'b')?.label).toBe('B-updated');
    expect(getEdge(g, 'e1')?.label).toBe('new');
  });

  it('updates only nodes', () => {
    const g = createGraph({ nodes: [{ id: 'a', data: 1 }] });
    updateEntities(g, { nodes: [{ id: 'a', data: 99 }] });
    expect(getNode(g, 'a')?.data).toBe(99);
  });

  it('throws on missing entity', () => {
    const g = createGraph();
    expect(() =>
      updateEntities(g, { nodes: [{ id: 'missing', label: 'x' }] }),
    ).toThrow('does not exist');
  });
});

// ---------------------------------------------------------------------------
// GraphInstance class
// ---------------------------------------------------------------------------

describe('GraphInstance', () => {
  it('constructor creates graph from config', () => {
    const gi = new GraphInstance({
      id: 'g1',
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(gi.id).toBe('g1');
    expect(gi.nodes).toHaveLength(2);
    expect(gi.edges).toHaveLength(1);
  });

  it('GraphInstance.from() wraps existing plain graph', () => {
    const g = createGraph({ id: 'plain', nodes: [{ id: 'a' }] });
    const gi = GraphInstance.from(g);
    expect(gi.graph).toBe(g); // same reference
    expect(gi.id).toBe('plain');
  });

  it('addNode() / addEdge()', () => {
    const gi = new GraphInstance();
    gi.addNode({ id: 'a' });
    gi.addNode({ id: 'b' });
    gi.addEdge({ id: 'e1', sourceId: 'a', targetId: 'b' });
    expect(gi.nodes).toHaveLength(2);
    expect(gi.edges).toHaveLength(1);
  });

  it('deleteNode() / deleteEdge()', () => {
    const gi = new GraphInstance({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    gi.deleteEdge('e1');
    expect(gi.edges).toHaveLength(0);
    gi.deleteNode('a');
    expect(gi.nodes).toHaveLength(1);
  });

  it('updateNode() / updateEdge()', () => {
    const gi = new GraphInstance({
      nodes: [{ id: 'a', label: 'old' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', label: 'old' }],
    });
    gi.updateNode('a', { label: 'new' });
    gi.updateEdge('e1', { label: 'new' });
    expect(gi.getNode('a')?.label).toBe('new');
    expect(gi.getEdge('e1')?.label).toBe('new');
  });

  it('addEntities() batch', () => {
    const gi = new GraphInstance();
    gi.addEntities({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    expect(gi.nodes).toHaveLength(2);
    expect(gi.edges).toHaveLength(1);
  });

  it('deleteEntities() batch', () => {
    const gi = new GraphInstance({
      nodes: [{ id: 'a' }, { id: 'b' }],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
    });
    gi.deleteEntities(['a', 'e1']);
    expect(gi.nodes).toHaveLength(1);
    expect(gi.edges).toHaveLength(0);
  });

  it('updateEntities() batch', () => {
    const gi = new GraphInstance({
      nodes: [{ id: 'a', label: 'A' }],
      edges: [],
    });
    gi.updateEntities({ nodes: [{ id: 'a', label: 'updated' }] });
    expect(gi.getNode('a')?.label).toBe('updated');
  });

  it('hasNode() / hasEdge()', () => {
    const gi = new GraphInstance({
      nodes: [{ id: 'a' }],
      edges: [],
    });
    expect(gi.hasNode('a')).toBe(true);
    expect(gi.hasNode('b')).toBe(false);
    expect(gi.hasEdge('e1')).toBe(false);
  });

  it('toJSON() returns the underlying graph', () => {
    const gi = new GraphInstance({ id: 'test', nodes: [{ id: 'a' }] });
    const json = gi.toJSON();
    expect(json.id).toBe('test');
    expect(json.nodes).toHaveLength(1);
    expect(json).toBe(gi.graph);
  });

  it('works with JSON.stringify', () => {
    const gi = new GraphInstance({ id: 'test', nodes: [{ id: 'a' }] });
    const parsed = JSON.parse(JSON.stringify(gi));
    expect(parsed.id).toBe('test');
    expect(parsed.nodes[0].id).toBe('a');
  });
});
