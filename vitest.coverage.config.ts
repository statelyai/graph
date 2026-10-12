import { configDefaults, defineConfig } from 'vitest/config';
import base from './vitest.config';

if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Combined converter coverage includes native validators and requires Node 24');

export default defineConfig({
  ...base,
  test: {
    ...base.test,
    include: ['tests/**/*.test.ts'],
    exclude: configDefaults.exclude,
    environment: 'node',
    pool: 'forks',
    maxWorkers: 2,
    testTimeout: 30_000,
    hookTimeout: 30_000,
  },
});
