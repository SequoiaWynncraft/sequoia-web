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

// One resource per (window, raid) pair - a small fixed set (4 windows x 6 scopes).
const resources = new Map<string, CachedResource<GlobalRaidRankings>>();

export async function getGlobalRaidRankings(
  fetchImpl: typeof fetch,
  window: RankingWindow,
  raid?: string,
): Promise<GlobalRaidRankingsResponse> {
  const key = `${window}:${raid ?? "all-raids"}`;
  let resource = resources.get(key);
  if (!resource) {
    resource = createCachedResource<GlobalRaidRankings>({
      key: `global-raid-rankings:${key}:v2`,
      freshMs: FRESH_MS,
      staleMs: STALE_MS,
      load: (impl) => loadRankings(impl, window, raid),
      validate: isGlobalRaidRankings,
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
  window: RankingWindow,
  raid?: string,
): Promise<GlobalRaidRankings> {
  const query = new URLSearchParams({ range: window });
  if (raid) query.set("raid", raid);
  const url = `${SEQUOIA_API_BASE_URL}/public/global/guild-raid-rankings?${query}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Global raid rankings request failed (${response.status}).`);
  const data = (await response.json()) as Record<string, unknown>;
  // The extra columns default to zero so a backend that predates them still
  // renders the board instead of failing validation.
  const normalized = {
    range: data.range,
    baseline_sampled_at: data.baseline_sampled_at ?? null,
    current_sampled_at: data.current_sampled_at ?? null,
    warming_up: data.warming_up,
    totals_only:
      typeof data.totals_only === "boolean"
        ? data.totals_only
        : data.warming_up === true || window === "all",
    entries: Array.isArray(data.entries)
      ? data.entries.map((entry: Record<string, unknown>) => ({
          position: entry.position,
          guild_name: entry.guild_name,
          prefix: typeof entry.prefix === "string" ? entry.prefix : "",
          raids_gained: entry.raids_gained,
          raids_total: entry.raids_total,
          gambits_gained: typeof entry.gambits_gained === "number" ? entry.gambits_gained : 0,
          gambits_total: typeof entry.gambits_total === "number" ? entry.gambits_total : 0,
          sr_gained: typeof entry.sr_gained === "number" ? entry.sr_gained : 0,
          sr_total: typeof entry.sr_total === "number" ? entry.sr_total : 0,
          leaderboard_rank: entry.leaderboard_rank,
        }))
      : [],
  };
  if (!isGlobalRaidRankings(normalized)) throw new Error("Unexpected global raid rankings response.");
  return normalized;
}
