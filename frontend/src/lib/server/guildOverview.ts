import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { env } from "$env/dynamic/private";
import { createClient, type Client } from "@libsql/client";

import {
  isGuildOverviewResponse,
  type BranchmasterMember,
  type BranchmasterRank,
  type GuildOverviewResponse,
} from "$lib/api/guildOverview";

const WYNNCRAFT_GUILD_URL = "https://api.wynncraft.com/v3/guild/prefix/SEQ?identifier=username";
const CACHE_KEY = "guild-overview:SEQ:v1";
const FRESH_MS = 2 * 60 * 1000;
const STALE_MS = 3 * 24 * 60 * 60 * 1000;
const RANKS = ["owner", "chief", "strategist"] as const;
const RANK_ORDER = new Map<BranchmasterRank, number>(RANKS.map((rank, index) => [rank, index]));

type CacheEntry = { data: GuildOverviewResponse; updatedAt: number };
type GuildOverviewOptions = { allowStale?: boolean };

let dbPromise: Promise<Client> | undefined;
let memoryCache: CacheEntry | null = null;
let refreshPromise: Promise<GuildOverviewResponse> | undefined;

export async function getGuildOverview(
  fetchImpl: typeof fetch,
  options: GuildOverviewOptions = {},
): Promise<GuildOverviewResponse> {
  const now = Date.now();
  const memoryAge = memoryCache ? now - memoryCache.updatedAt : Number.POSITIVE_INFINITY;
  if (memoryCache && memoryAge < FRESH_MS) {
    return withStaleness(memoryCache.data, false);
  }
  if (options.allowStale && memoryCache && memoryAge < STALE_MS) {
    void refreshGuildOverviewOnce(fetchImpl).catch(() => undefined);
    return withStaleness(memoryCache.data, true);
  }

  const persisted = await readCache().catch(() => null);
  const cached = newestCacheEntry(memoryCache, persisted);
  memoryCache = cached;
  if (cached && now - cached.updatedAt < FRESH_MS) return withStaleness(cached.data, false);

  const refresh = refreshGuildOverviewOnce(fetchImpl);
  if (options.allowStale && cached && now - cached.updatedAt < STALE_MS) {
    void refresh.catch(() => undefined);
    return withStaleness(cached.data, true);
  }

  try {
    return await refresh;
  } catch {
    if (cached && now - cached.updatedAt < STALE_MS) return withStaleness(cached.data, true);
    throw new Error("Unable to load guild overview.");
  }
}

function refreshGuildOverviewOnce(fetchImpl: typeof fetch): Promise<GuildOverviewResponse> {
  refreshPromise ??= refreshGuildOverview(fetchImpl).finally(() => {
    refreshPromise = undefined;
  });
  return refreshPromise;
}

export async function fetchWynncraftGuildOverview(fetchImpl: typeof fetch): Promise<GuildOverviewResponse> {
  const response = await fetchImpl(WYNNCRAFT_GUILD_URL, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    throw new Error(`Wynncraft guild request failed with status ${response.status}.`);
  }

  return parseWynncraftGuildOverview(await response.json());
}

export function parseWynncraftGuildOverview(value: unknown): GuildOverviewResponse {
  if (!isRecord(value) || !isRecord(value.members)) {
    throw new Error("Unexpected Wynncraft guild response.");
  }

  const members = value.members;
  const generatedAt = new Date().toISOString();
  const branchmasters = RANKS.flatMap((rank) => parseRankMembers(rank, members)).sort(compareMembers);

  return {
    generated_at: generatedAt,
    stale: false,
    stats: {
      members: requiredNumber(members.total),
      guild_level: requiredNumber(value.level),
      territories: requiredNumber(value.territories),
      total_wars: requiredNumber(value.wars),
      raids: requiredNumber(value.raids),
      online_now: requiredNumber(value.online),
    },
    branchmasters,
  };
}

async function refreshGuildOverview(fetchImpl: typeof fetch): Promise<GuildOverviewResponse> {
  const fresh = await fetchWynncraftGuildOverview(fetchImpl);
  const updatedAt = Date.now();
  memoryCache = { data: fresh, updatedAt };
  await writeCache(fresh, updatedAt).catch(() => undefined);
  return fresh;
}

function newestCacheEntry(first: CacheEntry | null, second: CacheEntry | null): CacheEntry | null {
  if (!first) return second;
  if (!second) return first;
  return first.updatedAt >= second.updatedAt ? first : second;
}

function withStaleness(data: GuildOverviewResponse, stale: boolean): GuildOverviewResponse {
  return {
    ...data,
    stale,
    branchmasters: stale
      ? data.branchmasters.map((member) => ({ ...member, online: null }))
      : data.branchmasters,
  };
}

async function readCache(): Promise<CacheEntry | null> {
  const db = await database();
  const result = await db.execute({
    sql: "SELECT value, updated_at FROM api_cache WHERE key = ?",
    args: [CACHE_KEY],
  });
  const row = result.rows[0];
  if (!row || typeof row.value !== "string" || typeof row.updated_at !== "number") return null;

  try {
    const data = JSON.parse(row.value);
    if (!isGuildOverviewResponse(data)) return null;
    return { data, updatedAt: row.updated_at };
  } catch {
    return null;
  }
}

async function writeCache(data: GuildOverviewResponse, updatedAt: number) {
  const db = await database();
  await db.execute({
    sql: "INSERT OR REPLACE INTO api_cache (key, value, updated_at) VALUES (?, ?, ?)",
    args: [CACHE_KEY, JSON.stringify(data), updatedAt],
  });
}

async function database(): Promise<Client> {
  dbPromise ??= createDatabase().catch((error: unknown) => {
    dbPromise = undefined;
    throw error;
  });
  return dbPromise;
}

async function createDatabase(): Promise<Client> {
  const url = databaseUrl();
  const localPath = localDatabasePath(url);
  if (localPath) await mkdir(path.dirname(localPath), { recursive: true });

  const client = createClient({
    url,
    authToken: env.TURSO_AUTH_TOKEN?.trim() || undefined,
    timeout: 5000,
  });

  await client.execute(`
    CREATE TABLE IF NOT EXISTS api_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);

  return client;
}

function databaseUrl(): string {
  return env.TURSO_DATABASE_URL?.trim() || env.SEQUOIA_WEB_DB_URL?.trim() || "file:.data/sequoia-web.db";
}

function localDatabasePath(url: string): string | null {
  if (!url.startsWith("file:")) return null;
  const value = url.slice("file:".length);
  if (value.startsWith("//")) return fileURLToPath(url);
  return path.resolve(process.cwd(), value || ".data/sequoia-web.db");
}

function parseRankMembers(rank: BranchmasterRank, members: Record<string, unknown>): BranchmasterMember[] {
  const group = members[rank];
  if (!isRecord(group)) return [];

  return Object.entries(group).map(([identifier, member]) => {
    if (!isRecord(member)) throw new Error("Unexpected Wynncraft member response.");
    const globalData = isRecord(member.globalData) ? member.globalData : {};
    const raids = isRecord(globalData.raids) ? nonNegativeInteger(globalData.raids.total) : undefined;
    const restrictions = isRecord(member.restrictions) ? member.restrictions : {};
    const onlineRestricted = restrictions.online_status === true || restrictions.onlineStatus === true;

    return {
      username: stringValue(member.username) ?? stringValue(member.legacyName) ?? identifier,
      rank,
      online: onlineRestricted ? null : booleanValue(member.online),
      contributed: requiredNumber(member.contributed),
      contribution_rank: requiredNumber(member.contributionRank),
      wars: nonNegativeInteger(globalData.wars) ?? null,
      raids: raids ?? null,
      joined: stringValue(member.joined) ?? null,
    };
  });
}

function compareMembers(a: BranchmasterMember, b: BranchmasterMember): number {
  return (
    (RANK_ORDER.get(a.rank) ?? 99) - (RANK_ORDER.get(b.rank) ?? 99) ||
    a.contribution_rank - b.contribution_rank ||
    b.contributed - a.contributed ||
    a.username.localeCompare(b.username)
  );
}

function requiredNumber(value: unknown): number {
  const number = nonNegativeInteger(value);
  if (number === undefined) throw new Error("Unexpected Wynncraft numeric field.");
  return number;
}

function nonNegativeInteger(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function booleanValue(value: unknown): boolean | null {
  return typeof value === "boolean" ? value : null;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
