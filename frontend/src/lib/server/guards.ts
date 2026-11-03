/** Coalesces to `undefined` unless the value is a whole number that is zero or greater. */
export function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

/** Coalesces to `undefined` unless the value is a finite number that is zero or greater. */
export function nonNegativeNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** Coalesces to `null` unless the value is a boolean. */
export function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

/** Coalesces to `undefined` unless the value is a string. */
export function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
