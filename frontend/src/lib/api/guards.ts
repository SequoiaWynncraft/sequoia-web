/** True if the value is a non-null object usable as a keyed record. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** True if the value is a whole number that is zero or greater. */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * True if the value is a finite number that is zero or greater. For measured
 * amounts rather than tallies - playtime and decay-weighted scores are
 * legitimately fractional, so they must not be held to whole numbers.
 */
export function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
