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
  put(data: T): Promise<CachedValue<T>>;
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
    return store(await options.load(fetchImpl));
  }

  async function store(data: T): Promise<Entry<T>> {
    const entry = { data, updatedAt: Date.now() };
    memory = entry;
    await writeCache(options.key, JSON.stringify(data), entry.updatedAt).catch((error: unknown) => {
      console.warn(`api_cache write failed for ${options.key}:`, error);
    });
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
    async put(data) {
      return value(await store(data), false);
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

export const CACHE_MAX_ROWS = 2048;
export const CACHE_MAX_BYTES = 64 * 1024 * 1024;
export const CACHE_MAX_VALUE_BYTES = 1024 * 1024;

const EVICT_BEYOND_BUDGET = `
  DELETE FROM api_cache WHERE key IN (
    SELECT key FROM (
      SELECT key,
        SUM(bytes) OVER newest AS kept_bytes,
        ROW_NUMBER() OVER newest AS kept_rows
      FROM api_cache
      WINDOW newest AS (ORDER BY updated_at DESC, key ROWS UNBOUNDED PRECEDING)
    )
    WHERE kept_bytes > ? OR kept_rows > ?
  )`;

async function writeCache(key: string, value: string, updatedAt: number) {
  const db = await cacheDb();
  const bytes = Buffer.byteLength(value);
  if (bytes > CACHE_MAX_VALUE_BYTES) {
    console.warn(`api_cache skipped ${key}: ${bytes} bytes exceeds the ${CACHE_MAX_VALUE_BYTES}-byte limit`);
    await db.execute({ sql: "DELETE FROM api_cache WHERE key = ?", args: [key] });
    return;
  }
  await db.batch(
    [
      {
        sql: "INSERT OR REPLACE INTO api_cache (key, value, updated_at, bytes) VALUES (?, ?, ?, ?)",
        args: [key, value, updatedAt, bytes],
      },
      { sql: EVICT_BEYOND_BUDGET, args: [CACHE_MAX_BYTES, CACHE_MAX_ROWS] },
    ],
    "write",
  );
}

function cacheDb(): Promise<Client> {
  cacheDbPromise ??= initCacheDb().catch((error: unknown) => {
    cacheDbPromise = undefined;
    throw error;
  });
  return cacheDbPromise;
}

const SWEEP_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const SWEEP_INTERVAL_MS = 24 * 60 * 60 * 1000;

async function initCacheDb(): Promise<Client> {
  const db = await database();
  await db.execute(`
    CREATE TABLE IF NOT EXISTS api_cache (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at INTEGER NOT NULL,
      bytes INTEGER NOT NULL DEFAULT 0
    )
  `);
  await addByteAccounting(db);
  await db.execute("CREATE INDEX IF NOT EXISTS api_cache_newest ON api_cache (updated_at DESC, key, bytes)");
  await db.execute({ sql: "DELETE FROM api_cache WHERE bytes > ?", args: [CACHE_MAX_VALUE_BYTES] });
  await db.execute({ sql: EVICT_BEYOND_BUDGET, args: [CACHE_MAX_BYTES, CACHE_MAX_ROWS] });
  const sweep = () =>
    db
      .execute({
        sql: "DELETE FROM api_cache WHERE updated_at < ?",
        args: [Date.now() - SWEEP_MAX_AGE_MS],
      })
      .catch((error: unknown) => {
        console.warn("api_cache sweep failed:", error);
      });
  void sweep();
  const timer = setInterval(sweep, SWEEP_INTERVAL_MS);
  if (typeof timer === "object" && "unref" in timer) timer.unref();
  return db;
}

async function addByteAccounting(db: Client): Promise<void> {
  const columns = await db.execute("SELECT name FROM pragma_table_info('api_cache')");
  if (columns.rows.some((row) => row.name === "bytes")) return;
  await db.batch(
    [
      "ALTER TABLE api_cache ADD COLUMN bytes INTEGER NOT NULL DEFAULT 0",
      "UPDATE api_cache SET bytes = length(CAST(value AS BLOB))",
    ],
    "write",
  );
}
