import {
  isGlobalRaidRankings,
  type GlobalRaidRankings,
  type GlobalRaidRankingsResponse,
  type RankingWindow,
} from "#lib/api/globalRankings.js";
import { SEQUOIA_API_BASE_URL } from "#lib/config/public.js";
import { createCachedResource, type CachedResource } from "#lib/server/serverCache.js";

const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;

const resources = new Map<string, CachedResource<GlobalRaidRankings>>();

export async function getGlobalRaidRankings(
  fetchImpl: typeof fetch,
  window: RankingWindow,
  raid?: string,
): Promise<GlobalRaidRankingsResponse> {
  return getBoard(fetchImpl, `global-raid-rankings:${window}:${raid ?? "all-raids"}:v2`, (impl) =>
    loadRankings(impl, "guild-raid-rankings", window, raid),
  );
}

export async function getGlobalWarRankings(
  fetchImpl: typeof fetch,
  window: RankingWindow,
): Promise<GlobalRaidRankingsResponse> {
  return getBoard(fetchImpl, `global-war-rankings:${window}:v1`, (impl) =>
    loadRankings(impl, "guild-war-rankings", window),
  );
}

async function getBoard(
  fetchImpl: typeof fetch,
  key: string,
  load: (impl: typeof fetch) => Promise<GlobalRaidRankings>,
): Promise<GlobalRaidRankingsResponse> {
  let resource = resources.get(key);
  if (!resource) {
    resource = createCachedResource<GlobalRaidRankings>({
      key,
      freshMs: FRESH_MS,
      staleMs: STALE_MS,
      load,
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
  endpoint: "guild-raid-rankings" | "guild-war-rankings",
  window: RankingWindow,
  raid?: string,
): Promise<GlobalRaidRankings> {
  const query = new URLSearchParams({ range: window });
  if (raid) query.set("raid", raid);
  const url = `${SEQUOIA_API_BASE_URL}/public/global/${endpoint}?${query}`;
  const response = await fetchImpl(url, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Global rankings request failed (${response.status}).`);
  const data = (await response.json()) as Record<string, unknown>;
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
