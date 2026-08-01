/** Per-member gains over a UTC date range, summed from the backend's daily rollups. */
export interface MemberProgressResponse {
  generated_at: string;
  from: string;
  to: string;
  /** Earliest rollup day per source - ranges starting before these undercount. */
  data_since: { activity: string; raids: string; war_points: string };
  members: MemberProgressEntry[];
}

export interface MemberProgressEntry {
  player_uuid: string;
  player_name: string;
  playtime_hours: number;
  wars: number;
  raids: number;
  raids_by_type: Record<string, number>;
  war_points: number;
  wars_participated: number;
}

/** Counts are nonnegative safe integers - a negative or fractional value is
 * upstream corruption, not data. */
function isCount(value: unknown): boolean {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isCountRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.values(value).every(isCount)
  );
}

export function isMemberProgressResponse(value: unknown): value is MemberProgressResponse {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.generated_at === "string" &&
    typeof record.from === "string" &&
    typeof record.to === "string" &&
    typeof record.data_since === "object" &&
    record.data_since !== null &&
    Array.isArray(record.members) &&
    record.members.every(
      (member) =>
        typeof member === "object" &&
        member !== null &&
        typeof (member as Record<string, unknown>).player_uuid === "string" &&
        typeof (member as Record<string, unknown>).player_name === "string" &&
        // Playtime is fractional but never negative; the rest are counts.
        typeof (member as Record<string, unknown>).playtime_hours === "number" &&
        Number.isFinite((member as Record<string, unknown>).playtime_hours) &&
        ((member as Record<string, unknown>).playtime_hours as number) >= 0 &&
        isCount((member as Record<string, unknown>).raids) &&
        // Raffle eligibility thresholds and weights read this directly - a
        // missing count must fail validation, not read as zero wars.
        isCount((member as Record<string, unknown>).wars) &&
        isCount((member as Record<string, unknown>).wars_participated) &&
        isCount((member as Record<string, unknown>).war_points) &&
        // The progress export dereferences the per-raid breakdown; a payload
        // without it must fail validation, not 500 the download.
        isCountRecord((member as Record<string, unknown>).raids_by_type),
    )
  );
}
