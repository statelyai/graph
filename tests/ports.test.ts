import { describe, it, expect } from 'vitest';
import {
  createGraph,
  createGraphNode,
  createGraphEdge,
  createGraphPort,
  createVisualGraph,
  addNode,
  addEdge,
  updateNode,
  updateEdge,
  getPort,
  getPorts,
  getEdgesByPort,
} from '../src';

describe('createGraphPort', () => {
  it('creates a port with defaults', () => {
    const port = createGraphPort({ name: 'out' });
    expect(port).toEqual({
      name: 'out',
      direction: 'inout',
      data: null,
    });
  });

  it('creates a port with all options', () => {
    const port = createGraphPort({
      name: 'input',
      direction: 'in',
      label: 'Input',
      data: { type: 'number' },
      x: 10,
      y: 20,
    });
    expect(port.name).toBe('input');
    expect(port.direction).toBe('in');
    expect(port.label).toBe('Input');
    expect(port.data).toEqual({ type: 'number' });
    expect(port.x).toBe(10);
    expect(port.y).toBe(20);
  });

  it('throws on empty name', () => {
    expect(() => createGraphPort({ name: '' })).toThrow(
      'Port name must be a non-empty string',
    );
  });
});

describe('nodes with ports', () => {
  it('creates a node with ports', () => {
    const node = createGraphNode({
      id: 'a',
      ports: [
        { name: 'in', direction: 'in' },
        { name: 'out', direction: 'out' },
      ],
    });
    expect(node.ports).toHaveLength(2);
    expect(node.ports![0].name).toBe('in');
    expect(node.ports![0].direction).toBe('in');
    expect(node.ports![1].name).toBe('out');
    expect(node.ports![1].direction).toBe('out');
  });

  it('creates a node without ports (undefined)', () => {
    const node = createGraphNode({ id: 'a' });
    expect(node.ports).toBeUndefined();
  });

  it('throws on duplicate port names', () => {
    expect(() =>
      createGraphNode({
        id: 'a',
        ports: [
          { name: 'out', direction: 'out' },
          { name: 'out', direction: 'out' },
        ],
      }),
    ).toThrow('Duplicate port name "out"');
  });
});

describe('edges with ports', () => {
  it('creates an edge with port references', () => {
    const edge = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      sourcePort: 'out',
      targetPort: 'in',
    });
    expect(edge.sourcePort).toBe('out');
    expect(edge.targetPort).toBe('in');
  });

  it('creates an edge without port references', () => {
    const edge = createGraphEdge({
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
    });
    expect(edge.sourcePort).toBeUndefined();
    expect(edge.targetPort).toBeUndefined();
  });
});

describe('createGraph with ports', () => {
  it('creates a graph with ports on nodes and edges', () => {
    const graph = createGraph({
      nodes: [
        {
          id: 'a',
          ports: [{ name: 'out', direction: 'out' }],
        },
        {
          id: 'b',
          ports: [{ name: 'in', direction: 'in' }],
        },
      ],
      edges: [
        {
          id: 'e1',
          sourceId: 'a',
          targetId: 'b',
          sourcePort: 'out',
          targetPort: 'in',
        },
      ],
    });
    expect(graph.nodes[0].ports).toHaveLength(1);
    expect(graph.edges[0].sourcePort).toBe('out');
    expect(graph.edges[0].targetPort).toBe('in');
  });
});

describe('addEdge port validation', () => {
  it('validates sourcePort exists on source node', () => {
    const graph = createGraph({
      nodes: [
        { id: 'a', ports: [{ name: 'out', direction: 'out' }] },
        { id: 'b' },
      ],
    });
    expect(() =>
      addEdge(graph, {
        id: 'e1',
        sourceId: 'a',
        targetId: 'b',
        sourcePort: 'missing',
      }),
    ).toThrow('Port "missing" does not exist on source node "a"');
  });

  it('validates targetPort exists on target node', () => {
    const graph = createGraph({
      nodes: [
        { id: 'a' },
        { id: 'b', ports: [{ name: 'in', direction: 'in' }] },
      ],
    });
    expect(() =>
      addEdge(graph, {
        id: 'e1',
        sourceId: 'a',
        targetId: 'b',
        targetPort: 'missing',
      }),
    ).toThrow('Port "missing" does not exist on target node "b"');
  });

  it('allows valid port references', () => {
    const graph = createGraph({
      nodes: [
        { id: 'a', ports: [{ name: 'out', direction: 'out' }] },
        { id: 'b', ports: [{ name: 'in', direction: 'in' }] },
      ],
    });
    const edge = addEdge(graph, {
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
      sourcePort: 'out',
      targetPort: 'in',
    });
    expect(edge.sourcePort).toBe('out');
    expect(edge.targetPort).toBe('in');
  });

  it('allows edges without port references on nodes with ports', () => {
    const graph = createGraph({
      nodes: [
        { id: 'a', ports: [{ name: 'out' }] },
        { id: 'b' },
      ],
    });
    const edge = addEdge(graph, {
      id: 'e1',
      sourceId: 'a',
      targetId: 'b',
    });
    expect(edge.sourcePort).toBeUndefined();
  });
});

describe('updateNode with ports', () => {
  it('updates ports on a node', () => {
    const graph = createGraph({
      nodes: [{ id: 'a', ports: [{ name: 'old' }] }],
    });
    const updated = updateNode(graph, 'a', {
      ports: [{ name: 'new', direction: 'out' }],
    });
    expect(updated.ports).toHaveLength(1);
    expect(updated.ports![0].name).toBe('new');
    expect(updated.ports![0].direction).toBe('out');
  });

  it('rejects duplicate port names in update', () => {
    const graph = createGraph({
      nodes: [{ id: 'a' }],
    });
    expect(() =>
      updateNode(graph, 'a', {
        ports: [{ name: 'x' }, { name: 'x' }],
      }),
    ).toThrow('Duplicate port name "x"');
  });
});

describe('updateEdge with ports', () => {
  it('updates port references on an edge', () => {
    const graph = createGraph({
      nodes: [
        { id: 'a', ports: [{ name: 'out1' }, { name: 'out2' }] },
        { id: 'b', ports: [{ name: 'in' }] },
      ],
      edges: [
        {
          id: 'e1',
          sourceId: 'a',
          targetId: 'b',
          sourcePort: 'out1',
          targetPort: 'in',
        },
      ],
    });
    const updated = updateEdge(graph, 'e1', { sourcePort: 'out2' });
    expect(updated.sourcePort).toBe('out2');
    expect(updated.targetPort).toBe('in');
  });

  it('rejects invalid port on update', () => {
    const graph = createGraph({
      nodes: [
        { id: 'a', ports: [{ name: 'out' }] },
        { id: 'b' },
      ],
      edges: [{ id: 'e1', sourceId: 'a', targetId: 'b', sourcePort: 'out' }],
    });
    expect(() => updateEdge(graph, 'e1', { sourcePort: 'nope' })).toThrow(
      'Port "nope" does not exist on source node "a"',
    );
  });
});

describe('port queries', () => {
  const graph = createGraph({
    nodes: [
      {
        id: 'func',
        ports: [
          { name: 'input', direction: 'in' },
          { name: 'output-1', direction: 'out' },
          { name: 'output-2', direction: 'out' },
        ],
      },
      {
        id: 'debug',
        ports: [{ name: 'input', direction: 'in' }],
      },
      { id: 'plain' },
    ],
    edges: [
      {
        id: 'e1',
        sourceId: 'func',
        targetId: 'debug',
        sourcePort: 'output-1',
        targetPort: 'input',
      },
    ],
  });

  describe('getPort', () => {
    it('returns a port by name', () => {
      const port = getPort(graph, 'func', 'input');
      expect(port).toBeDefined();
      expect(port!.name).toBe('input');
      expect(port!.direction).toBe('in');
    });

    it('returns undefined for missing port', () => {
      expect(getPort(graph, 'func', 'missing')).toBeUndefined();
    });

    it('returns undefined for missing node', () => {
      expect(getPort(graph, 'missing', 'input')).toBeUndefined();
    });

    it('returns undefined for node without ports', () => {
      expect(getPort(graph, 'plain', 'input')).toBeUndefined();
    });
  });

  describe('getPorts', () => {
    it('returns all ports of a node', () => {
      const ports = getPorts(graph, 'func');
      expect(ports).toHaveLength(3);
      expect(ports.map((p) => p.name)).toEqual([
        'input',
        'output-1',
        'output-2',
      ]);
    });

    it('returns [] for node without ports', () => {
      expect(getPorts(graph, 'plain')).toEqual([]);
    });

    it('returns [] for missing node', () => {
      expect(getPorts(graph, 'missing')).toEqual([]);
    });
  });

  describe('getEdgesByPort', () => {
    it('returns edges connected to a source port', () => {
      const edges = getEdgesByPort(graph, 'func', 'output-1');
      expect(edges).toHaveLength(1);
      expect(edges[0].id).toBe('e1');
    });

    it('returns edges connected to a target port', () => {
      const edges = getEdgesByPort(graph, 'debug', 'input');
      expect(edges).toHaveLength(1);
      expect(edges[0].id).toBe('e1');
    });

    it('returns [] for unused port', () => {
      expect(getEdgesByPort(graph, 'func', 'output-2')).toEqual([]);
    });

    it('returns [] for missing node', () => {
      expect(getEdgesByPort(graph, 'missing', 'input')).toEqual([]);
    });
  });
});

describe('visual graph with ports', () => {
  it('resolves visual port positions', () => {
    const graph = createVisualGraph({
      nodes: [
        {
          id: 'a',
          x: 0,
          y: 0,
          width: 100,
          height: 50,
          ports: [{ name: 'out', direction: 'out', x: 90, y: 25 }],
        },
      ],
    });
    const port = graph.nodes[0].ports![0];
    expect(port.x).toBe(90);
    expect(port.y).toBe(25);
    expect(port.width).toBe(0);
    expect(port.height).toBe(0);
    expect(port.direction).toBe('out');
  });

  it('defaults visual port positions to 0', () => {
    const graph = createVisualGraph({
      nodes: [
        {
          id: 'a',
          ports: [{ name: 'p' }],
        },
      ],
    });
    const port = graph.nodes[0].ports![0];
    expect(port.x).toBe(0);
    expect(port.y).toBe(0);
    expect(port.width).toBe(0);
    expect(port.height).toBe(0);
  });
});

describe('generic port data', () => {
  it('preserves typed port data', () => {
    type PortData = { type: 'string' | 'number' };
    const graph = createGraph<any, any, any, PortData>({
      nodes: [
        {
          id: 'a',
          ports: [
            { name: 'in', direction: 'in', data: { type: 'number' } },
            { name: 'out', direction: 'out', data: { type: 'string' } },
          ],
        },
      ],
    });
    const ports = getPorts(graph, 'a');
    expect(ports[0].data.type).toBe('number');
    expect(ports[1].data.type).toBe('string');
  });
});
