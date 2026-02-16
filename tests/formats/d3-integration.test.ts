import { describe, it, expect } from 'vitest';
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
} from 'd3-force';
import { toD3Graph, fromD3Graph } from '../../src/formats/d3';
import { createGraph, getShortestPath } from '../../src';
import type { D3Graph } from '../../src';

describe('D3 force integration', () => {
  describe('our Graph → D3 force simulation', () => {
    it('runs a force simulation on converted graph data', () => {
      const graph = createGraph({
        nodes: [
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' },
          { id: 'c', label: 'Gamma' },
          { id: 'd', label: 'Delta' },
        ],
        edges: [
          { id: 'e1', sourceId: 'a', targetId: 'b' },
          { id: 'e2', sourceId: 'b', targetId: 'c' },
          { id: 'e3', sourceId: 'c', targetId: 'd' },
          { id: 'e4', sourceId: 'a', targetId: 'd' },
        ],
      });

      const d3Data = toD3Graph(graph);

      // D3 force simulation accepts our data directly
      const simulation = forceSimulation(d3Data.nodes)
        .force(
          'link',
          forceLink(d3Data.links).id((d: any) => d.id),
        )
        .force('charge', forceManyBody())
        .force('center', forceCenter(0, 0))
        .stop();

      // Run simulation for some ticks
      for (let i = 0; i < 100; i++) simulation.tick();

      // After simulation, nodes have x,y positions assigned by D3
      for (const node of d3Data.nodes) {
        expect(typeof node.x).toBe('number');
        expect(typeof node.y).toBe('number');
        expect(isFinite(node.x!)).toBe(true);
        expect(isFinite(node.y!)).toBe(true);
      }

      // Nodes aren't all stacked on top of each other
      const positions = d3Data.nodes.map((n) => ({ x: n.x, y: n.y }));
      const allSame = positions.every(
        (p) => p.x === positions[0].x && p.y === positions[0].y,
      );
      expect(allSame).toBe(false);
    });

    it('preserves labels and custom data through D3', () => {
      const graph = createGraph({
        nodes: [
          { id: 'a', label: 'Server', data: { type: 'compute' } },
          { id: 'b', label: 'DB', data: { type: 'storage' } },
        ],
        edges: [
          { id: 'e1', sourceId: 'a', targetId: 'b' },
        ],
      });

      const d3Data = toD3Graph(graph);

      // D3 simulation mutates in place, but our extra properties survive
      const simulation = forceSimulation(d3Data.nodes)
        .force(
          'link',
          forceLink(d3Data.links).id((d: any) => d.id),
        )
        .stop();

      for (let i = 0; i < 50; i++) simulation.tick();

      // Extra properties are preserved alongside D3's x/y/vx/vy
      expect(d3Data.nodes[0].label).toBe('Server');
      expect(d3Data.nodes[0].data).toEqual({ type: 'compute' });
      expect(d3Data.nodes[1].label).toBe('DB');
    });
  });

  describe('D3 → our Graph (post-simulation)', () => {
    it('imports D3 post-simulation data with object references', () => {
      // After D3 simulation runs, source/target on links become object refs
      const d3Data: D3Graph = {
        nodes: [
          { id: 'x', label: 'X' },
          { id: 'y', label: 'Y' },
          { id: 'z', label: 'Z' },
        ],
        links: [
          { source: 'x', target: 'y' },
          { source: 'y', target: 'z' },
        ],
      };

      // Simulate D3's mutation of source/target to objects
      const simulation = forceSimulation(d3Data.nodes)
        .force(
          'link',
          forceLink(d3Data.links).id((d: any) => d.id),
        )
        .stop();

      for (let i = 0; i < 10; i++) simulation.tick();

      // After simulation, links.source/target are node objects, not strings
      expect(typeof d3Data.links[0].source).toBe('object');

      // Our converter handles this
      const graph = fromD3Graph(d3Data);
      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(2);
      expect(graph.edges[0].sourceId).toBe('x');
      expect(graph.edges[0].targetId).toBe('y');

      // D3-assigned positions are preserved
      for (const node of graph.nodes) {
        expect(typeof node.x).toBe('number');
        expect(typeof node.y).toBe('number');
      }

      // Our algorithms work on the imported graph
      const path = getShortestPath(graph, { from: 'x', to: 'z' });
      expect(path).not.toBeUndefined();
      expect(path!.steps).toHaveLength(2);
    });

    it('imports a D3 graph built from scratch', () => {
      // Someone builds a graph in raw D3 format
      const d3Data: D3Graph = {
        nodes: [
          { id: 'api', label: 'API Gateway' },
          { id: 'auth', label: 'Auth Service' },
          { id: 'users', label: 'User DB' },
          { id: 'cache', label: 'Redis' },
        ],
        links: [
          { source: 'api', target: 'auth' },
          { source: 'auth', target: 'users' },
          { source: 'auth', target: 'cache' },
          { source: 'api', target: 'cache' },
        ],
      };

      const graph = fromD3Graph(d3Data);

      expect(graph.nodes).toHaveLength(4);
      expect(graph.edges).toHaveLength(4);

      // Run our algorithms on it
      const path = getShortestPath(graph, { from: 'api', to: 'users' });
      expect(path).not.toBeUndefined();
      expect(path!.steps).toHaveLength(2); // api → auth → users
    });
  });

  describe('full round-trip: our Graph → D3 simulate → our Graph', () => {
    it('round-trips through D3 simulation, positions come back', () => {
      const original = createGraph({
        nodes: [
          { id: 'a' },
          { id: 'b' },
          { id: 'c' },
        ],
        edges: [
          { id: 'e1', sourceId: 'a', targetId: 'b' },
          { id: 'e2', sourceId: 'b', targetId: 'c' },
        ],
      });

      // Our Graph → D3
      const d3Data = toD3Graph(original);

      // Run D3 simulation to lay out positions
      const simulation = forceSimulation(d3Data.nodes)
        .force(
          'link',
          forceLink(d3Data.links).id((d: any) => d.id),
        )
        .force('charge', forceManyBody().strength(-100))
        .force('center', forceCenter(0, 0))
        .stop();

      for (let i = 0; i < 200; i++) simulation.tick();

      // D3 → our Graph (with layout positions baked in)
      const layouted = fromD3Graph(d3Data);

      expect(layouted.nodes).toHaveLength(3);
      expect(layouted.edges).toHaveLength(2);

      // Every node now has x,y from D3's layout
      for (const node of layouted.nodes) {
        expect(node.x).toBeDefined();
        expect(node.y).toBeDefined();
        expect(isFinite(node.x!)).toBe(true);
        expect(isFinite(node.y!)).toBe(true);
      }

      // Our algorithms still work on the layouted graph
      const path = getShortestPath(layouted, { from: 'a', to: 'c' });
      expect(path).not.toBeUndefined();
      expect(path!.steps).toHaveLength(2);
    });
  });
});
