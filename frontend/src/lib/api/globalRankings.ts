/** Delta windows the rankings page offers; keys match the backend's range grammar. */
export const RANKING_WINDOWS = [
  { key: "1d", label: "24h" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "Lifetime" },
] as const;

export type RankingWindow = (typeof RANKING_WINDOWS)[number]["key"];

export function isRankingWindow(value: string | null): value is RankingWindow {
  return RANKING_WINDOWS.some((window) => window.key === value);
}

export interface GlobalRaidRankingEntry {
  position: number;
  guild_name: string;
  prefix: string;
  raids_gained: number;
  raids_total: number;
  leaderboard_rank: number;
}

export interface GlobalRaidRankings {
  range: string;
  baseline_sampled_at: string | null;
  current_sampled_at: string | null;
  warming_up: boolean;
  entries: GlobalRaidRankingEntry[];
}

export interface GlobalRaidRankingsResponse extends GlobalRaidRankings {
  generated_at: string;
  stale: boolean;
}

export function isGlobalRaidRankings(value: unknown): value is GlobalRaidRankings {
  if (!isRecord(value)) return false;
  if (typeof value.range !== "string") return false;
  if (value.baseline_sampled_at !== null && typeof value.baseline_sampled_at !== "string") return false;
  if (value.current_sampled_at !== null && typeof value.current_sampled_at !== "string") return false;
  if (typeof value.warming_up !== "boolean") return false;
  return (
    Array.isArray(value.entries) &&
    value.entries.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.position === "number" &&
        typeof entry.guild_name === "string" &&
        typeof entry.prefix === "string" &&
        typeof entry.raids_gained === "number" &&
        typeof entry.raids_total === "number" &&
        typeof entry.leaderboard_rank === "number",
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
