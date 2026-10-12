import { defineConfig } from 'vitest/config';

if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Native validation requires Node 24; standard core tests remain available on Node 20');

export default defineConfig({
  test: {
    include: ['tests/native/**/*.test.ts'],
    environment: 'node',
    pool: 'forks',
    maxWorkers: 2,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
