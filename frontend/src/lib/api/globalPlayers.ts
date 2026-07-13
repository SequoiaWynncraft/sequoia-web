/** Metrics the player rankings boards cover; keys match the backend grammar. */
export const PLAYER_METRICS = [
  { key: "playtime", label: "Playtime" },
  { key: "wars", label: "Wars" },
  { key: "raids", label: "Raids" },
] as const;

export type PlayerMetric = (typeof PLAYER_METRICS)[number]["key"];

export function isPlayerMetric(value: string | null): value is PlayerMetric {
  return PLAYER_METRICS.some((metric) => metric.key === value);
}

/** Windows the player rankings boards cover; day-granular UTC rollups. */
export const PLAYER_WINDOWS = [
  { key: "1d", label: "1d" },
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "all", label: "Lifetime" },
] as const;

export type PlayerWindow = (typeof PLAYER_WINDOWS)[number]["key"];

export function isPlayerWindow(value: string | null): value is PlayerWindow {
  return PLAYER_WINDOWS.some((window) => window.key === value);
}

export interface GlobalPlayerRankingEntry {
  position: number;
  player_uuid: string;
  username: string;
  guild_name: string | null;
  guild_prefix: string | null;
  value: number;
}

export interface GlobalPlayerRankings {
  metric: string;
  range: string;
  /** Inclusive UTC day window; null on lifetime boards. */
  from: string | null;
  to: string | null;
  /** Earliest rollup day - lifetime raids only cover the tracked span. */
  data_since: string | null;
  warming_up: boolean;
  entries: GlobalPlayerRankingEntry[];
}

export interface GlobalPlayerRankingsResponse extends GlobalPlayerRankings {
  generated_at: string;
  stale: boolean;
}

export function isGlobalPlayerRankings(value: unknown): value is GlobalPlayerRankings {
  if (!isRecord(value)) return false;
  if (typeof value.metric !== "string" || typeof value.range !== "string") return false;
  if (value.from !== null && typeof value.from !== "string") return false;
  if (value.to !== null && typeof value.to !== "string") return false;
  if (value.data_since !== null && typeof value.data_since !== "string") return false;
  if (typeof value.warming_up !== "boolean") return false;
  return (
    Array.isArray(value.entries) &&
    value.entries.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.position === "number" &&
        typeof entry.player_uuid === "string" &&
        typeof entry.username === "string" &&
        (entry.guild_name === null || typeof entry.guild_name === "string") &&
        (entry.guild_prefix === null || typeof entry.guild_prefix === "string") &&
        typeof entry.value === "number",
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
