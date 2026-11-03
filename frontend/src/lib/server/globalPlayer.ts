import type { PlayerCardResponse } from "#lib/api/playerCard.js";
import {
  canonicalUuid,
  isWynnPlayerPayload,
  parsePlayerCard,
  UnknownPlayerError,
  wynnPlayerResource,
  type WynnPlayerPayload,
} from "#lib/server/playerCard.js";
import type { CachedValue } from "#lib/server/serverCache.js";
import { WYNNCRAFT_API_BASE } from "#lib/server/wynncraft.js";

const SEARCH_TTL_MS = 10 * 60 * 1000;
const NOT_FOUND_TTL_MS = 5 * 60 * 1000;
const ALIAS_FRESH_MS = 2 * 60 * 1000;
const MAX_ALIASES = 256;
const MAX_SEARCHES = 64;
const MAX_MISSES = 256;

export interface PlayerSearchHit {
  username: string;
  uuid: string;
}

const aliases = new Map<string, { uuid: string; resolvedAt: number }>();
const resolving = new Map<string, Promise<CachedValue<WynnPlayerPayload>>>();
const missesUntil = new Map<string, number>();
const searchCache = new Map<string, { expires: number; hits: PlayerSearchHit[] }>();

class PlayerNotFoundError extends Error {}

export class AmbiguousPlayerError extends Error {}

export async function getAnyPlayerCard(
  fetchImpl: typeof fetch,
  ident: string,
): Promise<PlayerCardResponse | null> {
  const key = ident.trim().toLowerCase();
  if (!key) return null;
  const missedAt = missesUntil.get(key);
  if (missedAt !== undefined && missedAt > Date.now()) return null;
  let value;
  try {
    value = await playerValue(fetchImpl, key, ident.trim());
  } catch (error) {
    if (error instanceof PlayerNotFoundError || error instanceof UnknownPlayerError) {
      evictOldest(missesUntil, MAX_MISSES);
      missesUntil.set(key, Date.now() + NOT_FOUND_TTL_MS);
      return null;
    }
    throw error;
  }
  const card = parsePlayerCard(value.data, new Date(value.updatedAt).toISOString());
  return value.stale ? { ...card, stale: true, online: null, server: null } : card;
}

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

function playerValue(fetchImpl: typeof fetch, key: string, ident: string): Promise<CachedValue<WynnPlayerPayload>> {
  const uuid = canonicalUuid(key);
  if (uuid) return wynnPlayerResource(uuid).get(fetchImpl, { allowStale: true });
  const alias = aliases.get(key);
  if (alias && Date.now() - alias.resolvedAt < ALIAS_FRESH_MS) {
    return wynnPlayerResource(alias.uuid).get(fetchImpl, { allowStale: true });
  }
  let pending = resolving.get(key);
  if (!pending) {
    pending = resolveName(fetchImpl, key, ident)
      .catch((error: unknown) => {
        if (error instanceof PlayerNotFoundError || error instanceof AmbiguousPlayerError) {
          aliases.delete(key);
          throw error;
        }
        if (!alias) throw error;
        return wynnPlayerResource(alias.uuid).get(fetchImpl, { allowStale: true });
      })
      .finally(() => resolving.delete(key));
    resolving.set(key, pending);
  }
  return pending;
}

async function resolveName(
  fetchImpl: typeof fetch,
  key: string,
  ident: string,
): Promise<CachedValue<WynnPlayerPayload>> {
  const payload = await loadPlayerByName(fetchImpl, ident);
  const uuid = canonicalUuid(payload.uuid);
  if (!uuid) throw new Error("Unexpected Wynncraft player response.");
  aliases.delete(key);
  evictOldest(aliases, MAX_ALIASES);
  aliases.set(key, { uuid, resolvedAt: Date.now() });
  return wynnPlayerResource(uuid).put(payload);
}

async function loadPlayerByName(fetchImpl: typeof fetch, ident: string): Promise<WynnPlayerPayload> {
  const response = await fetchImpl(
    `${WYNNCRAFT_API_BASE}/player/${encodeURIComponent(ident)}?fullResult`,
    { headers: { accept: "application/json" }, signal: AbortSignal.timeout(8000) },
  );
  if (response.status === 404) throw new PlayerNotFoundError(ident);
  if (response.status === 300) throw new AmbiguousPlayerError(ident);
  if (!response.ok) throw new Error(`Wynncraft player request failed with status ${response.status}.`);
  const payload: unknown = await response.json();
  if (!isWynnPlayerPayload(payload)) throw new Error("Unexpected Wynncraft player response.");
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
    if (typeof entry === "string") return [{ username: entry, uuid }];
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
