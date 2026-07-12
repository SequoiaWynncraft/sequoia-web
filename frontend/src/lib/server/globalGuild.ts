import { createSequoiaApiClient } from "$lib/api/client";
import type { GuildStatsResponse } from "$lib/api/guildStats";
import { parseGuildStats } from "$lib/server/guildStats";
import { createCachedResource, type CachedResource } from "$lib/server/serverCache";
import { WYNNCRAFT_API_BASE } from "$lib/server/wynncraft";

const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
const SEARCH_FRESH_MS = 10 * 60 * 1000;
const MAX_GUILDS = 32;
const MAX_SEARCHES = 64;

/** "notFound" is cached like a payload so unknown names don't hammer the API. */
type GuildLookup = { found: false } | { found: true; payload: Record<string, unknown> };

export interface GuildSearchHit {
  name: string;
  prefix: string;
}

export interface ActivityDay {
  /** UTC calendar day, e.g. "2026-07-05". */
  day: string;
  raid_counts: { raid_name: string; count: number }[];
}

const guildResources = new Map<string, CachedResource<GuildLookup>>();
const searchResources = new Map<string, CachedResource<GuildSearchHit[]>>();

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
  let resource = guildResources.get(key);
  if (!resource) {
    evictOldest(guildResources, MAX_GUILDS);
    resource = createCachedResource<GuildLookup>({
      key: `wynn-guild-any:${key}:v1`,
      freshMs: FRESH_MS,
      staleMs: STALE_MS,
      load: (impl) => loadGuild(impl, name.trim()),
      validate: isGuildLookup,
    });
    guildResources.set(key, resource);
  }
  const value = await resource.get(fetchImpl, { allowStale: true });
  if (!value.data.found) return null;
  const stats = parseGuildStats(value.data.payload, new Date(value.updatedAt).toISOString());
  return { ...stats, stale: value.stale };
}

/** Guilds matching a name/prefix query, via the Wynncraft search API. */
export async function searchGuilds(fetchImpl: typeof fetch, query: string): Promise<GuildSearchHit[]> {
  const key = query.trim().toLowerCase();
  if (key.length < 3) return [];
  let resource = searchResources.get(key);
  if (!resource) {
    evictOldest(searchResources, MAX_SEARCHES);
    resource = createCachedResource<GuildSearchHit[]>({
      key: `wynn-guild-search:${key}:v1`,
      freshMs: SEARCH_FRESH_MS,
      staleMs: STALE_MS,
      load: (impl) => loadSearch(impl, key),
      validate: isSearchHits,
    });
    searchResources.set(key, resource);
  }
  return (await resource.get(fetchImpl, { allowStale: true })).data;
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

async function loadGuild(fetchImpl: typeof fetch, name: string): Promise<GuildLookup> {
  const response = await fetchImpl(
    `${WYNNCRAFT_API_BASE}/guild/${encodeURIComponent(name)}?identifier=username`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) },
  );
  if (response.status === 404) return { found: false };
  if (!response.ok) throw new Error(`Wynncraft guild request failed with status ${response.status}.`);
  const payload = (await response.json()) as Record<string, unknown>;
  if (typeof payload !== "object" || payload === null || typeof payload.members !== "object") {
    throw new Error("Unexpected Wynncraft guild response.");
  }
  return { found: true, payload };
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

function isGuildLookup(value: unknown): value is GuildLookup {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.found === false) return true;
  return record.found === true && typeof record.payload === "object" && record.payload !== null;
}

function isSearchHits(value: unknown): value is GuildSearchHit[] {
  return (
    Array.isArray(value) &&
    value.every(
      (entry) =>
        typeof entry === "object" &&
        entry !== null &&
        typeof (entry as Record<string, unknown>).name === "string" &&
        typeof (entry as Record<string, unknown>).prefix === "string",
    )
  );
}
