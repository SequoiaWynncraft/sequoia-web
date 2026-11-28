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

