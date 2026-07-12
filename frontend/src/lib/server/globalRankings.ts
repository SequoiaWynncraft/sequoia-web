import {
  isGlobalRaidRankings,
  type GlobalRaidRankings,
  type GlobalRaidRankingsResponse,
  type RankingWindow,
} from "$lib/api/globalRankings";
import { SEQUOIA_API_BASE_URL } from "$lib/config/public";
import { createCachedResource, type CachedResource } from "$lib/server/serverCache";

const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;

const resources = new Map<RankingWindow, CachedResource<GlobalRaidRankings>>();

export async function getGlobalRaidRankings(
  fetchImpl: typeof fetch,
  window: RankingWindow,
): Promise<GlobalRaidRankingsResponse> {
  let resource = resources.get(window);
  if (!resource) {
    resource = createCachedResource<GlobalRaidRankings>({
      key: `global-raid-rankings:${window}:v1`,
      freshMs: FRESH_MS,
      staleMs: STALE_MS,
      load: (impl) => loadRankings(impl, window),
      validate: isGlobalRaidRankings,
    });
    resources.set(window, resource);
  }
  const value = await resource.get(fetchImpl, { allowStale: true });
  return {
    ...value.data,
    generated_at: new Date(value.updatedAt).toISOString(),
    stale: value.stale,
  };
}

async function loadRankings(fetchImpl: typeof fetch, window: RankingWindow): Promise<GlobalRaidRankings> {
  const url = `${SEQUOIA_API_BASE_URL}/public/global/guild-raid-rankings?range=${window}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Global raid rankings request failed (${response.status}).`);
  const data = (await response.json()) as Record<string, unknown>;
  const normalized = {
    range: data.range,
    baseline_sampled_at: data.baseline_sampled_at ?? null,
    current_sampled_at: data.current_sampled_at ?? null,
    warming_up: data.warming_up,
    entries: Array.isArray(data.entries)
      ? data.entries.map((entry: Record<string, unknown>) => ({
          position: entry.position,
          guild_name: entry.guild_name,
          prefix: typeof entry.prefix === "string" ? entry.prefix : "",
          raids_gained: entry.raids_gained,
          raids_total: entry.raids_total,
          leaderboard_rank: entry.leaderboard_rank,
        }))
      : [],
  };
  if (!isGlobalRaidRankings(normalized)) throw new Error("Unexpected global raid rankings response.");
  return normalized;
}
