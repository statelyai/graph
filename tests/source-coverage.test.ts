import { describe, expect, it } from 'vitest';
import {
  getSourceCoverageReport,
  getSourceCoverageWitnesses,
  getSourceCoverageReplay,
  getMinimizedSourceCoverageWitness,
  getReducedSourceCoverageWitnesses,
  type SourceCoverageManifest,
  type SourceCoverageWitness,
  type SourceCoverageSession,
} from '../src/source-coverage';
const manifest: SourceCoverageManifest = {
  schemaVersion: 1,
  criterion: 'transition-outcomes',
  source: { fileName: 'model.ts', algorithm: 'SHA-256', hash: 'a'.repeat(64) },
  extractor: 'fixture/1',
  complete: true,
  machineCount: 1,
  diagnostics: [],
  obligations: ['reject', 'left', 'right'].map((id, index) => ({
    id,
    machineIndex: 0,
    path: '/states/idle/on/GO',
    eventType: 'GO',
    kind: index ? 'transition' : 'refusal',
    targets: index ? ['same-target'] : [],
    predicates: [],
    location: { start: index, end: index + 1, line: 1, column: index + 1 },
  })),
};
type Event = { type: string; value?: number };
const createSession = (): SourceCoverageSession<Event> => {
  let ready = false;
  let terminal = false;
  return {
    runtimeId: 'fixture/1',
    initial: { stateId: 'idle', snapshot: { ready: false }, outcomeIds: [] },
    step(event) {
      if (terminal) throw new Error('terminal');
      const outcomeIds: string[] = [];
      if (event.type === 'START') ready = true;
      if (event.type === 'GO') {
        if (!event.value) outcomeIds.push('reject');
        else if (event.value < 0) {
          outcomeIds.push('left');
          terminal = true;
        } else if (ready) {
          outcomeIds.push('right');
          terminal = true;
        }
      }
      return {
        stateId: `${ready}:${terminal}`,
        snapshot: { ready },
        outcomeIds,
        terminal,
      };
    },
  };
};
const witness = (
  events: Event[],
  outcomeIds: string[],
): SourceCoverageWitness<Event> => ({
  schemaVersion: 1,
  sourceHash: manifest.source.hash,
  runtimeId: 'fixture/1',
  machineIndex: 0,
  events,
  outcomeIds,
});
describe('source-backed transition coverage', () => {
  it('retains every source obligation even when supplied cases only discover one outcome', async () => {
    const result = await getSourceCoverageWitnesses({
      manifest,
      createSession,
      events: [{ type: 'GO', value: -1 }],
    });
    expect(result.report.total).toBe(3);
    expect(result.report.covered).toEqual(['left']);
    expect(result.report.uncovered.map((o) => o.id)).toEqual([
      'reject',
      'right',
    ]);
    expect(result.report.complete).toBe(false);
  });
  it('targets missing outcomes with suggestions and finds the preceding state setup', async () => {
    const result = await getSourceCoverageWitnesses({
      manifest,
      createSession,
      events: [
        { type: 'START' },
        { type: 'GO', value: 0 },
        { type: 'GO', value: -1 },
      ],
      suggestEvents: ({ uncovered }) =>
        uncovered.some((o) => o.id === 'right')
          ? [{ type: 'GO', value: 1 }]
          : [],
    });
    expect(result.report.complete).toBe(true);
    expect(result.report.coverage).toBe(1);
    const right = result.witnesses.find((w) => w.outcomeIds.includes('right'))!;
    expect(right.events).toEqual([{ type: 'START' }, { type: 'GO', value: 1 }]);
    for (const fixture of result.witnesses)
      await getSourceCoverageReplay(manifest, fixture, createSession);
  });
  it('does not turn unresolved extraction into complete coverage', () => {
    const incomplete = {
      ...manifest,
      complete: false,
      diagnostics: [
        { code: 'dynamic', message: 'unknown', path: '', start: 0, end: 1 },
      ],
    };
    expect(
      getSourceCoverageReport(incomplete, [
        witness([], ['reject', 'left', 'right']),
      ]).complete,
    ).toBe(false);
    expect(
      getSourceCoverageReport({ ...incomplete, obligations: [] }, []).coverage,
    ).toBe(0);
  });
  it('rejects stale source hashes, unknown identities and wrong machine attribution', async () => {
    expect(() =>
      getSourceCoverageReport(manifest, [
        { ...witness([], ['left']), sourceHash: 'b'.repeat(64) },
      ]),
    ).toThrow('revision');
    expect(() =>
      getSourceCoverageReport(manifest, [witness([], ['other'])]),
    ).toThrow('Unknown');
    expect(() =>
      getSourceCoverageReport(manifest, [
        { ...witness([], ['left']), machineIndex: 1 },
      ]),
    ).toThrow('Unknown');
    await expect(
      getSourceCoverageReplay(
        manifest,
        witness([{ type: 'GO', value: 1 }], ['right']),
        createSession,
      ),
    ).rejects.toThrow('did not reproduce');
  });
  it('reports budget exhaustion without declaring uncovered outcomes unreachable', async () => {
    const result = await getSourceCoverageWitnesses({
      manifest,
      createSession,
      events: [{ type: 'START' }],
      maxExecutions: 1,
    });
    expect(result.report.complete).toBe(false);
    expect(result.exploration.truncated).toBe(true);
    expect(result.report.uncovered).toHaveLength(3);
  });
  it('shrinks sequences and payloads by re-executing the claimed source outcome', async () => {
    const fixture = witness(
      [{ type: 'NOOP' }, { type: 'START' }, { type: 'GO', value: 100 }],
      ['right'],
    );
    const minimized = await getMinimizedSourceCoverageWitness(
      manifest,
      fixture,
      createSession,
      {
        shrinkEvent: (event) =>
          event.value
            ? [
                { ...event, value: 1 },
                { ...event, value: 0 },
              ]
            : [],
      },
    );
    expect(minimized.witness.events).toEqual([
      { type: 'START' },
      { type: 'GO', value: 1 },
    ]);
    await getSourceCoverageReplay(manifest, minimized.witness, createSession);
  });
  it('reduces a witness suite while retaining the entire witnessed universe', () => {
    const fixtures = [
      witness([], ['left']),
      witness([], ['left', 'right']),
      witness([], ['reject']),
    ];
    const reduced = getReducedSourceCoverageWitnesses(manifest, fixtures);
    expect(reduced).toHaveLength(2);
    expect(getSourceCoverageReport(manifest, reduced).complete).toBe(true);
  });
});

it('closes execution sessions when witness streaming stops early', async () => {
  const { genSourceCoverageWitnesses } = await import('../src/source-coverage');
  let closed = 0;
  const iterator = genSourceCoverageWitnesses({
    manifest,
    createSession: () => ({
      ...createSession(),
      close: () => {
        closed++;
      },
    }),
    events: [{ type: 'GO', value: -1 }],
  });
  const first = await iterator.next();
  expect(first.done).toBe(false);
  await iterator.return(undefined as never);
  expect(closed).toBe(2);
});

it('keeps child observations outside a selected parent coverage denominator', async () => {
  const two = {
    ...manifest,
    machineCount: 2,
    obligations: [
      ...manifest.obligations,
      { ...manifest.obligations[0], id: 'child', machineIndex: 1 },
    ],
  };
  const session = () => ({
    ...createSession(),
    initial: { stateId: 'idle', snapshot: {}, outcomeIds: ['child'] },
  });
  const result = await getSourceCoverageWitnesses({
    manifest: two,
    machineIndex: 0,
    createSession: session,
    events: [
      { type: 'START' },
      { type: 'GO', value: 0 },
      { type: 'GO', value: -1 },
      { type: 'GO', value: 1 },
    ],
  });
  expect(result.report.complete).toBe(true);
  expect(result.report.machineIndices).toEqual([0]);
  expect(result.report.covered).not.toContain('child');
  for (const fixture of result.witnesses)
    await getSourceCoverageReplay(two, fixture, session);
  expect(getSourceCoverageReport(two, result.witnesses).complete).toBe(false);
});

it('rejects an invalid machine scope even when there are no observations', async () => {
  expect(() =>
    getSourceCoverageReport(manifest, [
      { ...witness([], []), machineIndex: -1 },
    ]),
  ).toThrow('machine identity');
  await expect(
    getSourceCoverageWitnesses({
      manifest,
      machineIndex: 1,
      createSession,
      events: [],
    }),
  ).rejects.toThrow('machine identity');
});
