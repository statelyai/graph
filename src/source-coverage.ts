/** Source-backed coverage protocol. This module has no compiler/runtime dependency. */
export interface SourceCoverageObligation {
  id: string;
  machineIndex: number;
  path: string;
  eventType: string;
  kind: 'transition' | 'targetless' | 'refusal';
  targets: string[];
  predicates: string[][];
  location: { start: number; end: number; line: number; column: number };
}
export interface SourceCoverageManifest {
  schemaVersion: 1;
  criterion: 'transition-outcomes';
  source: { fileName: string; hash: string; algorithm: 'SHA-256' };
  extractor: string;
  complete: boolean;
  machineCount: number;
  obligations: SourceCoverageObligation[];
  diagnostics: Array<{
    code: string;
    message: string;
    path: string;
    start: number;
    end: number;
  }>;
}
export interface SourceCoverageWitness<TEvent = { type: string }> {
  schemaVersion: 1;
  sourceHash: string;
  runtimeId: string;
  machineIndex: number;
  input?: unknown;
  events: TEvent[];
  outcomeIds: string[];
}
export interface SourceCoverageReport {
  schemaVersion: 1;
  criterion: 'transition-outcomes';
  sourceHash: string;
  runtimeId: string | null;
  machineIndices: number[];
  extractionComplete: boolean;
  complete: boolean;
  total: number;
  covered: string[];
  uncovered: SourceCoverageObligation[];
  coverage: number;
  /** Number of retained witnesses containing each outcome. */
  counts: Record<string, number>;
  witnesses: Record<string, number[]>;
  diagnostics: SourceCoverageManifest['diagnostics'];
}
function createSourceCoverageError(message: string) {
  return Object.assign(new Error(message), {
    code: 'SOURCE_COVERAGE_MISMATCH',
  });
}
function isSourceCoverageError(error: unknown): boolean {
  return (
    (error as { code?: string } | undefined)?.code ===
    'SOURCE_COVERAGE_MISMATCH'
  );
}
function getManifestIndex(manifest: SourceCoverageManifest) {
  if (
    manifest.schemaVersion !== 1 ||
    manifest.criterion !== 'transition-outcomes' ||
    manifest.source.algorithm !== 'SHA-256' ||
    !/^[\da-f]{64}$/.test(manifest.source.hash)
  )
    throw new Error('Unsupported source coverage manifest or source hash');
  if (
    typeof manifest.complete !== 'boolean' ||
    !Array.isArray(manifest.diagnostics) ||
    !Array.isArray(manifest.obligations) ||
    !Number.isSafeInteger(manifest.machineCount) ||
    manifest.machineCount < 1
  )
    throw new Error('Invalid source coverage manifest');
  const index = new Map<string, SourceCoverageObligation>();
  for (const obligation of manifest.obligations) {
    if (
      typeof obligation.id !== 'string' ||
      !obligation.id ||
      !Number.isSafeInteger(obligation.machineIndex) ||
      obligation.machineIndex < 0 ||
      obligation.machineIndex >= manifest.machineCount ||
      !['transition', 'targetless', 'refusal'].includes(obligation.kind) ||
      !Array.isArray(obligation.targets) ||
      obligation.targets.some((target) => typeof target !== 'string')
    )
      throw new Error('Invalid source coverage obligation');
    if (index.has(obligation.id))
      throw new Error(`Duplicate source obligation: ${obligation.id}`);
    index.set(obligation.id, obligation);
  }
  return index;
}
/** Reports witnessed coverage against an independently extracted denominator. */
export function getSourceCoverageReport<TEvent>(
  manifest: SourceCoverageManifest,
  witnesses: readonly SourceCoverageWitness<TEvent>[],
): SourceCoverageReport {
  const index = getManifestIndex(manifest);
  const counts: Record<string, number> = Object.create(null);
  const evidence: Record<string, number[]> = Object.create(null);
  const runtimeIds = new Set(witnesses.map((w) => w.runtimeId));
  if (
    runtimeIds.size > 1 ||
    witnesses.some((w) => typeof w.runtimeId !== 'string' || !w.runtimeId)
  )
    throw createSourceCoverageError(
      'Witnesses must identify one execution runtime',
    );
  for (const [witnessIndex, witness] of witnesses.entries()) {
    if (
      witness.schemaVersion !== 1 ||
      witness.sourceHash !== manifest.source.hash
    )
      throw createSourceCoverageError(
        'Witness source revision does not match the manifest',
      );
    if (
      !Number.isSafeInteger(witness.machineIndex) ||
      witness.machineIndex < 0 ||
      witness.machineIndex >= manifest.machineCount
    )
      throw createSourceCoverageError('Unknown source machine identity');
    if (!Array.isArray(witness.events) || !Array.isArray(witness.outcomeIds))
      throw createSourceCoverageError('Invalid source coverage witness');
    for (const id of new Set(witness.outcomeIds)) {
      const obligation = index.get(id);
      if (!obligation || obligation.machineIndex !== witness.machineIndex)
        throw createSourceCoverageError(
          `Unknown source outcome for machine ${witness.machineIndex}: ${id}`,
        );
      counts[id] = (counts[id] ?? 0) + 1;
      (evidence[id] ??= []).push(witnessIndex);
    }
  }
  const covered = [...index.keys()].filter((id) => counts[id] > 0);
  const uncovered = manifest.obligations.filter((o) => !counts[o.id]);
  const extractionComplete =
    manifest.complete && manifest.diagnostics.length === 0;
  return {
    schemaVersion: 1,
    criterion: 'transition-outcomes',
    machineIndices: [
      ...new Set(manifest.obligations.map((o) => o.machineIndex)),
    ],
    runtimeId: witnesses[0]?.runtimeId ?? null,
    sourceHash: manifest.source.hash,
    extractionComplete,
    complete: extractionComplete && uncovered.length === 0,
    total: index.size,
    covered,
    uncovered,
    coverage: index.size
      ? covered.length / index.size
      : extractionComplete
        ? 1
        : 0,
    counts: { ...counts },
    witnesses: { ...evidence },
    diagnostics: manifest.diagnostics,
  };
}
/** Greedy suite reduction retains every witnessed source obligation. */
export function* genReducedSourceCoverageWitnesses<TEvent>(
  manifest: SourceCoverageManifest,
  witnesses: readonly SourceCoverageWitness<TEvent>[],
): Generator<SourceCoverageWitness<TEvent>, void, unknown> {
  const report = getSourceCoverageReport(manifest, witnesses);
  const remaining = new Set(report.covered);
  const ordered = [...witnesses].sort(
    (a, b) => a.events.length - b.events.length,
  );
  while (remaining.size) {
    let best: SourceCoverageWitness<TEvent> | undefined;
    let hits = 0;
    for (const witness of ordered) {
      const gain = new Set(witness.outcomeIds.filter((id) => remaining.has(id)))
        .size;
      if (gain > hits) {
        best = witness;
        hits = gain;
      }
    }
    if (!best) break;
    yield best;
    best.outcomeIds.forEach((id) => remaining.delete(id));
  }
}
export function getReducedSourceCoverageWitnesses<TEvent>(
  manifest: SourceCoverageManifest,
  witnesses: readonly SourceCoverageWitness<TEvent>[],
): SourceCoverageWitness<TEvent>[] {
  return [...genReducedSourceCoverageWitnesses(manifest, witnesses)];
}
export interface SourceCoverageStep<TSnapshot = unknown> {
  /** Identity must retain every distinction relevant to future behavior. */
  stateId: string;
  snapshot: TSnapshot;
  outcomeIds: readonly string[];
  terminal?: boolean;
}
export interface SourceCoverageSession<TEvent, TSnapshot = unknown> {
  runtimeId: string;
  initial: SourceCoverageStep<TSnapshot>;
  step(
    event: TEvent,
  ): SourceCoverageStep<TSnapshot> | Promise<SourceCoverageStep<TSnapshot>>;
  close?(): void | Promise<void>;
}
export interface SourceCoverageSearchOptions<TEvent, TSnapshot = unknown> {
  manifest: SourceCoverageManifest;
  machineIndex?: number;
  input?: unknown;
  createSession(
    input: unknown,
  ):
    | SourceCoverageSession<TEvent, TSnapshot>
    | Promise<SourceCoverageSession<TEvent, TSnapshot>>;
  /** Explicit cases and schema/PBT-generated candidates are tried in order. */
  events:
    | readonly TEvent[]
    | ((
        state: SourceCoverageStep<TSnapshot>,
      ) => readonly TEvent[] | Promise<readonly TEvent[]>);
  /** Optional targeted/LLM suggestions. Suggestions are verified by execution. */
  suggestEvents?: (args: {
    state: SourceCoverageStep<TSnapshot>;
    prefix: readonly TEvent[];
    uncovered: readonly SourceCoverageObligation[];
  }) => readonly TEvent[] | Promise<readonly TEvent[]>;
  maxStates?: number;
  maxDepth?: number;
  maxExecutions?: number;
}
function getPositiveLimit(
  value: number | undefined,
  fallback: number,
  name: string,
): number {
  const limit = value ?? fallback;
  if (!Number.isSafeInteger(limit) || limit < 0)
    throw new Error(`${name} must be a nonnegative safe integer`);
  return limit;
}
/** Replays a concrete fixture against a fresh session and rechecks its claims. */
export async function getSourceCoverageReplay<TEvent, TSnapshot>(
  manifest: SourceCoverageManifest,
  witness: SourceCoverageWitness<TEvent>,
  createSession: SourceCoverageSearchOptions<
    TEvent,
    TSnapshot
  >['createSession'],
) {
  getSourceCoverageReport(manifest, [witness]);
  const session = await createSession(witness.input);
  if (session.runtimeId !== witness.runtimeId) {
    await session.close?.();
    throw createSourceCoverageError(
      'Witness execution runtime does not match this session',
    );
  }
  const index = getManifestIndex(manifest);
  const observed = new Set(session.initial.outcomeIds);
  let state = session.initial;
  try {
    for (const event of witness.events) {
      if (state.terminal)
        throw new Error('Witness sends an event after the session terminated');
      state = await session.step(event);
      state.outcomeIds.forEach((id) => observed.add(id));
    }
    for (const id of observed) {
      if (!index.has(id))
        throw createSourceCoverageError(`Unknown source outcome: ${id}`);
      if (index.get(id)!.machineIndex !== witness.machineIndex)
        observed.delete(id);
    }
    const missing = witness.outcomeIds.filter((id) => !observed.has(id));
    if (missing.length)
      throw new Error(
        `Source coverage witness did not reproduce: ${missing.join(', ')}`,
      );
    const result = { ...witness, outcomeIds: [...observed] };
    getSourceCoverageReport(manifest, [result]);
    return { witness: result, state };
  } finally {
    await session.close?.();
  }
}
/** Shrinks a witness by deleting event chunks, verifying every candidate. */
export async function getMinimizedSourceCoverageWitness<TEvent, TSnapshot>(
  manifest: SourceCoverageManifest,
  witness: SourceCoverageWitness<TEvent>,
  createSession: SourceCoverageSearchOptions<
    TEvent,
    TSnapshot
  >['createSession'],
  options: {
    maxExecutions?: number;
    shrinkEvent?: (event: TEvent) => Iterable<TEvent>;
  } = {},
) {
  await getSourceCoverageReplay(manifest, witness, createSession);
  const limit = getPositiveLimit(options.maxExecutions, 1000, 'maxExecutions');
  let executions = 0;
  let best = witness;
  const hasReplayCoverage = async (events: TEvent[]) => {
    if (executions++ >= limit) return false;
    try {
      const replay = await getSourceCoverageReplay(
        manifest,
        { ...best, events },
        createSession,
      );
      best = { ...replay.witness, outcomeIds: witness.outcomeIds };
      return true;
    } catch (error) {
      if (isSourceCoverageError(error)) throw error;
      return false;
    }
  };
  for (
    let width = Math.floor(best.events.length / 2) || 1;
    width >= 1;
    width = Math.floor(width / 2)
  ) {
    for (
      let start = 0;
      start + width <= best.events.length && executions < limit;
    ) {
      if (
        !(await hasReplayCoverage([
          ...best.events.slice(0, start),
          ...best.events.slice(start + width),
        ]))
      )
        start++;
    }
  }
  if (options.shrinkEvent)
    for (let index = 0; index < best.events.length; index++) {
      const seen = new Set([JSON.stringify(best.events[index])]);
      for (let changed = true; changed && executions < limit;) {
        changed = false;
        for (const candidate of options.shrinkEvent(best.events[index])) {
          if (executions >= limit) break;
          const key = JSON.stringify(candidate);
          if (seen.has(key)) continue;
          seen.add(key);
          const events = [...best.events];
          events[index] = candidate;
          if (await hasReplayCoverage(events)) {
            changed = true;
            break;
          }
        }
      }
    }
  return { witness: best, executions, truncated: executions >= limit };
}
/** Coverage-directed search stops once every extracted obligation has a witness. */
export async function* genSourceCoverageWitnesses<TEvent, TSnapshot>(
  options: SourceCoverageSearchOptions<TEvent, TSnapshot>,
) {
  const { manifest } = options;
  const index = getManifestIndex(manifest);
  const machineIndex = options.machineIndex ?? 0;
  if (
    !Number.isSafeInteger(machineIndex) ||
    machineIndex < 0 ||
    machineIndex >= manifest.machineCount
  )
    throw createSourceCoverageError('Unknown source machine identity');
  const maxStates = getPositiveLimit(options.maxStates, 10000, 'maxStates');
  const maxDepth = getPositiveLimit(options.maxDepth, 32, 'maxDepth');
  const maxExecutions = getPositiveLimit(
    options.maxExecutions,
    100000,
    'maxExecutions',
  );
  const required = new Set(
    manifest.obligations
      .filter((o) => o.machineIndex === machineIndex)
      .map((o) => o.id),
  );
  const hit = new Set<string>();
  const witnesses: SourceCoverageWitness<TEvent>[] = [];
  const queue: Array<{ events: TEvent[]; stateId?: string }> = [{ events: [] }];
  const pending = new Map<string, { events: TEvent[]; stateId: string }>();
  const visited = new Map<string, { events: TEvent[]; version: number }>();
  const addPrefix = (events: TEvent[], stateId: string) => {
    const known = visited.get(stateId);
    if (known && events.length < known.events.length) {
      known.events = events;
      known.version = -1;
    } else if (known && (!options.suggestEvents || known.version === hit.size)) return;
    const scheduled = pending.get(stateId);
    if (scheduled) {
      if (events.length < scheduled.events.length) scheduled.events = events;
    } else {
      const entry = { events: known?.events ?? events, stateId };
      queue.push(entry);
      pending.set(stateId, entry);
    }
  };
  let runtimeId: string | undefined;
  const addRuntime = (id: string) => {
    if (
      typeof id !== 'string' || !id ||
      (runtimeId !== undefined && id !== runtimeId)
    )
      throw createSourceCoverageError(
        'Search sessions must identify one execution runtime',
      );
    runtimeId = id;
  };
  let executions = 0;
  let yielded = 0;
  const truncation = new Set<string>();
  const errors: Array<{ events: TEvent[]; message: string }> = [];
  const addWitness = (
    events: TEvent[],
    ids: readonly string[],
    runtimeId: string,
  ) => {
    for (const id of ids)
      if (!index.has(id))
        throw createSourceCoverageError(`Unexpected source outcome: ${id}`);
    ids = ids.filter((id) => index.get(id)!.machineIndex === machineIndex);
    if (!ids.some((id) => !hit.has(id))) return;
    ids.forEach((id) => hit.add(id));
    if (options.suggestEvents)
      for (const [stateId, state] of visited)
        if (
          state.version < hit.size &&
          state.events.length < maxDepth
        ) addPrefix(state.events, stateId);
    witnesses.push({
      schemaVersion: 1,
      sourceHash: manifest.source.hash,
      runtimeId,
      machineIndex,
      input: options.input,
      events,
      outcomeIds: [...new Set(ids)],
    });
  };
  for (let head = 0; head < queue.length; head++) {
    if ([...required].every((id) => hit.has(id))) break;
    if (maxStates === 0) {
      truncation.add('maxStates');
      break;
    }
    const { events: prefix, stateId } = queue[head];
    if (stateId !== undefined) pending.delete(stateId);
    const session = await options.createSession(options.input);
    let state = session.initial;
    const ids = new Set(state.outcomeIds);
    try {
      addRuntime(session.runtimeId);
      let validPrefix = true;
      for (const event of prefix) {
        if (executions >= maxExecutions) {
          truncation.add('maxExecutions');
          validPrefix = false;
          break;
        }
        executions++;
        state = await session.step(event);
        state.outcomeIds.forEach((id) => ids.add(id));
      }
      if (!validPrefix) break;
      addWitness(prefix, [...ids], session.runtimeId);
      while (yielded < witnesses.length) yield witnesses[yielded++];
      if ([...required].every((id) => hit.has(id))) break;
      if (state.terminal) continue;
      let known = visited.get(state.stateId);
      if (known && (!options.suggestEvents || known.version === hit.size)) continue;
      if (!known) {
        if (visited.size >= maxStates) {
          truncation.add('maxStates');
          continue;
        }
        known = { events: prefix, version: hit.size };
        visited.set(state.stateId, known);
      } else {
        if (prefix.length < known.events.length) known.events = prefix;
        known.version = hit.size;
      }
      if (prefix.length >= maxDepth) {
        truncation.add('maxDepth');
        continue;
      }
      const defaults =
        typeof options.events === 'function'
          ? await options.events(state)
          : options.events;
      const suggestions =
        (await options.suggestEvents?.({
          state,
          prefix,
          uncovered: manifest.obligations.filter(
            (o) => required.has(o.id) && !hit.has(o.id),
          ),
        })) ?? [];
      const cases = [
        ...new Map(
          [...defaults, ...suggestions].map((event) => [
            JSON.stringify(event),
            event,
          ]),
        ).values(),
      ];
      for (const event of cases) {
        if (executions >= maxExecutions) {
          truncation.add('maxExecutions');
          break;
        }
        const candidate = await options.createSession(options.input);
        let next = candidate.initial;
        const outcomes = new Set(next.outcomeIds);
        try {
          addRuntime(candidate.runtimeId);
          let validCandidate = true;
          for (const prior of [...prefix, event]) {
            if (executions >= maxExecutions) {
              truncation.add('maxExecutions');
              validCandidate = false;
              break;
            }
            executions++;
            next = await candidate.step(prior);
            next.outcomeIds.forEach((id) => outcomes.add(id));
          }
          if (validCandidate) {
            const events = [...prefix, event];
            addWitness(events, [...outcomes], candidate.runtimeId);
            while (yielded < witnesses.length) yield witnesses[yielded++];
            if (!next.terminal) addPrefix(events, next.stateId);
          }
        } catch (error) {
          if (isSourceCoverageError(error)) throw error;
          errors.push({
            events: [...prefix, event],
            message: error instanceof Error ? error.message : String(error),
          });
        } finally {
          await candidate.close?.();
        }
        if ([...required].every((id) => hit.has(id))) break;
      }
    } finally {
      await session.close?.();
    }
    if (truncation.has('maxExecutions')) break;
  }
  const reduced = getReducedSourceCoverageWitnesses(manifest, witnesses);
  const report = getSourceCoverageReport(
    {
      ...manifest,
      obligations: manifest.obligations.filter(
        (o) => o.machineIndex === machineIndex,
      ),
    },
    reduced,
  );
  return {
    machineIndex,
    report,
    witnesses: reduced,
    exploration: {
      states: visited.size,
      executions,
      maxStates,
      maxDepth,
      maxExecutions,
      truncated: truncation.size > 0,
      truncationReasons: [...truncation],
      errors,
    },
  };
}

/** Consumes the witness stream and returns the final report and reduced suite. */
export async function getSourceCoverageWitnesses<TEvent, TSnapshot>(
  options: SourceCoverageSearchOptions<TEvent, TSnapshot>,
) {
  const iterator = genSourceCoverageWitnesses(options);
  for (;;) {
    const step = await iterator.next();
    if (step.done) return step.value;
  }
}
