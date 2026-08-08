import { isRecord, isNonNegativeInteger } from "$lib/api/guards";

export interface SeasonRankingEntry {
  position: number;
  name: string;
  prefix: string;
  rating: number;
}

export interface SeasonRankingsResponse {
  generated_at: string;
  stale: boolean;
  season: number;
  entries: SeasonRankingEntry[];
}

export function isSeasonRankingsResponse(value: unknown): value is SeasonRankingsResponse {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    typeof value.stale === "boolean" &&
    isNonNegativeInteger(value.season) &&
    Array.isArray(value.entries) &&
    value.entries.every(isSeasonRankingEntry)
  );
}

function isSeasonRankingEntry(value: unknown): value is SeasonRankingEntry {
  return (
    isRecord(value) &&
    isNonNegativeInteger(value.position) &&
    typeof value.name === "string" &&
    typeof value.prefix === "string" &&
    isNonNegativeInteger(value.rating)
  );
}

