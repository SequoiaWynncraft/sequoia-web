export interface HeldTerritory {
  name: string;
  acquired: string;
}

export interface HeldTerritoriesResponse {
  generated_at: string;
  stale: boolean;
  territories: HeldTerritory[];
}

export function isHeldTerritoriesResponse(value: unknown): value is HeldTerritoriesResponse {
  return (
    isRecord(value) &&
    typeof value.generated_at === "string" &&
    typeof value.stale === "boolean" &&
    Array.isArray(value.territories) &&
    value.territories.every(
      (entry) => isRecord(entry) && typeof entry.name === "string" && typeof entry.acquired === "string",
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
