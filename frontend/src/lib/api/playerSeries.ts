/** One player's per-day gains from the backend's daily rollups. Days without activity are omitted. */
export interface PlayerSeriesResponse {
  generated_at: string;
  player_uuid: string;
  from: string;
  to: string;
  /** Earliest rollup day per source - ranges starting before these undercount. */
  data_since: { activity: string; raids: string; war_points: string };
  days: PlayerSeriesDay[];
}

export interface PlayerSeriesDay {
  day: string;
  playtime_hours: number;
  wars: number;
  raids: number;
  war_points: number;
}

export function isPlayerSeriesResponse(value: unknown): value is PlayerSeriesResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.generated_at === "string" &&
    typeof record.player_uuid === "string" &&
    typeof record.from === "string" &&
    typeof record.to === "string" &&
    typeof record.data_since === "object" &&
    record.data_since !== null &&
    Array.isArray(record.days) &&
    record.days.every(
      (day) =>
        typeof day === "object" &&
        day !== null &&
        typeof (day as Record<string, unknown>).day === "string" &&
        typeof (day as Record<string, unknown>).playtime_hours === "number" &&
        typeof (day as Record<string, unknown>).wars === "number" &&
        typeof (day as Record<string, unknown>).raids === "number" &&
        typeof (day as Record<string, unknown>).war_points === "number",
    )
  );
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Inclusive UTC days the profile pages fetch: the backend clamps series spans to 400 days. */
export const SERIES_DAYS = 400;

/** Inclusive day count behind each tracking-chart range chip; `all` is the whole fetched series. */
export const TRACK_RANGE_DAYS: Readonly<Record<string, number>> = {
  "1w": 7,
  "1m": 30,
  "3m": 91,
  "6m": 182,
  all: SERIES_DAYS,
};

/**
 * First day of the inclusive window of `days` UTC days that ends on `to`.
 *
 * Both bounds are `YYYY-MM-DD`; a 1-day window starts and ends on `to`.
 */
export function windowStart(to: string, days: number): string {
  return new Date(Date.parse(`${to}T00:00:00Z`) - (days - 1) * DAY_MS).toISOString().slice(0, 10);
}

/**
 * The slice of a fetched series one range chip shows, never reaching before
 * the first fetched day.
 */
export function trackWindow(
  series: Pick<PlayerSeriesResponse, "from" | "to">,
  range: string,
): { from: string; to: string } {
  const from = windowStart(series.to, TRACK_RANGE_DAYS[range]);
  return { from: from < series.from ? series.from : from, to: series.to };
}
