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
  const packOutput = execFileSync('npm', ['pack', '--json'], {
    cwd: rootDir,
    encoding: 'utf8',
  });
  const [{ filename }] = JSON.parse(packOutput) as PackResult[];
  const tarballPath = join(rootDir, filename);
  const tempDir = await mkdtemp(join(tmpdir(), 'statelyai-graph-smoke-'));
  const consumerDir = join(tempDir, 'consumer');
  const checkPath = join(consumerDir, 'check.mjs');

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

    await writeFile(
      checkPath,
      `
import assert from 'node:assert/strict';
import { createGraph, getShortestPath } from '@statelyai/graph';
import { getTopologicalSort } from '@statelyai/graph/algorithms';
import { getFormatSupportEntry } from '@statelyai/graph/format-support';
import { getNeighbors } from '@statelyai/graph/queries';
import { adjacencyListConverter } from '@statelyai/graph/converter';
import { toJGF, fromJGF } from '@statelyai/graph/jgf';
import { toMermaidFlowchart } from '@statelyai/graph/mermaid';

const graph = createGraph({
  nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
  edges: [
    { id: 'e1', sourceId: 'a', targetId: 'b' },
    { id: 'e2', sourceId: 'b', targetId: 'c' },
  ],
});

assert.equal(typeof getShortestPath, 'function');
assert.equal(typeof getTopologicalSort, 'function');
assert.equal(typeof getNeighbors, 'function');
assert.equal(getFormatSupportEntry('dot')?.features.roundTrip, 'partial');

assert.deepEqual(
  [
    getShortestPath(graph, { from: 'a', to: 'c' })?.source.id,
    ...(getShortestPath(graph, { from: 'a', to: 'c' })?.steps.map((step) => step.node.id) ?? []),
  ],
  ['a', 'b', 'c'],
);
assert.deepEqual(adjacencyListConverter.to(graph), { a: ['b'], b: ['c'], c: [] });
assert.equal(fromJGF(toJGF(graph)).edges.length, 2);

const flowchart = toMermaidFlowchart(graph);
assert.match(flowchart, /flowchart/i);
      `.trimStart(),
    );

    execFileSync('node', [checkPath], {
      cwd: consumerDir,
      stdio: 'inherit',
    });

    console.log('Package smoke test passed');
  } finally {
    await unlink(tarballPath).catch(() => undefined);
    await rm(tempDir, { recursive: true, force: true });
  }
}

await main();
