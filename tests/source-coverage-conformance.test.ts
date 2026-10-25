import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { createMachine, getInitialMicrosteps, getMicrosteps } from 'xstate-v6';
import fixture from './fixtures/source-coverage.json';
import { getSerializedSnapshot } from '../src/xstate';
import {
  getSourceCoverageWitnesses,
  getSourceCoverageReplay,
  type SourceCoverageManifest,
} from '../src/source-coverage';

it('finds witnesses for every independently extracted outcome in the shared Viz fixture', async () => {
  expect(createHash('sha256').update(fixture.source).digest('hex')).toBe(
    fixture.manifest.source.hash,
  );
  const exports: Record<string, any> = {};
  new Function('exports', 'createMachine', fixture.javascript)(
    exports,
    createMachine,
  );
  const machine = exports.machine;
  const control = exports[fixture.controlExport];
  const createSession = () => {
    let snapshot: any;
    const calculate = (event?: { type: string }) => {
      const ids = new Set<string>();
      control.observer = (id: string) => ids.add(id);
      try {
        const steps = event
          ? getMicrosteps(machine, snapshot, event)
          : getInitialMicrosteps(machine);
        snapshot = steps.at(-1)?.[0] ?? snapshot;
        for (const [, , transitions] of steps)
          for (const transition of transitions) {
            const id = (transition as any)[
              Symbol.for('@statelyai.sourceCoverage')
            ];
            if (typeof id === 'string') ids.add(id);
          }
        return {
          stateId: getSerializedSnapshot(snapshot),
          snapshot,
          outcomeIds: [...ids],
          terminal: snapshot.status !== 'active',
        };
      } finally {
        control.observer = undefined;
      }
    };
    return {
      runtimeId: 'xstate@6.0.0-alpha.70',
      initial: calculate(),
      step: calculate,
    };
  };
  const manifest = fixture.manifest as SourceCoverageManifest;
  const result = await getSourceCoverageWitnesses({
    manifest,
    createSession,
    events: fixture.cases,
    maxDepth: 3,
  });
  expect(result.report.complete).toBe(true);
  expect(result.report.total).toBe(6);
  expect(result.report.covered).toHaveLength(6);
  for (const witness of result.witnesses)
    await getSourceCoverageReplay(manifest, witness, createSession);
});
