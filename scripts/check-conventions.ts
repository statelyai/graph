import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));

const prefixes = [
  'get',
  'gen',
  'is',
  'has',
  'create',
  'to',
  'from',
  'add',
  'delete',
  'update',
] as const;

const allowedLegacyPublicNames = new Set([
  'applyLayoutFrame',
  'areEntitiesEqual',
  'centerGraph',
  'flatten',
  'GraphInstance',
  'invalidateIndex',
  'joinPaths',
  'LAYOUT_KEYS',
  'reverseGraph',
  'translateGraph',
  'validateGraph',
  'bfs',
  'dfs',
  'applyPatches',
  'invertDiff',
  'takeSteps',
  'takeUntilNode',
  'takeUntilEdge',
  'takeUntilNodeCoverage',
  'takeUntilEdgeCoverage',
]);

const deprecatedAliasNames = new Set([
  'flatten',
  'reverseGraph',
  'joinPaths',
  'bfs',
  'dfs',
  'applyPatches',
  'invertDiff',
  'takeSteps',
  'takeUntilNode',
  'takeUntilEdge',
  'takeUntilNodeCoverage',
  'takeUntilEdgeCoverage',
]);

const publicFiles = [
  'src/index.ts',
  'src/algorithms.ts',
  'src/schemas.ts',
  'src/layout/index.ts',
];

function isPrefixed(name: string): boolean {
  return prefixes.some((prefix) => {
    if (prefix === 'is' || prefix === 'has') {
      return name.startsWith(prefix) && name[prefix.length]?.toUpperCase() === name[prefix.length];
    }
    return name.startsWith(prefix) && name[prefix.length]?.toUpperCase() === name[prefix.length];
  });
}

function getExportedNames(source: string): string[] {
  const names = new Set<string>();
  const directExportRegex = /export\s+(?:async\s+)?function\*?\s+([A-Za-z_$][\w$]*)/g;
  const barrelExportRegex = /export\s*\{([\s\S]*?)\}\s*from\s*['"][^'"]+['"]/g;

  for (const match of source.matchAll(directExportRegex)) {
    names.add(match[1]);
  }
  for (const match of source.matchAll(barrelExportRegex)) {
    for (const part of match[1].split(',')) {
      const trimmed = part.trim();
      if (!trimmed || trimmed.startsWith('type ')) continue;
      const withoutType = trimmed.replace(/^type\s+/, '');
      const aliasMatch = withoutType.match(/\bas\s+([A-Za-z_$][\w$]*)$/);
      const name = aliasMatch?.[1] ?? withoutType.match(/^([A-Za-z_$][\w$]*)/)?.[1];
      if (name) names.add(name);
    }
  }
  return [...names].sort();
}

async function readProjectFile(path: string): Promise<string> {
  return readFile(join(rootDir, path), 'utf8');
}

const failures: string[] = [];

for (const file of publicFiles) {
  const source = await readProjectFile(file);
  for (const name of getExportedNames(source)) {
    if (!isPrefixed(name) && !allowedLegacyPublicNames.has(name)) {
      failures.push(`${file}: public export "${name}" must use a standard prefix`);
    }
  }
}

for (const file of [
  'src/transforms.ts',
  'src/algorithms/traversal.ts',
  'src/algorithms/paths.ts',
  'src/diff.ts',
  'src/walks.ts',
]) {
  const source = await readProjectFile(file);
  for (const name of deprecatedAliasNames) {
    const index = source.indexOf(`export function${name === 'bfs' || name === 'dfs' || name.startsWith('take') ? '*' : ''} ${name}`);
    if (index === -1) continue;
    const preceding = source.slice(Math.max(0, index - 120), index);
    if (!preceding.includes('@deprecated')) {
      failures.push(`${file}: legacy alias "${name}" must have @deprecated JSDoc`);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}
