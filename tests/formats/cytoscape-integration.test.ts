import { describe, it, expect } from 'vitest';
import cytoscape from 'cytoscape';
import { toCytoscapeJSON, fromCytoscapeJSON } from '../../src/formats/cytoscape';
import { createGraph, getShortestPath, getChildren } from '../../src';
import type { CytoscapeJSON } from '../../src/formats/cytoscape';

describe('Cytoscape.js integration', () => {
  describe('our Graph → Cytoscape.js', () => {
    it('loads a flat graph into cytoscape and queries it', () => {
      const graph = createGraph({
        nodes: [
          { id: 'a', label: 'Alpha' },
          { id: 'b', label: 'Beta' },
          { id: 'c', label: 'Gamma' },
        ],
        edges: [
          { id: 'e1', sourceId: 'a', targetId: 'b' },
          { id: 'e2', sourceId: 'b', targetId: 'c' },
          { id: 'e3', sourceId: 'a', targetId: 'c' },
        ],
      });

      const cytoJSON = toCytoscapeJSON(graph);
      const cy = cytoscape({ headless: true, elements: cytoJSON.elements });

      // Cytoscape can find and query the nodes
      expect(cy.nodes().length).toBe(3);
      expect(cy.edges().length).toBe(3);
      expect(cy.getElementById('a').data('label')).toBe('Alpha');

      // Cytoscape graph queries work
      const neighbors = cy.getElementById('b').neighborhood().nodes();
      const neighborIds = neighbors.map((n) => n.id()).sort();
      expect(neighborIds).toEqual(['a', 'c']);

      cy.destroy();
    });

    it('loads a compound graph and preserves parent-child hierarchy', () => {
      const graph = createGraph({
        nodes: [
          { id: 'parent' },
          { id: 'child1', parentId: 'parent' },
          { id: 'child2', parentId: 'parent' },
          { id: 'other' },
        ],
        edges: [
          { id: 'e1', sourceId: 'child1', targetId: 'child2' },
          { id: 'e2', sourceId: 'other', targetId: 'parent' },
        ],
      });

      const cytoJSON = toCytoscapeJSON(graph);
      const cy = cytoscape({ headless: true, elements: cytoJSON.elements });

      // Compound hierarchy is preserved
      const parentNode = cy.getElementById('parent');
      const children = parentNode.children();
      expect(children.length).toBe(2);
      expect(children.map((n) => n.id()).sort()).toEqual(['child1', 'child2']);

      // child1's parent is parent
      expect(cy.getElementById('child1').parent()[0]?.id()).toBe('parent');

      cy.destroy();
    });

    it('preserves positions through conversion', () => {
      const graph = createGraph({
        nodes: [
          { id: 'a', x: 100, y: 200 },
          { id: 'b', x: 300, y: 400 },
        ],
        edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
      });

      const cytoJSON = toCytoscapeJSON(graph);
      const cy = cytoscape({
        headless: true,
        elements: cytoJSON.elements,
        layout: { name: 'preset' }, // use positions as given
      });

      const pos = cy.getElementById('a').position();
      expect(pos.x).toBe(100);
      expect(pos.y).toBe(200);

      cy.destroy();
    });
  });

  describe('Cytoscape.js → our Graph', () => {
    it('converts a graph built entirely in cytoscape', () => {
      const cy = cytoscape({ headless: true });

      // Build a graph using the cytoscape API directly
      cy.add([
        { group: 'nodes', data: { id: 'server', label: 'Server' } },
        { group: 'nodes', data: { id: 'db', label: 'Database' } },
        { group: 'nodes', data: { id: 'cache', label: 'Cache' } },
        {
          group: 'edges',
          data: { id: 'e1', source: 'server', target: 'db' },
        },
        {
          group: 'edges',
          data: { id: 'e2', source: 'server', target: 'cache' },
        },
      ]);

      // Export cytoscape's own JSON and import into our format
      const exported = cy.json() as any;
      const cytoJSON: CytoscapeJSON = {
        elements: {
          nodes: exported.elements.nodes,
          edges: exported.elements.edges,
        },
      };
      const graph = fromCytoscapeJSON(cytoJSON);

      expect(graph.nodes).toHaveLength(3);
      expect(graph.edges).toHaveLength(2);

      // Our algorithms work on the converted graph
      const path = getShortestPath(graph, { from: 'server', to: 'db' });
      expect(path).not.toBeUndefined();
      expect(path!.steps).toHaveLength(1);
      expect(path!.steps[0].node.id).toBe('db');

      cy.destroy();
    });

    it('converts a compound graph built in cytoscape', () => {
      const cy = cytoscape({ headless: true });

      cy.add([
        { group: 'nodes', data: { id: 'cluster' } },
        { group: 'nodes', data: { id: 'n1', parent: 'cluster' } },
        { group: 'nodes', data: { id: 'n2', parent: 'cluster' } },
        { group: 'nodes', data: { id: 'external' } },
        {
          group: 'edges',
          data: { id: 'e1', source: 'n1', target: 'n2' },
        },
        {
          group: 'edges',
          data: { id: 'e2', source: 'external', target: 'n1' },
        },
      ]);

      const exported = cy.json() as any;
      const cytoJSON: CytoscapeJSON = {
        elements: {
          nodes: exported.elements.nodes,
          edges: exported.elements.edges,
        },
      };
      const graph = fromCytoscapeJSON(cytoJSON);

      // Hierarchy is preserved
      const children = getChildren(graph, 'cluster');
      expect(children.map((n) => n.id).sort()).toEqual(['n1', 'n2']);

      const n1 = graph.nodes.find((n) => n.id === 'n1');
      expect(n1?.parentId).toBe('cluster');

      cy.destroy();
    });
  });

  describe('full round-trip: our Graph → Cytoscape → mutate → our Graph', () => {
    it('survives a round-trip through cytoscape with mutations', () => {
      const original = createGraph({
        nodes: [
          { id: 'a', label: 'A' },
          { id: 'b', label: 'B' },
        ],
        edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
      });

      // Our Graph → Cytoscape
      const cytoJSON = toCytoscapeJSON(original);
      const cy = cytoscape({ headless: true, elements: cytoJSON.elements });

      // Mutate in Cytoscape: add a node and edge
      cy.add([
        { group: 'nodes', data: { id: 'c', label: 'C' } },
        { group: 'edges', data: { id: 'e2', source: 'b', target: 'c' } },
      ]);

      expect(cy.nodes().length).toBe(3);
      expect(cy.edges().length).toBe(2);

      // Cytoscape → our Graph
      const exported = cy.json() as any;
      const roundTripped = fromCytoscapeJSON({
        elements: {
          nodes: exported.elements.nodes,
          edges: exported.elements.edges,
        },
      });

      expect(roundTripped.nodes).toHaveLength(3);
      expect(roundTripped.edges).toHaveLength(2);

      // The new node added in cytoscape is present
      const nodeC = roundTripped.nodes.find((n) => n.id === 'c');
      expect(nodeC?.label).toBe('C');

      // Our algorithms work on the round-tripped graph
      const path = getShortestPath(roundTripped, { from: 'a', to: 'c' });
      expect(path).not.toBeUndefined();
      expect(path!.steps).toHaveLength(2);

      cy.destroy();
    });
  });
});
