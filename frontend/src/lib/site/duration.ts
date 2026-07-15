export interface ParsedDuration {
  /** Length of the window in milliseconds. */
  ms: number;
  /** Compact human label for the window, e.g. "20 min" or "0.5 d". */
  label: string;
}

/** Milliseconds per supported unit. A month is treated as 30 days. */
const UNIT_MS = {
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  m: 30 * 86_400_000,
} as const;

/** How each unit is spelled back to the reader in a label. */
const UNIT_LABEL: Record<keyof typeof UNIT_MS, string> = {
  min: "min",
  h: "h",
  d: "d",
  m: "mo",
};

/** Longest window we allow, to keep the backing query bounded (~1 year). */
const MAX_MS = 366 * UNIT_MS.d;

/**
 * Parse a compact timeframe string like `20min`, `7h`, `0.5d`, or `1m` into a
 * duration. Units are `min` (minutes), `h` (hours), `d` (days), and `m`
 * (months); `min` is matched ahead of `m` so minute inputs are never read as
 * months. Returns `null` for anything unparseable, non-positive, or beyond the
 * maximum window.
 */
export function parseDuration(input: string): ParsedDuration | null {
  const match = input.trim().toLowerCase().match(/^(\d+(?:\.\d+)?)\s*(min|m|h|d)$/);
  if (!match) return null;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return null;

  const unit = match[2] as keyof typeof UNIT_MS;
  const ms = value * UNIT_MS[unit];
  if (ms > MAX_MS) return null;

  return { ms, label: `${match[1]} ${UNIT_LABEL[unit]}` };
}
