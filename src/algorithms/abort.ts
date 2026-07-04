/**
 * Throws the signal's abort reason if the signal is already aborted.
 *
 * Expensive algorithms call this at coarse granularity — once per source
 * node, iteration, or phase, never per inner-loop edge — so cancellation is
 * near-immediate without measurable steady-state overhead. On abort it throws
 * `signal.reason` (a `DOMException` named `AbortError` by default), matching
 * the platform `AbortSignal.throwIfAborted()` contract.
 */
export function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason;
  }
}
