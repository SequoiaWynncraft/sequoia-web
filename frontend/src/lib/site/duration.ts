export interface ParsedDuration {
  ms: number;
  label: string;
}

export const RAID_WINDOWS = [
  { key: "1d", label: "24h" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
] as const;

export type RaidWindow = (typeof RAID_WINDOWS)[number]["key"];

export function raidWindowPreset(input: string): (typeof RAID_WINDOWS)[number] | null {
  return RAID_WINDOWS.find((window) => window.key === input.trim().toLowerCase()) ?? null;
}

const UNIT_MS = {
  min: 60_000,
  h: 3_600_000,
  d: 86_400_000,
  m: 30 * 86_400_000,
} as const;

const UNIT_LABEL: Record<keyof typeof UNIT_MS, string> = {
  min: "min",
  h: "h",
  d: "d",
  m: "mo",
};

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

  return { ms, label: `${match[1]}${UNIT_LABEL[unit]}` };
}

export interface TimestampRange {
  fromMs: number;
  toMs: number;
}

/**
 * Outcome of {@link parseTimestampRange}: a resolved `range`, a user-facing
 * `error` when the input is a range attempt that isn't queryable, or `null`
 * when the input isn't a timestamp range at all (no `t:` prefix).
 */
export type TimestampRangeResult = { range: TimestampRange } | { error: string } | null;

const TRACKING_START_MS = Date.UTC(2020, 0, 1);

/**
 * Parse a prefixed Unix-timestamp range like `t:1784109600-1784282400`
 * (start-end, in seconds) into an explicit window. A reversed range is
 * auto-corrected so the smaller timestamp is the start, and the end is clamped
 * to `now` when it lies in the future.
 *
 * Returns `null` when the input has no `t:` prefix (not a range attempt). For a
 * `t:`-prefixed input that can't be served it returns an `{ error }`: a
 * malformed range that doesn't match the `start-end` shape, a start before raid
 * tracking began ({@link TRACKING_START_MS}, 2020), or an empty window once
 * clamped.
 */
export function parseTimestampRange(input: string, now: Date): TimestampRangeResult {
  const trimmed = input.trim();
  if (!/^[tT]:/.test(trimmed)) return null;

  const match = trimmed.match(/^[tT]:\s*(\d+)\s*-\s*(\d+)$/);
  if (!match) return { error: "Couldn't read that timestamp range." };

  let fromMs = Number(match[1]) * 1000;
  let toMs = Number(match[2]) * 1000;
  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs)) {
    return { error: "Couldn't read those timestamps." };
  }
  if (fromMs > toMs) [fromMs, toMs] = [toMs, fromMs];

  if (fromMs < TRACKING_START_MS) {
    const year = new Date(fromMs).getUTCFullYear();
    return { error: `Outside of tracked time, you tried to query year ${year}.` };
  }

  toMs = Math.min(toMs, now.getTime());
  if (fromMs >= toMs) return { error: "That timeframe is empty." };

  return { range: { fromMs, toMs } };
}
