import {
  isGlobalPlayerRankings,
  type GlobalPlayerRankings,
  type GlobalPlayerRankingsResponse,
  type PlayerMetric,
  type PlayerWindow,
} from "#lib/api/globalPlayers.js";
import { SEQUOIA_API_BASE_URL } from "#lib/config/public.js";
import { createCachedResource, type CachedResource } from "#lib/server/serverCache.js";

const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;

// One resource per (metric, window) pair - a small fixed set (3 x 4).
const resources = new Map<string, CachedResource<GlobalPlayerRankings>>();

export async function getGlobalPlayerRankings(
  fetchImpl: typeof fetch,
  metric: PlayerMetric,
  window: PlayerWindow,
): Promise<GlobalPlayerRankingsResponse> {
  const key = `${metric}:${window}`;
  let resource = resources.get(key);
  if (!resource) {
    resource = createCachedResource<GlobalPlayerRankings>({
      key: `global-player-rankings:${key}:v1`,
      freshMs: FRESH_MS,
      staleMs: STALE_MS,
      load: (impl) => loadRankings(impl, metric, window),
      validate: isGlobalPlayerRankings,
    });
    resources.set(key, resource);
  }
  const value = await resource.get(fetchImpl, { allowStale: true });
  return {
    ...value.data,
    generated_at: new Date(value.updatedAt).toISOString(),
    stale: value.stale,
  };
}

async function loadRankings(
  fetchImpl: typeof fetch,
  metric: PlayerMetric,
  window: PlayerWindow,
): Promise<GlobalPlayerRankings> {
  const query = new URLSearchParams({ metric, range: window });
  const url = `${SEQUOIA_API_BASE_URL}/public/global/player-rankings?${query}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Global player rankings request failed (${response.status}).`);
  const data = (await response.json()) as Record<string, unknown>;
  const normalized = {
    metric: data.metric,
    range: data.range,
    from: typeof data.from === "string" ? data.from : null,
    to: typeof data.to === "string" ? data.to : null,
    data_since: typeof data.data_since === "string" ? data.data_since : null,
    warming_up: data.warming_up === true,
    entries: Array.isArray(data.entries)
      ? data.entries.flatMap((entry: Record<string, unknown>) =>
          typeof entry.username === "string" && typeof entry.player_uuid === "string"
            ? [
                {
                  position: entry.position,
                  player_uuid: entry.player_uuid,
                  username: entry.username,
                  guild_name: typeof entry.guild_name === "string" ? entry.guild_name : null,
                  guild_prefix: typeof entry.guild_prefix === "string" ? entry.guild_prefix : null,
                  value: entry.value,
                },
              ]
            : [],
        )
      : [],
  };
  if (!isGlobalPlayerRankings(normalized)) {
    throw new Error("Unexpected global player rankings response.");
  }
  return normalized;
}
