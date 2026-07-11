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
