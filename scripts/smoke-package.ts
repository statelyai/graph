import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

type PackResult = {
  filename: string;
};

const scriptDir = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(scriptDir, '..');

async function main(): Promise<void> {
  const packOutput = execFileSync('npm', ['pack', '--json', '--ignore-scripts'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  const jsonStart = packOutput.indexOf('[\n  {');
  const jsonEnd = packOutput.lastIndexOf('\n]');
  if (jsonStart < 0 || jsonEnd < 0) {
    throw new Error(`Unable to parse npm pack output as JSON:\n${packOutput}`);
  }
  const parsedOutput = JSON.parse(
    packOutput.slice(jsonStart, jsonEnd + 2),
  ) as PackResult[];
  const [{ filename }] = parsedOutput;
  const tarballPath = join(rootDir, filename);
  const tempDir = await mkdtemp(join(tmpdir(), 'statelyai-graph-smoke-'));
  const consumerDir = join(tempDir, 'consumer');
  const coreCheckPath = join(consumerDir, 'check-core.mjs');
  const coreTypesPath = join(consumerDir, 'check-core.ts');
  const optionalCheckPath = join(consumerDir, 'check-optional.mjs');
  const optionalTypesPath = join(consumerDir, 'check-optional.ts');

  try {
    await mkdir(consumerDir, { recursive: true });
    await writeFile(
      join(consumerDir, 'package.json'),
      JSON.stringify(
        {
          name: 'graph-smoke-consumer',
          private: true,
          type: 'module',
        },
        null,
        2,
      ) + '\n',
    );

    execFileSync('pnpm', ['add', '--ignore-workspace', tarballPath], {
      cwd: consumerDir,
      stdio: 'inherit',
    });
    execFileSync('pnpm', ['add', '--ignore-workspace', '--save-dev', 'typescript'], {
      cwd: consumerDir,
      stdio: 'inherit',
    });

    await writeFile(
      coreCheckPath,
      `
import assert from 'node:assert/strict';
import { createGraph, createVisualGraph, getShortestPath } from '@statelyai/graph';
import { getTopologicalSort, getConnectedComponents } from '@statelyai/graph/algorithms';
import { toAdjacencyList, fromAdjacencyList } from '@statelyai/graph/adjacency-list';
import { adjacencyListConverter, edgeListConverter } from '@statelyai/graph/converter';
import { toCytoscapeJSON, fromCytoscapeJSON } from '@statelyai/graph/cytoscape';
import { toD3Graph, fromD3Graph } from '@statelyai/graph/d3';
import { toEdgeList, fromEdgeList } from '@statelyai/graph/edge-list';
import { toELK, fromELK } from '@statelyai/graph/elk';
import { getFormatSupportEntry } from '@statelyai/graph/format-support';
import { toGML, fromGML } from '@statelyai/graph/gml';
import { toJGF, fromJGF } from '@statelyai/graph/jgf';
import { toMermaidFlowchart } from '@statelyai/graph/mermaid';
import { getNeighbors } from '@statelyai/graph/queries';
import { toTGF, fromTGF } from '@statelyai/graph/tgf';
import { toXYFlow, fromXYFlow } from '@statelyai/graph/xyflow';

const graph = createGraph({
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  edges: [
    { id: 'e1', sourceId: 'a', targetId: 'b' },
    { id: 'e2', sourceId: 'b', targetId: 'c' },
  ],
});
const visualGraph = createVisualGraph(graph);

assert.equal(typeof getShortestPath, 'function');
assert.equal(typeof getTopologicalSort, 'function');
assert.equal(typeof getConnectedComponents, 'function');
assert.equal(typeof getNeighbors, 'function');
assert.equal(getFormatSupportEntry('dot')?.features.roundTrip, 'partial');

assert.deepEqual(
  [
    getShortestPath(graph, { from: 'a', to: 'c' })?.source.id,
    ...(getShortestPath(graph, { from: 'a', to: 'c' })?.steps.map((step) => step.node.id) ?? []),
  ],
  ['a', 'b', 'c'],
);
assert.deepEqual(toAdjacencyList(graph), { a: ['b'], b: ['c'], c: [] });
assert.equal(fromAdjacencyList(toAdjacencyList(graph)).edges.length, 2);
assert.deepEqual(toEdgeList(graph), [['a', 'b'], ['b', 'c']]);
assert.equal(fromEdgeList(toEdgeList(graph)).edges.length, 2);
assert.deepEqual(adjacencyListConverter.to(graph), { a: ['b'], b: ['c'], c: [] });
assert.deepEqual(edgeListConverter.to(graph), [['a', 'b'], ['b', 'c']]);
assert.equal(fromCytoscapeJSON(toCytoscapeJSON(graph)).edges.length, 2);
assert.equal(fromD3Graph(toD3Graph(graph)).edges.length, 2);
assert.equal(fromELK(toELK(visualGraph)).edges.length, 2);
assert.equal(fromGML(toGML(graph)).edges.length, 2);
assert.equal(fromJGF(toJGF(graph)).edges.length, 2);
assert.equal(fromTGF(toTGF(graph)).edges.length, 2);
assert.equal(fromXYFlow(toXYFlow(visualGraph)).edges.length, 2);

const flowchart = toMermaidFlowchart(graph);
assert.match(flowchart, /flowchart/i);
      `.trimStart(),
    );

    execFileSync('node', [coreCheckPath], {
      cwd: consumerDir,
      stdio: 'inherit',
    });

    await writeFile(
      coreTypesPath,
      `
import { createGraph, type Graph } from '@statelyai/graph';
import { getTopologicalSort } from '@statelyai/graph/algorithms';
import { getFormatSupportEntry } from '@statelyai/graph/format-support';
import { getNeighbors } from '@statelyai/graph/queries';

const graph: Graph = createGraph({
  nodes: [{ id: 'a' }, { id: 'b' }],
  edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
});

const topo = getTopologicalSort(graph);
const support = getFormatSupportEntry('graphml');
const neighbors = getNeighbors(graph, 'a');

if (topo && support && neighbors.length > 0) {
  topo[0]?.id;
  support.features.ports;
  neighbors[0]?.id;
}
      `.trimStart(),
    );

    execFileSync(
      'pnpm',
      [
        'exec',
        'tsc',
        '--noEmit',
        '--moduleResolution',
        'bundler',
        '--module',
        'preserve',
        '--target',
        'esnext',
        '--strict',
        '--skipLibCheck',
        coreTypesPath,
      ],
      {
        cwd: consumerDir,
        stdio: 'inherit',
      },
    );

    execFileSync(
      'pnpm',
      ['add', '--ignore-workspace', 'dotparser', 'fast-xml-parser', 'zod'],
      {
        cwd: consumerDir,
        stdio: 'inherit',
      },
    );

    await writeFile(
      optionalCheckPath,
      `
import assert from 'node:assert/strict';
import { createGraph } from '@statelyai/graph';
import { toDOT, fromDOT } from '@statelyai/graph/dot';
import { toGEXF, fromGEXF } from '@statelyai/graph/gexf';
import { toGraphML, fromGraphML } from '@statelyai/graph/graphml';
import { GraphSchema, getGraphIssues, isGraph } from '@statelyai/graph/schemas';

const graph = createGraph({
  id: 'optional',
  nodes: [{ id: 'a' }, { id: 'b' }],
  edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
});

assert.equal(fromDOT(toDOT(graph)).edges.length, 1);
assert.equal(fromGEXF(toGEXF(graph)).edges.length, 1);
assert.equal(fromGraphML(toGraphML(graph)).edges.length, 1);
assert.equal(GraphSchema.safeParse(graph).success, true);
assert.equal(isGraph(graph), true);
assert.deepEqual(getGraphIssues(graph), []);
      `.trimStart(),
    );

    execFileSync('node', [optionalCheckPath], {
      cwd: consumerDir,
      stdio: 'inherit',
    });

    await writeFile(
      optionalTypesPath,
      `
import { createGraph } from '@statelyai/graph';
import { fromDOT, toDOT } from '@statelyai/graph/dot';
import { getGraphIssues, isGraph, type GraphValidationIssue } from '@statelyai/graph/schemas';

const graph = createGraph({
  nodes: [{ id: 'a' }, { id: 'b' }],
  edges: [{ id: 'e1', sourceId: 'a', targetId: 'b' }],
});

const dot = toDOT(graph);
const issues: GraphValidationIssue[] = getGraphIssues(graph);
const parsed = fromDOT(dot);

if (isGraph(parsed) && issues.length === 0) {
  parsed.edges[0]?.id;
}
      `.trimStart(),
    );

    execFileSync(
      'pnpm',
      [
        'exec',
        'tsc',
        '--noEmit',
        '--moduleResolution',
        'bundler',
        '--module',
        'preserve',
        '--target',
        'esnext',
        '--strict',
        '--skipLibCheck',
        optionalTypesPath,
      ],
      {
        cwd: consumerDir,
        stdio: 'inherit',
      },
    );

    console.log('Package smoke test passed');
  } finally {
    await unlink(tarballPath).catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
