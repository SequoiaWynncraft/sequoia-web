import { isPlayerSeriesResponse, type PlayerSeriesResponse } from "#lib/api/playerSeries.js";
import { SEQUOIA_API_BASE_URL } from "#lib/config/public.js";
import { createCachedResource, type CachedResource } from "#lib/server/serverCache.js";

const FRESH_MS = 5 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
const MAX_PLAYERS = 64;

const resources = new Map<string, CachedResource<PlayerSeriesResponse>>();

/** Full-history series for one player; callers slice ranges client-side. */
export async function getPlayerSeries(
  fetchImpl: typeof fetch,
  playerUuid: string,
  from: string,
  to: string,
): Promise<PlayerSeriesResponse> {
  const key = `${playerUuid.toLowerCase()}:${from}..${to}`;
  let resource = resources.get(key);
  if (!resource) {
    if (resources.size >= MAX_PLAYERS) {
      const oldest = resources.keys().next().value;
      if (oldest !== undefined) resources.delete(oldest);
    }
    resource = createCachedResource<PlayerSeriesResponse>({
      key: `player-series:${key}`,
      freshMs: FRESH_MS,
      staleMs: STALE_MS,
      load: (impl) => loadSeries(impl, playerUuid, from, to),
      validate: isPlayerSeriesResponse,
    });
    resources.set(key, resource);
  }
  return (await resource.get(fetchImpl, { allowStale: true })).data;
}

async function loadSeries(
  fetchImpl: typeof fetch,
  playerUuid: string,
  from: string,
  to: string,
): Promise<PlayerSeriesResponse> {
  const timedFetch: typeof fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: AbortSignal.timeout(8000) });
  const url = `${SEQUOIA_API_BASE_URL}/public/stats/player-progress-series?player=${encodeURIComponent(playerUuid)}&from=${from}&to=${to}`;
  const response = await timedFetch(url);
  if (!response.ok) throw new Error(`Player series request failed (${response.status}).`);
  const data = await response.json();
  if (!isPlayerSeriesResponse(data)) throw new Error("Unexpected player series response.");
  return data;
}
