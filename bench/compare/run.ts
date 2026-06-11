/**
 * Cross-library benchmark harness.
 *
 *   pnpm bench:compare              # default sizes (1k / 10k / 100k)
 *   pnpm bench:compare -- --quick   # 1k / 10k only
 *
 * Seeded generators feed identical edge lists to every adapter; each
 * workload runs through the library's idiomatic public API. Timing: warmup,
 * then samples until ≥5 runs or ≥1.5 s, reporting the median. A library that
 * exceeds 10 s on a workload is skipped at larger sizes (reported as `>10s`).
 * Results land in bench/compare/results/<date>.{json,md}.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import * as os from 'node:os';
import { SHAPES, type BenchGraphData } from './generate';
import { adapters, WORKLOAD_NAMES } from './adapters';

const QUICK = process.argv.includes('--quick');
const SIZES = QUICK ? [1_000, 10_000] : [1_000, 10_000, 100_000];
// Brandes is O(V·E): cap betweenness everywhere
const WORKLOAD_MAX_SIZE: Record<string, number> = { betweenness: 1_000 };
const SLOW_SKIP_MS = 10_000;

interface Cell {
  lib: string;
  shape: string;
  size: number;
  workload: string;
  medianMs: number | null; // null = unsupported / skipped / crashed
  skipped?: 'too-slow' | 'error';
  error?: string;
  samples?: number;
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

// --- Report ---

function fmt(cell: Cell | undefined, best: number | null): string {
  if (!cell || cell.medianMs === null) {
    if (cell?.skipped === 'too-slow') return '>10s';
    if (cell?.skipped === 'error') return 'crash';
    return '—';
  }
  const ms =
    cell.medianMs >= 100
      ? cell.medianMs.toFixed(0)
      : cell.medianMs >= 1
        ? cell.medianMs.toFixed(1)
        : cell.medianMs.toFixed(2);
  if (best !== null && best > 0) {
    const ratio = cell.medianMs / best;
    return ratio <= 1.001 ? `**${ms}**` : `${ms} (${ratio.toFixed(1)}×)`;
  }
  return ms;
}

const libNames = adapters.map((a) => a.name);
let md = `# Cross-library benchmark\n\n`;
md += `- Date: ${new Date().toISOString()}\n`;
md += `- Machine: ${os.cpus()[0]?.model ?? 'unknown'} · ${os.cpus().length} cores · node ${process.version} (${os.platform()}/${os.arch()})\n`;
md += `- Method: identical seeded edge lists per cell; idiomatic public API per library; median of ≥5 runs (1.5 s budget) after warmup. Bold = fastest; (n.n×) = slower than fastest; — = no equivalent API; >10s = skipped after exceeding 10 s.\n`;
md += `- graphlib's \`sssp\` is full single-source Dijkstra (its only shortest-path API).\n`;
md += `- Betweenness capped at n=1,000 (Brandes is O(V·E) for every library).\n`;
md += `- Sub-millisecond cells (e.g. scaleFree traversals, which reach few nodes from n0) are dominated by call overhead — treat their ratios as noise.\n`;

for (const workload of WORKLOAD_NAMES) {
  const rows = cells.filter((c) => c.workload === workload);
  if (rows.length === 0) continue;
  md += `\n## ${workload}\n\n| graph | ${libNames.join(' | ')} |\n|---|${libNames.map(() => '---').join('|')}|\n`;
  for (const size of SIZES) {
    for (const shapeName of Object.keys(SHAPES)) {
      const rowCells = libNames.map((lib) =>
        rows.find((c) => c.lib === lib && c.size === size && c.shape === shapeName),
      );
      if (rowCells.every((c) => c === undefined)) continue;
      const best = Math.min(
        ...rowCells.filter((c) => c?.medianMs != null).map((c) => c!.medianMs!),
      );
      md += `| ${shapeName} ${size.toLocaleString('en-US')} | ${rowCells
        .map((c) => fmt(c, Number.isFinite(best) ? best : null))
        .join(' | ')} |\n`;
    }
  }
}

const outDir = join(import.meta.dirname, 'results');
mkdirSync(outDir, { recursive: true });
const stamp = new Date().toISOString().slice(0, 10);
writeFileSync(join(outDir, `${stamp}.json`), JSON.stringify({ cells }, null, 2));
writeFileSync(join(outDir, `${stamp}.md`), md);
console.log(`\nWrote bench/compare/results/${stamp}.md and .json`);
