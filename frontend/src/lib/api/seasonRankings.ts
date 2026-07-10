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

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
