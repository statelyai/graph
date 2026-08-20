export function assertFiniteNumber(value: number, context: string): number {
  if (!Number.isFinite(value)) {
    throw new Error(`${context} must return a finite number; received ${value}`);
  }
  return value;
}

export function addFiniteNumbers(
  left: number,
  right: number,
  context: string,
): number {
  const result = left + right;
  if (!Number.isFinite(result)) {
    throw new Error(`${context} exceeds the finite number range`);
  }
  return result;
}
