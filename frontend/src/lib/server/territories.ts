import { type HeldTerritoriesResponse, type HeldTerritory } from "$lib/api/territories";
import { isRecord } from "$lib/server/guards";
import { createCachedResource } from "$lib/server/serverCache";
import { fetchWynncraftJson } from "$lib/server/wynncraft";

const GUILD_NAME = "Sequoia";
const FRESH_MS = 60 * 1000;
const STALE_MS = 60 * 60 * 1000;

const resource = createCachedResource<HeldTerritory[]>({
  key: "wynn-territories:SEQ:v1",
  freshMs: FRESH_MS,
  staleMs: STALE_MS,
  load: loadHeldTerritories,
  validate: isTerritoryList,
});

type HeldTerritoriesOptions = { allowStale?: boolean };

export async function getHeldTerritories(
  fetchImpl: typeof fetch,
  options: HeldTerritoriesOptions = {},
): Promise<HeldTerritoriesResponse> {
  let value;
  try {
    value = await resource.get(fetchImpl, options);
  } catch {
    throw new Error("Unable to load territory holdings.");
  }
  return {
    generated_at: new Date(value.updatedAt).toISOString(),
    stale: value.stale,
    territories: value.data,
  };
}

async function loadHeldTerritories(fetchImpl: typeof fetch): Promise<HeldTerritory[]> {
  const payload = await fetchWynncraftJson(fetchImpl, "/guild/list/territory");
  return parseHeldTerritories(payload);
}

export function parseHeldTerritories(value: unknown): HeldTerritory[] {
  if (!isRecord(value)) throw new Error("Unexpected Wynncraft territory response.");

  const held = Object.entries(value).flatMap(([name, entry]): HeldTerritory[] => {
    if (!isRecord(entry) || !isRecord(entry.guild)) return [];
    if (entry.guild.name !== GUILD_NAME) return [];
    if (typeof entry.acquired !== "string") return [];
    return [{ name, acquired: entry.acquired }];
  });

  // Longest-held first.
  held.sort((a, b) => Date.parse(a.acquired) - Date.parse(b.acquired) || a.name.localeCompare(b.name));
  return held;
}

function isTerritoryList(value: unknown): value is HeldTerritory[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) => isRecord(entry) && typeof entry.name === "string" && typeof entry.acquired === "string",
    )
  );
}
