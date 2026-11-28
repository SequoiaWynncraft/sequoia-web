import { type SeasonRankingEntry, type SeasonRankingsResponse } from "#lib/api/seasonRankings.js";
import { isRecord } from "#lib/api/guards.js";
import { createCachedResource, type CachedResource } from "#lib/server/serverCache.js";
import { fetchWynncraftJson } from "#lib/server/wynncraft.js";

const RESULT_LIMIT = 100;
const FRESH_MS = 10 * 60 * 1000;
const STALE_MS = 3 * 24 * 60 * 60 * 1000;
const MAX_SEASON = 999;

const resources = new Map<number, CachedResource<SeasonRankingEntry[]>>();

type SeasonRankingsOptions = { allowStale?: boolean };

export async function getSeasonRankings(
  fetchImpl: typeof fetch,
  season: number,
  options: SeasonRankingsOptions = {},
): Promise<SeasonRankingsResponse> {
  if (!Number.isSafeInteger(season) || season < 0 || season > MAX_SEASON) {
    throw new Error(`Invalid season number: ${season}.`);
  }

  let value;
  try {
    value = await seasonResource(season).get(fetchImpl, options);
  } catch {
    throw new Error("Unable to load season rankings.");
  }

  return {
    generated_at: new Date(value.updatedAt).toISOString(),
    stale: value.stale,
    season,
    entries: value.data,
  };
}

function seasonResource(season: number): CachedResource<SeasonRankingEntry[]> {
  let resource = resources.get(season);
  if (!resource) {
    resource = createCachedResource({
      key: `wynn-leaderboard:guildSeason${season}:v1`,
      freshMs: FRESH_MS,
      staleMs: STALE_MS,
      load: (fetchImpl) => loadSeasonRankings(fetchImpl, season),
      validate: isEntryList,
    });
    resources.set(season, resource);
  }
  return resource;
}

async function loadSeasonRankings(fetchImpl: typeof fetch, season: number): Promise<SeasonRankingEntry[]> {
  const payload = await fetchWynncraftJson(
    fetchImpl,
    `/leaderboards/guildSeason${season}?resultLimit=${RESULT_LIMIT}`,
  );
  return parseSeasonLeaderboard(payload);
}

export function parseSeasonLeaderboard(value: unknown): SeasonRankingEntry[] {
  if (!isRecord(value)) throw new Error("Unexpected Wynncraft leaderboard response.");

  const entries = Object.entries(value).flatMap(([position, entry]): SeasonRankingEntry[] => {
    const positionNumber = Number.parseInt(position, 10);
    if (!Number.isSafeInteger(positionNumber) || positionNumber < 1 || !isRecord(entry)) return [];
    const name = entry.name;
    const rating = entry.score;
    if (typeof name !== "string" || typeof rating !== "number" || !Number.isFinite(rating)) return [];
    return [
      {
        position: positionNumber,
        name,
        prefix: typeof entry.prefix === "string" ? entry.prefix : "",
        rating: Math.max(0, Math.round(rating)),
      },
    ];
  });

  entries.sort((a, b) => a.position - b.position);
  return entries;
}

function isEntryList(value: unknown): value is SeasonRankingEntry[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        isRecord(entry) &&
        typeof entry.position === "number" &&
        typeof entry.name === "string" &&
        typeof entry.prefix === "string" &&
        typeof entry.rating === "number",
    )
  );
}
