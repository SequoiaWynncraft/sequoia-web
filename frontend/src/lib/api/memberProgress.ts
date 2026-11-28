import { isNonNegativeInteger, isNonNegativeNumber } from "./guards";

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
  /** Decay-weighted score, not a count - fractional values are normal. */
  war_points: number;
  wars_participated: number;
}

function isCountRecord(value: unknown): value is Record<string, number> {
  return (
    typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.values(value).every(isNonNegativeInteger)
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
        isNonNegativeNumber((member as Record<string, unknown>).playtime_hours) &&
        isNonNegativeNumber((member as Record<string, unknown>).war_points) &&
        isNonNegativeInteger((member as Record<string, unknown>).raids) &&
        isNonNegativeInteger((member as Record<string, unknown>).wars) &&
        isNonNegativeInteger((member as Record<string, unknown>).wars_participated) &&
        isCountRecord((member as Record<string, unknown>).raids_by_type),
    )
  );
}
