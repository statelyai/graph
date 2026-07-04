/**
 * Cross-library benchmark harness.
 *
 *   pnpm bench:compare              # 1k / 10k / 100k nodes (full, ~minutes)
 *   pnpm bench:compare:quick       # 1k / 10k only (fast, for repro checks)
 *   BENCH_SIZES=1000,5000 pnpm bench:compare   # custom sizes
 *
 * Flags / env:
 *   --quick        1k / 10k only (equivalent to BENCH_QUICK=1)
 *   BENCH_QUICK=1  same as --quick
 *   BENCH_SIZES    comma-separated node counts; overrides the presets
 *
 * Seeded generators feed identical edge lists to every adapter; each
 * workload runs through the library's idiomatic public API. Timing: warmup,
 * then samples until ≥5 runs or ≥1.5 s, reporting the median. A library that
 * exceeds 10 s on a workload is skipped at larger sizes (reported as `>10s`).
 *
 * Output lands in bench/compare/results/<date>.{json,md} and refreshes the
 * tables in docs/benchmarks.md. The JSON is machine-readable and captures the
 * environment (node, OS, CPU) so runs are comparable and reproducible.
 */
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRequire } from 'node:module';
import * as os from 'node:os';
import { SHAPES, type BenchGraphData } from './generate';
import { adapters, WORKLOAD_NAMES } from './adapters';
import {
  writeReports,
  type BenchResults,
  type Cell,
} from './report';

const require = createRequire(import.meta.url);

const QUICK = process.argv.includes('--quick') || process.env.BENCH_QUICK === '1';
const SIZES: number[] = process.env.BENCH_SIZES
  ? process.env.BENCH_SIZES.split(',').map((s) => Number(s.trim())).filter((n) => n > 0)
  : QUICK
    ? [1_000, 10_000]
    : [1_000, 10_000, 100_000];
// Brandes is O(V·E): cap betweenness everywhere
const WORKLOAD_MAX_SIZE: Record<string, number> = { betweenness: 1_000 };
const SLOW_SKIP_MS = 10_000;

/** npm package to resolve a version for, per adapter name. */
const LIB_PACKAGES: Record<string, string> = {
  graphology: 'graphology',
  ngraph: 'ngraph.graph',
  '@dagrejs/graphlib': '@dagrejs/graphlib',
  'cytoscape (headless)': 'cytoscape',
};

function resolveVersion(pkg: string): string | undefined {
  // Read package.json off disk: `require('<pkg>/package.json')` fails for
  // packages whose `exports` map does not expose ./package.json.
  try {
    const entry = require.resolve(pkg);
    let dir = entry;
    for (let i = 0; i < 8; i++) {
      dir = join(dir, '..');
      const candidate = join(dir, 'package.json');
      try {
        const meta = JSON.parse(readFileSync(candidate, 'utf8'));
        if (meta.name === pkg) return meta.version;
      } catch {
        /* keep walking up */
      }
    }
  } catch {
    /* not resolvable */
  }
  return undefined;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function sample(fn: () => void): { medianMs: number; samples: number } {
  fn(); // warmup
  const times: number[] = [];
  const budgetEnd = performance.now() + 1_500;
  while (times.length < 5 || (performance.now() < budgetEnd && times.length < 25)) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
    if (times.length >= 5 && performance.now() >= budgetEnd) break;
    if (times[times.length - 1] > SLOW_SKIP_MS) break; // one slow run is enough
  }
  return { medianMs: median(times), samples: times.length };
}

const cells: Cell[] = [];
const tooSlow = new Set<string>(); // `${lib}|${workload}|${shape}` skip larger sizes

for (const size of SIZES) {
  for (const [shapeName, make] of Object.entries(SHAPES)) {
    const data: BenchGraphData = make(size);
    console.log(
      `\n— ${shapeName} n=${data.n} m=${data.edges.length} —`,
    );

    for (const adapter of adapters) {
      // build (timed separately, also produces the instance for workloads)
      let graph: unknown;
      const buildKey = `${adapter.name}|build|${shapeName}`;
      if (tooSlow.has(buildKey)) {
        cells.push({ lib: adapter.name, shape: shapeName, size, workload: 'build', medianMs: null, skipped: 'too-slow' });
        continue;
      }
      const t0 = performance.now();
      graph = adapter.build(data);
      const buildMs = performance.now() - t0;
      cells.push({ lib: adapter.name, shape: shapeName, size, workload: 'build', medianMs: buildMs, samples: 1 });
      if (buildMs > SLOW_SKIP_MS) tooSlow.add(buildKey);
      console.log(`  ${adapter.name.padEnd(22)} build ${buildMs.toFixed(1)}ms`);

      for (const workload of WORKLOAD_NAMES) {
        if (workload === 'build') continue;
        const fn = adapter.workloads[workload];
        if (!fn) {
          cells.push({ lib: adapter.name, shape: shapeName, size, workload, medianMs: null });
          continue;
        }
        if (WORKLOAD_MAX_SIZE[workload] !== undefined && size > WORKLOAD_MAX_SIZE[workload]) {
          continue; // capped workload — not run at this size for anyone
        }
        const key = `${adapter.name}|${workload}|${shapeName}`;
        if (tooSlow.has(key)) {
          cells.push({ lib: adapter.name, shape: shapeName, size, workload, medianMs: null, skipped: 'too-slow' });
          continue;
        }
        try {
          const { medianMs, samples } = sample(() => fn(graph, data));
          cells.push({ lib: adapter.name, shape: shapeName, size, workload, medianMs, samples });
          if (medianMs > SLOW_SKIP_MS) tooSlow.add(key);
          console.log(
            `  ${adapter.name.padEnd(22)} ${workload.padEnd(11)} ${medianMs.toFixed(2)}ms (${samples} runs)`,
          );
        } catch (error: any) {
          // A library crash (e.g. stack overflow on deep recursion) is a
          // result worth recording, not a harness failure.
          tooSlow.add(key);
          cells.push({
            lib: adapter.name,
            shape: shapeName,
            size,
            workload,
            medianMs: null,
            skipped: 'error',
            error: String(error?.message ?? error).slice(0, 120),
          });
          console.log(
            `  ${adapter.name.padEnd(22)} ${workload.padEnd(11)} CRASHED: ${String(error?.message ?? error).slice(0, 60)}`,
          );
        }
      }
    }
  }
}

// --- Assemble machine-readable results (with environment capture) ---

const libNames = adapters.map((a) => a.name);
const libVersions: Record<string, string> = { '@statelyai/graph': pkgVersion() };
for (const name of libNames) {
  const pkg = LIB_PACKAGES[name];
  const v = pkg ? resolveVersion(pkg) : undefined;
  if (v) libVersions[name] = v;
}

const results: BenchResults = {
  env: {
    date: new Date().toISOString(),
    node: process.version,
    os: `${os.platform()}/${os.arch()}`,
    cpu: os.cpus()[0]?.model ?? 'unknown',
    cores: os.cpus().length,
  },
  libs: libNames,
  libVersions,
  sizes: SIZES,
  shapes: Object.keys(SHAPES),
  workloads: [...WORKLOAD_NAMES],
  slowSkipMs: SLOW_SKIP_MS,
  cells,
};

const outDir = join(import.meta.dirname, 'results');
mkdirSync(outDir, { recursive: true });
const stamp = results.env.date.slice(0, 10);
writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify(results, null, 2));
writeReports(results);
console.log(`\nWrote bench/compare/results/${stamp}.json`);

function pkgVersion(): string {
  try {
    return JSON.parse(
      readFileSync(join(import.meta.dirname, '..', '..', 'package.json'), 'utf8'),
    ).version;
  } catch {
    return '';
  }
}
