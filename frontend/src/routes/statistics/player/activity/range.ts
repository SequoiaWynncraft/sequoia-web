/**
 * The UTC day range each time-scope chip resolves to.
 *
 * The member-progress feed sums whole UTC rollup days, `from..to` inclusive, so
 * an N-day chip must reach back N-1 days - never N. Subtracting a full N added
 * a silent extra day of gains under an N-day label, which is how a "1d" scope
 * came to sum two days and report more than 24h of playtime for one member.
 *
 * The two single-day chips split the difference the rollups force: `1d` is the
 * current UTC day so far, which runs thin just after midnight, and `yd` is the
 * last complete day, which always holds a full 24h.
 *
 * Split out of `+page.server.ts` so the arithmetic can be tested directly.
 */

/** Preset windows in days, each ending today; ytd, yd and all resolve specially. */
export const PRESET_DAYS: Record<string, number> = {
  "1d": 1,
  "3d": 3,
  "1w": 7,
  "1m": 30,
  "3m": 91,
  "6m": 182,
};

/** Matches the backend's 400-day span clamp, counted inclusively. */
export const ALL_DAYS = 400;

/**
 * The chip a query string asked for, or "now" when it names no known preset.
 *
 * hasOwn, not `in`: prototype keys ("constructor") would otherwise pass as a
 * preset and resolve to a NaN window.
 */
export function resolveScope(requested: string): string {
  return Object.hasOwn(PRESET_DAYS, requested) ||
    requested === "ytd" ||
    requested === "yd" ||
    requested === "all"
    ? requested
    : "now";
}

/**
 * The inclusive UTC day bounds for a scope, ending today - except `yd`.
 *
 * `1d` therefore resolves to today alone - the current UTC day so far. Daily
 * rollups cannot split a day, so a rolling 24h is not something this feed can
 * answer; today-so-far is the honest reading, and `yd` is there for anyone who
 * wants a whole day's gains instead of however much of today has elapsed.
 */
export function resolveRange(range: string, now: Date = new Date()): { from: string; to: string } {
  const to = utcDay(now);
  if (range === "ytd") return { from: `${now.getUTCFullYear()}-01-01`, to };
  if (range === "yd") {
    const day = utcDay(new Date(now.getTime() - 86_400_000));
    return { from: day, to: day };
  }
  const days = range === "all" ? ALL_DAYS : PRESET_DAYS[range];
  const start = new Date(now.getTime() - (days - 1) * 24 * 60 * 60 * 1000);
  return { from: utcDay(start), to };
}

function utcDay(date: Date): string {
  return date.toISOString().slice(0, 10);
}
