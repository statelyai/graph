import { expect } from 'vitest';
import type { Graph, GraphEdge, GraphNode } from '../../src/types';
import { getFullyFeaturedGraphFixture } from '../fixtures';

interface FixtureRoundTripOptions {
  includeGraphIdentity?: boolean;
  graphKeys?: Array<keyof Graph>;
  nodeKeys?: Array<keyof GraphNode>;
  edgeKeys?: Array<keyof GraphEdge>;
}

const DEFAULT_GRAPH_KEYS: Array<keyof Graph> = ['id', 'mode'];
const DEFAULT_NODE_KEYS: Array<keyof GraphNode> = ['type', 'id'];
const DEFAULT_EDGE_KEYS: Array<keyof GraphEdge> = [
  'type',
  'id',
  'sourceId',
  'targetId',
];

function projectEntity<T extends object>(
  entity: T,
  keys: Array<keyof T>,
): Partial<T> {
  const projection: Partial<T> = {};

  for (const key of keys) {
    projection[key] = entity[key];
  }

  return projection;
}

function projectGraph(
  graph: Graph,
  options: FixtureRoundTripOptions,
): Record<string, unknown> {
  const graphKeys = options.includeGraphIdentity === false ? [] : DEFAULT_GRAPH_KEYS;
  const nodeKeys = [...DEFAULT_NODE_KEYS, ...(options.nodeKeys ?? [])];
  const edgeKeys = [...DEFAULT_EDGE_KEYS, ...(options.edgeKeys ?? [])];

  return {
    ...projectEntity(graph, [...graphKeys, ...(options.graphKeys ?? [])]),
    nodes: [...graph.nodes]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((node) => projectEntity(node, nodeKeys)),
    edges: [...graph.edges]
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((edge) => projectEntity(edge, edgeKeys)),
  };
}

export function expectFixtureRoundTrip(
  roundTrip: (graph: Graph) => Graph,
  options: FixtureRoundTripOptions = {},
): void {
  const fixture = getFullyFeaturedGraphFixture();
  const roundTripped = roundTrip(fixture);

  expect(projectGraph(roundTripped, options)).toEqual(
    projectGraph(fixture, options),
  );
}
