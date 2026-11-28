export interface HeldTerritory {
  name: string;
  acquired: string;
}

export interface HeldTerritoriesResponse {
  generated_at: string;
  stale: boolean;
  territories: HeldTerritory[];
}
