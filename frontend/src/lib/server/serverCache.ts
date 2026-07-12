import type { Client } from "@libsql/client";

import { database } from "./db";

export interface CachedValue<T> {
  data: T;
  stale: boolean;
  updatedAt: number;
}

export interface CachedResourceOptions<T> {
  key: string;
  freshMs: number;
  staleMs: number;
  load: (fetchImpl: typeof fetch) => Promise<T>;
  validate: (value: unknown) => value is T;
}

export interface CachedResource<T> {
  get(fetchImpl: typeof fetch, options?: { allowStale?: boolean }): Promise<CachedValue<T>>;
}

type Entry<T> = { data: T; updatedAt: number };

export function createCachedResource<T>(options: CachedResourceOptions<T>): CachedResource<T> {
  let memory: Entry<T> | null = null;
  let refreshPromise: Promise<Entry<T>> | undefined;

  function refreshOnce(fetchImpl: typeof fetch): Promise<Entry<T>> {
    refreshPromise ??= refresh(fetchImpl).finally(() => {
      refreshPromise = undefined;
    });
    return refreshPromise;
  }

  async function refresh(fetchImpl: typeof fetch): Promise<Entry<T>> {
    const data = await options.load(fetchImpl);
    const entry = { data, updatedAt: Date.now() };
    memory = entry;
    await writeCache(options.key, JSON.stringify(data), entry.updatedAt).catch(() => undefined);
    return entry;
  }

  async function readPersisted(): Promise<Entry<T> | null> {
    const row = await readCache(options.key);
    if (!row) return null;
    try {
      const data: unknown = JSON.parse(row.value);
      if (!options.validate(data)) return null;
      return { data, updatedAt: row.updatedAt };
    } catch {
      return null;
    }
  }

  return {
    async get(fetchImpl, getOptions = {}) {
      const now = Date.now();
      const memoryAge = memory ? now - memory.updatedAt : Number.POSITIVE_INFINITY;
      if (memory && memoryAge < options.freshMs) return value(memory, false);
      if (getOptions.allowStale && memory && memoryAge < options.staleMs) {
        void refreshOnce(fetchImpl).catch(() => undefined);
        return value(memory, true);
      }

      const persisted = await readPersisted().catch(() => null);
      const cached = newestEntry(memory, persisted);
      memory = cached;
      if (cached && now - cached.updatedAt < options.freshMs) return value(cached, false);

      const refreshing = refreshOnce(fetchImpl);
      if (getOptions.allowStale && cached && now - cached.updatedAt < options.staleMs) {
        void refreshing.catch(() => undefined);
        return value(cached, true);
      }

      try {
        return value(await refreshing, false);
      } catch (error) {
        if (cached && now - cached.updatedAt < options.staleMs) return value(cached, true);
        throw error;
      }
    },
  };
}

function value<T>(entry: Entry<T>, stale: boolean): CachedValue<T> {
  return { data: entry.data, stale, updatedAt: entry.updatedAt };
}

function newestEntry<T>(first: Entry<T> | null, second: Entry<T> | null): Entry<T> | null {
  if (!first) return second;
  if (!second) return first;
  return first.updatedAt >= second.updatedAt ? first : second;
}

let cacheDbPromise: Promise<Client> | undefined;

async function readCache(key: string): Promise<{ value: string; updatedAt: number } | null> {
  const db = await cacheDb();
  const result = await db.execute({
    sql: "SELECT value, updated_at FROM api_cache WHERE key = ?",
    args: [key],
  });
  const row = result.rows[0];
  if (!row || typeof row.value !== "string" || typeof row.updated_at !== "number") return null;
  return { value: row.value, updatedAt: row.updated_at };
}

async function writeCache(key: string, value: string, updatedAt: number) {
  const db = await cacheDb();
  await db.execute({
    sql: "INSERT OR REPLACE INTO api_cache (key, value, updated_at) VALUES (?, ?, ?)",
    args: [key, value, updatedAt],
  });
}

function cacheDb(): Promise<Client> {
  cacheDbPromise ??= initCacheDb().catch((error: unknown) => {
    cacheDbPromise = undefined;
    throw error;
  });
  return cacheDbPromise;
}

async function initCacheDb(): Promise<Client> {
  const db = await database();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS api_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `);
  return db;
}
