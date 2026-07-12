import { createSequoiaApiClient } from "$lib/api/client";
import type { GuildStatsResponse } from "$lib/api/guildStats";
import { parseGuildStats } from "$lib/server/guildStats";
import { createCachedResource, type CachedResource } from "$lib/server/serverCache";
import { WYNNCRAFT_API_BASE } from "$lib/server/wynncraft";

const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
const SEARCH_TTL_MS = 10 * 60 * 1000;
const NOT_FOUND_TTL_MS = 5 * 60 * 1000;
const MAX_GUILDS = 32;
const MAX_SEARCHES = 64;
const MAX_MISSES = 256;

type GuildPayload = Record<string, unknown>;

export interface GuildSearchHit {
  name: string;
  prefix: string;
}

export interface ActivityDay {
  /** UTC calendar day, e.g. "2026-07-05". */
  day: string;
  raid_counts: { raid_name: string; count: number }[];
}

/**
 * Only real guilds reach the persistent cache: arbitrary slugs are attacker
 * controlled, and every persisted key becomes an api_cache row that eviction
 * here cannot delete. Misses and searches live in capped in-memory TTL maps -
 * enough to shield the Wynncraft API, nothing on disk.
 */
const guildResources = new Map<string, CachedResource<GuildPayload>>();
const missesUntil = new Map<string, number>();
const searchCache = new Map<string, { expires: number; hits: GuildSearchHit[] }>();

class GuildNotFoundError extends Error {}

/**
 * Stats for any Wynncraft guild by exact name. Null when no such guild
 * exists; throws when the API is unavailable.
 */
export async function getGuildStatsByName(
  fetchImpl: typeof fetch,
  name: string,
): Promise<GuildStatsResponse | null> {
  const key = name.trim().toLowerCase();
  if (!key) return null;
  const missedAt = missesUntil.get(key);
  if (missedAt !== undefined && missedAt > Date.now()) return null;
  let resource = guildResources.get(key);
  if (!resource) {
    evictOldest(guildResources, MAX_GUILDS);
    resource = createCachedResource<GuildPayload>({
      key: `wynn-guild-any:${key}:v2`,
      freshMs: FRESH_MS,
      staleMs: STALE_MS,
      load: (impl) => loadGuild(impl, name.trim(), key),
      validate: isGuildPayload,
    });
    guildResources.set(key, resource);
  }
  let value;
  try {
    value = await resource.get(fetchImpl, { allowStale: true });
  } catch (error) {
    if (error instanceof GuildNotFoundError) return null;
    throw error;
  }
  const stats = parseGuildStats(value.data, new Date(value.updatedAt).toISOString());
  return { ...stats, stale: value.stale };
}

/** Guilds matching a name/prefix query, via the Wynncraft search API. */
export async function searchGuilds(fetchImpl: typeof fetch, query: string): Promise<GuildSearchHit[]> {
  const key = query.trim().toLowerCase();
  if (key.length < 3) return [];
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.hits;
  const hits = await loadSearch(fetchImpl, key);
  evictOldest(searchCache, MAX_SEARCHES);
  searchCache.set(key, { expires: Date.now() + SEARCH_TTL_MS, hits });
  return hits;
}

/**
 * Daily per-raid completion counts for any guild over the trailing window.
 * Null when the feed is unavailable.
 */
export async function loadGuildRaidActivity(
  fetchImpl: typeof fetch,
  guildName: string,
  windowDays: number,
): Promise<ActivityDay[] | null> {
  const timedFetch: typeof fetch = (input, init) =>
    fetchImpl(input, { ...init, signal: AbortSignal.timeout(6000) });
  const client = createSequoiaApiClient({ fetch: timedFetch });
  const to = new Date();
  const from = new Date(to.getTime() - (windowDays - 1) * 24 * 60 * 60 * 1000);
  from.setUTCHours(0, 0, 0, 0);

  const result = await client.getSeasonRaidActivity({
    from: from.toISOString(),
    to: to.toISOString(),
    guild_names: guildName,
  });
  if (!result.ok) return null;

  const entry = result.data.entries.find((candidate) => candidate.guild_name === guildName);
  return entry?.days ?? [];
}

async function loadGuild(fetchImpl: typeof fetch, name: string, key: string): Promise<GuildPayload> {
  const response = await fetchImpl(
    `${WYNNCRAFT_API_BASE}/guild/${encodeURIComponent(name)}?identifier=username`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) },
  );
  if (response.status === 404) {
    evictOldest(missesUntil, MAX_MISSES);
    missesUntil.set(key, Date.now() + NOT_FOUND_TTL_MS);
    throw new GuildNotFoundError(name);
  }
  if (!response.ok) throw new Error(`Wynncraft guild request failed with status ${response.status}.`);
  const payload = (await response.json()) as Record<string, unknown>;
  if (!isGuildPayload(payload)) {
    throw new Error("Unexpected Wynncraft guild response.");
  }
  return payload;
}

async function loadSearch(fetchImpl: typeof fetch, query: string): Promise<GuildSearchHit[]> {
  const response = await fetchImpl(`${WYNNCRAFT_API_BASE}/search/${encodeURIComponent(query)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  // The search API 404s when nothing matches.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Wynncraft search failed with status ${response.status}.`);
  const payload = (await response.json()) as Record<string, unknown>;
  // Name matches and prefix/tag matches arrive in separate maps, both keyed
  // by guild uuid - merge them so searching by tag works.
  const byUuid = new Map<string, unknown>();
  for (const source of [payload.guilds, payload.guildsPrefix]) {
    if (typeof source !== "object" || source === null) continue;
    for (const [uuid, entry] of Object.entries(source)) byUuid.set(uuid, entry);
  }
  const hits = [...byUuid.values()].flatMap((entry): GuildSearchHit[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const record = entry as Record<string, unknown>;
    if (typeof record.name !== "string") return [];
    return [{ name: record.name, prefix: typeof record.prefix === "string" ? record.prefix : "" }];
  });
  hits.sort((a, b) => a.name.localeCompare(b.name));
  return hits;
}

function evictOldest(pool: Map<string, unknown>, cap: number): void {
  if (pool.size < cap) return;
  const oldest = pool.keys().next().value;
  if (oldest !== undefined) pool.delete(oldest as string);
}

function isGuildPayload(value: unknown): value is GuildPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).members === "object" &&
    (value as Record<string, unknown>).members !== null
  );
}
