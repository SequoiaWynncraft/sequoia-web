import type { PlayerCardResponse } from "$lib/api/playerCard";
import { parsePlayerCard } from "$lib/server/playerCard";
import { createCachedResource, type CachedResource } from "$lib/server/serverCache";
import { WYNNCRAFT_API_BASE } from "$lib/server/wynncraft";

const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 60 * 60 * 1000;
const SEARCH_TTL_MS = 10 * 60 * 1000;
const NOT_FOUND_TTL_MS = 5 * 60 * 1000;
const MAX_PLAYERS = 64;
const MAX_SEARCHES = 64;
const MAX_MISSES = 256;

type PlayerPayload = Record<string, unknown>;

export interface PlayerSearchHit {
  username: string;
  uuid: string;
}

/**
 * Only real players reach the persistent cache: arbitrary idents are attacker
 * controlled, and every persisted key becomes an api_cache row that eviction
 * here cannot delete. Misses and searches live in capped in-memory TTL maps -
 * enough to shield the Wynncraft API, nothing on disk.
 */
const playerResources = new Map<string, CachedResource<PlayerPayload>>();
const missesUntil = new Map<string, number>();
const searchCache = new Map<string, { expires: number; hits: PlayerSearchHit[] }>();

class PlayerNotFoundError extends Error {}

/**
 * Profile for any Wynncraft player by username or UUID. Null when no such
 * player exists; throws when the API is unavailable.
 */
export async function getAnyPlayerCard(
  fetchImpl: typeof fetch,
  ident: string,
): Promise<PlayerCardResponse | null> {
  const key = ident.trim().toLowerCase();
  if (!key) return null;
  const missedAt = missesUntil.get(key);
  if (missedAt !== undefined && missedAt > Date.now()) return null;
  let resource = playerResources.get(key);
  if (!resource) {
    evictOldest(playerResources, MAX_PLAYERS);
    resource = createCachedResource<PlayerPayload>({
      key: `wynn-player-any:${key}:v2`,
      freshMs: FRESH_MS,
      staleMs: STALE_MS,
      load: (impl) => loadPlayer(impl, ident.trim(), key),
      validate: isPlayerPayload,
    });
    playerResources.set(key, resource);
  }
  let value;
  try {
    value = await resource.get(fetchImpl, { allowStale: true });
  } catch (error) {
    if (error instanceof PlayerNotFoundError) return null;
    throw error;
  }
  const card = parsePlayerCard(value.data, new Date(value.updatedAt).toISOString());
  return value.stale ? { ...card, stale: true, online: null, server: null } : card;
}

/** Players matching a username query, via the Wynncraft search API. */
export async function searchPlayers(
  fetchImpl: typeof fetch,
  query: string,
): Promise<PlayerSearchHit[]> {
  const key = query.trim().toLowerCase();
  if (key.length < 3) return [];
  const cached = searchCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.hits;
  const hits = await loadSearch(fetchImpl, key);
  evictOldest(searchCache, MAX_SEARCHES);
  searchCache.set(key, { expires: Date.now() + SEARCH_TTL_MS, hits });
  return hits;
}

async function loadPlayer(fetchImpl: typeof fetch, ident: string, key: string): Promise<PlayerPayload> {
  const response = await fetchImpl(
    `${WYNNCRAFT_API_BASE}/player/${encodeURIComponent(ident)}?fullResult`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) },
  );
  if (response.status === 404) {
    evictOldest(missesUntil, MAX_MISSES);
    missesUntil.set(key, Date.now() + NOT_FOUND_TTL_MS);
    throw new PlayerNotFoundError(ident);
  }
  if (!response.ok) throw new Error(`Wynncraft player request failed with status ${response.status}.`);
  const payload = (await response.json()) as Record<string, unknown>;
  if (!isPlayerPayload(payload)) {
    throw new Error("Unexpected Wynncraft player response.");
  }
  return payload;
}

async function loadSearch(fetchImpl: typeof fetch, query: string): Promise<PlayerSearchHit[]> {
  const response = await fetchImpl(`${WYNNCRAFT_API_BASE}/search/${encodeURIComponent(query)}`, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(8000),
  });
  // The search API 404s when nothing matches.
  if (response.status === 404) return [];
  if (!response.ok) throw new Error(`Wynncraft search failed with status ${response.status}.`);
  const payload = (await response.json()) as Record<string, unknown>;
  const players = payload.players;
  if (typeof players !== "object" || players === null) return [];
  const hits = Object.entries(players).flatMap(([uuid, entry]): PlayerSearchHit[] => {
    if (typeof entry !== "object" || entry === null) return [];
    const username = (entry as Record<string, unknown>).username;
    if (typeof username !== "string") return [];
    return [{ username, uuid }];
  });
  hits.sort((a, b) => a.username.localeCompare(b.username));
  return hits;
}

function evictOldest(pool: Map<string, unknown>, cap: number): void {
  if (pool.size < cap) return;
  const oldest = pool.keys().next().value;
  if (oldest !== undefined) pool.delete(oldest as string);
}

function isPlayerPayload(value: unknown): value is PlayerPayload {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as Record<string, unknown>).username === "string"
  );
}
