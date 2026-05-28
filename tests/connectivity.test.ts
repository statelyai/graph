import { describe, expect, it } from 'vitest';
import { createGraph } from '../src/graph';
import {
  getBridges,
  getArticulationPoints,
  getBiconnectedComponents,
} from '../src/algorithms';

function makeBridgeGraph() {
  return createGraph({
    mode: 'undirected',
    nodes: [
      { id: 'a' },
      { id: 'b' },
      { id: 'c' },
      { id: 'd' },
      { id: 'e' },
      { id: 'f' },
    ],
    edges: [
      { id: 'ab', sourceId: 'a', targetId: 'b' },
      { id: 'bc', sourceId: 'b', targetId: 'c' },
      { id: 'ca', sourceId: 'c', targetId: 'a' },
      { id: 'cd', sourceId: 'c', targetId: 'd' },
      { id: 'de', sourceId: 'd', targetId: 'e' },
      { id: 'ef', sourceId: 'e', targetId: 'f' },
      { id: 'fd', sourceId: 'f', targetId: 'd' },
    ],
  });
}

function toIdGroups(
  components: Array<Array<{ id: string }>>,
): string[][] {
  return components
    .map((component) => component.map((node) => node.id).sort())
    .sort((a, b) => a.join(',').localeCompare(b.join(',')));
}

describe('connectivity algorithms', () => {
  it('getBridges returns edges whose removal disconnects the graph', () => {
    const bridges = getBridges(makeBridgeGraph()).map((edge) => edge.id).sort();

    expect(bridges).toEqual(['cd']);
  });

  it('getArticulationPoints returns cut vertices', () => {
    const points = getArticulationPoints(makeBridgeGraph())
      .map((node) => node.id)
      .sort();

    expect(points).toEqual(['c', 'd']);
  });

  it('getBiconnectedComponents returns node components split at articulation points', () => {
    const components = getBiconnectedComponents(makeBridgeGraph());

    expect(toIdGroups(components)).toEqual([
      ['a', 'b', 'c'],
      ['c', 'd'],
      ['d', 'e', 'f'],
    ]);
  });

  it('returns empty results for an empty graph', () => {
    const graph = createGraph({ mode: 'undirected' });

    expect(getBridges(graph)).toEqual([]);
    expect(getArticulationPoints(graph)).toEqual([]);
    expect(getBiconnectedComponents(graph)).toEqual([]);
  });
});
