import { isRecord } from "$lib/api/guards";

/** Milliseconds in a day, the unit every gap in the level tracker is expressed in. */
const DAY_MS = 86_400_000;

/**
 * One guild level-up: the level reached, the level held before it, and when the
 * site first observed the change.
 */
export interface GuildLevelUp {
  level: number;
  /** The previous known level. */
  fromLevel: number;
  /** ISO 8601 instant the new level was first observed. */
  observedAt: string;
}

/** The guild's level standing as of the most recent Wynncraft payload. */
export interface GuildLevelStatus {
  level: number;
  /** Progress toward the next level, 0-100, as Wynncraft reports it. */
  xpPercent: number;
  /** ISO 8601 instant the payload behind these numbers was fetched. */
  observedAt: string;
}

/** Everything the Level Tracker section renders. */
export interface GuildLevelTracker {
  current: GuildLevelStatus;
  /** Recorded level-ups, newest first. */
  history: GuildLevelUp[];
  /** Ready-to-paste Discord payout message; null below two level-ups. */
  payoutText: string | null;
}

/**
 * Days between two level-ups, to four decimals - the precision the reference
 * tracker quotes and the one staff paste into payout messages. Lives here
 * rather than beside the loader because both the server (building the payout
 * text) and the browser (rendering the history rows) need it.
 */
export function dayGap(fromIso: string, toIso: string): string {
  return ((Date.parse(toIso) - Date.parse(fromIso)) / DAY_MS).toFixed(4);
}

/**
 * One row of the backend's level history, as sent: the level reached and when
 * the backend's snapshot first saw it. There is no "from level" on the wire -
 * see `toLevelUps`, which derives it from the preceding row.
 */
export interface GuildLevelHistoryEntry {
  level: number;
  observed_at: string;
  /** True for the initial observation, which is context rather than a level-up. */
  baseline?: boolean;
}

/**
 * Response of `GET /public/global/guilds/{guildUuid}/level-history`.
 *
 * `entries` arrives oldest first. `current_level` and `level_observed_at`
 * describe the newest snapshot rather than a level change, and the payload
 * carries no XP percentage - the tracker keeps taking those from the guild
 * stats read it already performs.
 */
export interface GuildLevelHistoryResponse {
  guild_uuid: string;
  name: string;
  prefix: string;
  current_level: number;
  level_observed_at: string;
  entries: GuildLevelHistoryEntry[];
}

/**
 * Narrows an unknown value to a `GuildLevelHistoryResponse`. Required because
 * the cached resource wrapping this endpoint revalidates whatever it reads back
 * out of the persisted cache, where a shape change would otherwise go unnoticed.
 */
export function isGuildLevelHistoryResponse(
  value: unknown,
): value is GuildLevelHistoryResponse {
  return (
    isRecord(value) &&
    typeof value.guild_uuid === "string" &&
    typeof value.name === "string" &&
    typeof value.prefix === "string" &&
    typeof value.current_level === "number" &&
    typeof value.level_observed_at === "string" &&
    Array.isArray(value.entries) &&
    value.entries.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.level === "number" &&
        typeof entry.observed_at === "string" &&
        (entry.baseline === undefined || typeof entry.baseline === "boolean"),
    )
  );
}

/**
 * Maps the backend's oldest-first entries onto the newest-first level-ups the
 * tracker renders, deriving each row's previous level from the row before it.
 *
 * Rows the site cannot trust are dropped rather than rendered: a malformed
 * level or timestamp, and any level at or below one already kept. That last rule
 * matches the guild itself - levels only ever rise, so a repeated or lower level
 * is a duplicate or a bad snapshot, never a level-down.
 */
export function toLevelUps(entries: readonly GuildLevelHistoryEntry[]): GuildLevelUp[] {
  const usable = entries
    .filter(
      (entry) =>
        Number.isInteger(entry.level) &&
        entry.level > 0 &&
        Number.isFinite(Date.parse(entry.observed_at)),
    )
    // The endpoint documents an ascending order, but the derived `fromLevel`
    // chain is only correct if that holds, so sort rather than assume.
    .sort((a, b) => Date.parse(a.observed_at) - Date.parse(b.observed_at));

  if (usable.length === 0) return [];

  // New responses label the baseline explicitly. For cached responses from an
  // older backend, the oldest valid row has the same baseline semantics.
  const explicitBaselineIndex = usable.findIndex((entry) => entry.baseline === true);
  const baselineIndex = explicitBaselineIndex >= 0 ? explicitBaselineIndex : 0;
  let previousLevel = usable[baselineIndex]!.level;
  const oldestFirst: GuildLevelUp[] = [];
  for (const entry of usable.slice(baselineIndex + 1)) {
    if (entry.level <= previousLevel) continue;
    oldestFirst.push({
      level: entry.level,
      fromLevel: previousLevel,
      observedAt: new Date(Date.parse(entry.observed_at)).toISOString(),
    });
    previousLevel = entry.level;
  }
  return oldestFirst.reverse();
}
