/**
 * One adapter per library. Every adapter builds from the same neutral edge
 * list and exposes the same named workloads via each library's *idiomatic*
 * public API (we benchmark what a user would actually write, not a
 * hand-tuned port). `undefined` workload = the library has no equivalent.
 *
 * Fairness notes:
 * - graphlib's only shortest-path API is full single-source Dijkstra; its
 *   `sssp` cell therefore pays the all-targets cost — that IS the cost a
 *   graphlib user pays for one query.
 * - bfs is a full directed reachability sweep from node 0; libraries without
 *   a built-in traversal get a minimal queue loop over their neighbor API.
 */
import { createGraph } from '../../src/index';
import {
  bfs as ourBfs,
  getShortestPath,
  getPageRank,
  getConnectedComponents,
  getBetweennessCentrality,
} from '../../src/algorithms.ts';
import { getDegree } from '../../src/queries';
import GraphologyGraph from 'graphology';
import { dijkstra as graphologyDijkstra } from 'graphology-shortest-path';
import graphologyPagerank from 'graphology-metrics/centrality/pagerank';
import graphologyBetweenness from 'graphology-metrics/centrality/betweenness';
import { connectedComponents as graphologyComponents } from 'graphology-components';
// Untyped libraries
// @ts-ignore
import createNgraph from 'ngraph.graph';
// @ts-ignore
import ngraphPath from 'ngraph.path';
// @ts-ignore
import graphlibPkg from '@dagrejs/graphlib';
const graphlib: any =
  (graphlibPkg as any).Graph !== undefined
    ? graphlibPkg
    : (graphlibPkg as any).default;
// @ts-ignore
import cytoscape from 'cytoscape';
import type { BenchGraphData } from './generate';

export interface LibAdapter {
  name: string;
  build: (data: BenchGraphData) => unknown;
  workloads: Record<string, ((g: any, data: BenchGraphData) => void) | undefined>;
}

export const WORKLOAD_NAMES = [
  'build',
  'bfs',
  'sssp',
  'pagerank',
  'components',
  'betweenness',
  'degreeSweep',
] as const;

export const adapters: LibAdapter[] = [
  {
    name: '@statelyai/graph',
    build: (data) =>
      createGraph({
        nodes: Array.from({ length: data.n }, (_, i) => ({ id: `n${i}` })),
        edges: data.edges.map(([s, t, w], i) => ({
          id: `e${i}`,
          sourceId: `n${s}`,
          targetId: `n${t}`,
          weight: w,
        })),
      }),
    workloads: {
      bfs: (g) => {
        let count = 0;
        for (const _node of ourBfs(g, 'n0')) count++;
        return void count;
      },
      sssp: (g, data) =>
        void getShortestPath(g, { from: 'n0', to: `n${data.n - 1}` }),
      pagerank: (g) => void getPageRank(g),
      components: (g) => void getConnectedComponents(g),
      betweenness: (g) => void getBetweennessCentrality(g),
      degreeSweep: (g) => {
        let total = 0;
        for (const node of g.nodes) total += getDegree(g, node.id);
        return void total;
      },
    },
  },
  {
    name: 'graphology',
    build: (data) => {
      const g = new GraphologyGraph({ type: 'directed' });
      for (let i = 0; i < data.n; i++) g.addNode(`n${i}`);
      for (let i = 0; i < data.edges.length; i++) {
        const [s, t, w] = data.edges[i];
        g.addEdgeWithKey(`e${i}`, `n${s}`, `n${t}`, { weight: w });
      }
      return g;
    },
    workloads: {
      bfs: (g: InstanceType<typeof GraphologyGraph>) => {
        const visited = new Set<string>(['n0']);
        const queue = ['n0'];
        let head = 0;
        while (head < queue.length) {
          const u = queue[head++];
          g.forEachOutNeighbor(u, (v: string) => {
            if (!visited.has(v)) {
              visited.add(v);
              queue.push(v);
            }
          });
        }
      },
      sssp: (g, data) =>
        void graphologyDijkstra.bidirectional(g, 'n0', `n${data.n - 1}`, 'weight'),
      pagerank: (g) => void graphologyPagerank(g, { getEdgeWeight: null }),
      components: (g) => void graphologyComponents(g),
      betweenness: (g) =>
        void graphologyBetweenness(g, { getEdgeWeight: null, normalized: true }),
      degreeSweep: (g: any) => {
        let total = 0;
        g.forEachNode((node: string) => {
          total += g.degree(node);
        });
        return void total;
      },
    },
  },
  {
    name: 'ngraph',
    build: (data) => {
      const g = createNgraph();
      for (let i = 0; i < data.n; i++) g.addNode(i);
      for (const [s, t, w] of data.edges) g.addLink(s, t, { weight: w });
      return g;
    },
    workloads: {
      bfs: (g) => {
        const visited = new Set<number>([0]);
        const queue = [0];
        let head = 0;
        while (head < queue.length) {
          const u = queue[head++];
          g.forEachLinkedNode(
            u,
            (node: any) => {
              if (!visited.has(node.id)) {
                visited.add(node.id);
                queue.push(node.id);
              }
            },
            true, // outbound only
          );
        }
      },
      sssp: (g, data) => {
        const finder = ngraphPath.aStar(g, {
          oriented: true,
          distance: (_a: any, _b: any, link: any) => link.data.weight,
        });
        void finder.find(0, data.n - 1);
      },
      pagerank: undefined,
      components: undefined,
      betweenness: undefined,
      degreeSweep: (g) => {
        let total = 0;
        g.forEachNode((node: any) => {
          const links = g.getLinks(node.id);
          total += links ? links.size : 0;
        });
        return void total;
      },
    },
  },
  {
    name: '@dagrejs/graphlib',
    build: (data) => {
      const g = new graphlib.Graph({ directed: true });
      for (let i = 0; i < data.n; i++) g.setNode(`n${i}`);
      for (const [s, t, w] of data.edges) g.setEdge(`n${s}`, `n${t}`, w);
      return g;
    },
    workloads: {
      bfs: (g) => {
        const visited = new Set<string>(['n0']);
        const queue = ['n0'];
        let head = 0;
        while (head < queue.length) {
          const u = queue[head++];
          for (const v of g.successors(u) ?? []) {
            if (!visited.has(v)) {
              visited.add(v);
              queue.push(v);
            }
          }
        }
      },
      // graphlib's only Dijkstra is full single-source; see fairness notes
      sssp: (g, data) =>
        void graphlib.alg.dijkstra(g, 'n0', (e: any) => g.edge(e))[
          `n${data.n - 1}`
        ],
      pagerank: undefined,
      components: (g) => void graphlib.alg.components(g),
      betweenness: undefined,
      degreeSweep: (g) => {
        let total = 0;
        for (const v of g.nodes()) total += (g.nodeEdges(v) ?? []).length;
        return void total;
      },
    },
  },
  {
    name: 'cytoscape (headless)',
    build: (data) =>
      cytoscape({
        headless: true,
        elements: [
          ...Array.from({ length: data.n }, (_, i) => ({
            data: { id: `n${i}` },
          })),
          ...data.edges.map(([s, t, w], i) => ({
            data: { id: `e${i}`, source: `n${s}`, target: `n${t}`, weight: w },
          })),
        ],
      }),
    workloads: {
      bfs: (cy) =>
        void cy.elements().bfs({ roots: '#n0', directed: true }),
      sssp: (cy, data) => {
        const result = cy.elements().dijkstra({
          root: '#n0',
          directed: true,
          weight: (e: any) => e.data('weight'),
        });
        void result.pathTo(cy.$(`#n${data.n - 1}`));
      },
      pagerank: (cy) => {
        const ranker = cy.elements().pageRank({});
        void ranker.rank(cy.$('#n0'));
      },
      components: (cy) => void cy.elements().components(),
      betweenness: (cy) =>
        void cy.elements().betweennessCentrality({ directed: true }),
      degreeSweep: (cy) => {
        let total = 0;
        cy.nodes().forEach((node: any) => {
          total += node.degree(true);
        });
        return void total;
      },
    },
  },
];
