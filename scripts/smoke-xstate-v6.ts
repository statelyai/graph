import { execFileSync } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(join(root, 'package.json'));
const directory = await mkdtemp(join(tmpdir(), 'stately-graph-v6-'));
try {
  const modules = join(directory, 'node_modules');
  const graph = join(modules, '@statelyai/graph');
  await mkdir(graph, { recursive: true });
  await cp(join(root, 'dist'), join(graph, 'dist'), { recursive: true });
  await cp(join(root, 'package.json'), join(graph, 'package.json'));
  const runtime = dirname(require.resolve('xstate-v6/package.json'));
  await cp(runtime, join(modules, 'xstate'), { recursive: true });
  await writeFile(join(directory, 'consumer.mjs'), `
    import assert from 'node:assert/strict';
    import { createMachine, types } from 'xstate';
    import { createGraphFromMachine } from '@statelyai/graph/xstate';
    const machine = createMachine({
      schemas: { events: { GO: types() } }, initial: 'idle', states: {
        idle: { on: { GO: ({ event }) => event.ok ? { target: 'route' } : undefined } },
        route: { always: { target: 'done' } }, done: { type: 'final' }
      }
    });
    const graph = createGraphFromMachine(machine, { events: { GO: [{ ok: true }] } });
    assert.equal(graph.nodes.at(-1).data.value, 'done');
    assert.deepEqual(graph.edges[0].data.transitions.map(t => t.eventType), ['GO', '']);
    assert.equal(graph.data.exploration.transitionAttributionComplete, true);
  `);
  execFileSync(process.execPath, [join(directory, 'consumer.mjs')], { stdio: 'inherit' });
  await writeFile(join(directory, 'consumer.mts'), `
    import { createMachine, types } from 'xstate';
    import { createGraphFromMachine } from '@statelyai/graph/xstate';
    const machine = createMachine({ schemas: { events: { GO: types<{ ok: boolean }>() } }, initial: 'idle', states: { idle: {} } });
    const graph = createGraphFromMachine(machine, { events: { GO: [{ ok: true }] } });
    const event: { type: 'GO'; ok: boolean } | undefined = graph.edges[0]?.data.event;
    void event;
    // @ts-expect-error invalid payload remains rejected across the v6 package boundary
    createGraphFromMachine(machine, { events: { GO: [{ ok: 'yes' }] } });
    // @ts-expect-error unknown event cases remain rejected
    createGraphFromMachine(machine, { events: { OTHER: [{}] } });
  `);
  await writeFile(join(directory, 'tsconfig.json'), JSON.stringify({ compilerOptions: { target: 'ES2022', module: 'NodeNext', moduleResolution: 'NodeNext', strict: true, skipLibCheck: false, noEmit: true, types: [], lib: ['ES2022', 'DOM'] }, files: ['consumer.mts'] }));
  const typescript = JSON.parse(await readFile(require.resolve('typescript/package.json'), 'utf8'));
  execFileSync(process.execPath, [join(dirname(require.resolve('typescript/package.json')), typescript.bin.tsc), '-p', join(directory, 'tsconfig.json')], { stdio: 'inherit' });
  console.log('Packed graph adapter passes with xstate v6 as the default runtime, including consumer event types.');
} finally { await rm(directory, { recursive: true, force: true }); }
