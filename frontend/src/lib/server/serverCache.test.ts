import { type Client } from "@libsql/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import { disposableDatabase } from "./disposableDatabase.fixture";

const store = vi.hoisted(() => ({ client: null as Client | null }));
vi.mock("./db", () => ({
  database: async () => {
    if (!store.client) throw new Error("test database not opened");
    return store.client;
  },
}));

type CacheModule = typeof import("./serverCache");

const db = await disposableDatabase();

/** A fresh cache module whose memoised database is bound to `client`. */
async function cacheBoundTo(client: Client): Promise<CacheModule> {
  vi.resetModules();
  store.client = client;
  const module = await import("./serverCache");
  await module.createCachedResource({ key: "init", freshMs: 1, staleMs: 1, load: unused, validate: isString }).put("x");
  return module;
}

const isString = (value: unknown): value is string => typeof value === "string";
const unused = async (): Promise<string> => {
  throw new Error("load should not run");
};

let file: string;
let reader: Client;
let cache: CacheModule;
let warn: ReturnType<typeof vi.spyOn>;

async function tableStats(): Promise<{ rows: number; bytes: number }> {
  const result = await reader.execute("SELECT COUNT(*) AS rows, COALESCE(SUM(bytes), 0) AS bytes FROM api_cache");
  return { rows: Number(result.rows[0].rows), bytes: Number(result.rows[0].bytes) };
}

async function hasKey(key: string): Promise<boolean> {
  const result = await reader.execute({ sql: "SELECT 1 FROM api_cache WHERE key = ?", args: [key] });
  return result.rows.length > 0;
}

function resource(key: string, load: (fetchImpl: typeof fetch) => Promise<string> = unused) {
  return cache.createCachedResource({ key, freshMs: 60_000, staleMs: 3_600_000, load, validate: isString });
}

beforeAll(async () => {
  cache = await cacheBoundTo(await db.connect("cache.db"));
  reader = await db.connect("cache.db");
});

beforeEach(async () => {
  await reader.execute("DELETE FROM api_cache");
  warn = vi.spyOn(console, "warn");
});

afterEach(() => {
  // Every cache write must have landed: a failed write would make a bound vacuous.
  expect(warn.mock.calls.filter(([message]: unknown[]) => String(message).startsWith("api_cache write failed"))).toEqual([]);
  warn.mockRestore();
});

afterAll(() => db.dispose());

describe("persisted cache budget", () => {
  it("keeps only the newest rows when more entries are written than the row budget", { timeout: 60_000 }, async () => {
    const total = cache.CACHE_MAX_ROWS + 25;
    for (let index = 0; index < total; index += 1) {
      await resource(`player:${index}`).put(`profile ${index}`);
    }

    expect(await tableStats()).toMatchObject({ rows: cache.CACHE_MAX_ROWS });
    expect(await hasKey(`player:${total - 1}`)).toBe(true);
    expect(await hasKey("player:0")).toBe(false);
  });

  it("evicts by size so the stored bytes never exceed the byte budget", { timeout: 60_000 }, async () => {
    const value = "x".repeat(Math.floor(cache.CACHE_MAX_VALUE_BYTES * 0.9));
    const count = Math.ceil(cache.CACHE_MAX_BYTES / value.length) + 5;
    for (let index = 0; index < count; index += 1) {
      await resource(`guild:${index}`).put(value);
    }

    const { bytes } = await tableStats();
    expect(bytes).toBeLessThanOrEqual(cache.CACHE_MAX_BYTES);
    expect(bytes).toBeGreaterThan(cache.CACHE_MAX_BYTES - 2 * value.length);
    expect(await hasKey(`guild:${count - 1}`)).toBe(true);
  });

  it("serves an oversized payload from memory without persisting it or an older copy", async () => {
    const oversized = resource("rankings:big");
    await oversized.put("small enough");
    warn.mockImplementation(() => undefined);

    const result = await oversized.put("y".repeat(cache.CACHE_MAX_VALUE_BYTES + 1));

    expect(result.data).toHaveLength(cache.CACHE_MAX_VALUE_BYTES + 1);
    expect(await hasKey("rankings:big")).toBe(false);
    expect((await oversized.get(fetch)).data).toHaveLength(cache.CACHE_MAX_VALUE_BYTES + 1);
  });

  it("stays inside both budgets with two connections writing one file concurrently", { timeout: 60_000 }, async () => {
    const other = await cacheBoundTo(await db.connect("cache.db"));
    const perWriter = Math.ceil(cache.CACHE_MAX_ROWS / 2) + 50;
    const put = (module: CacheModule, key: string) =>
      module.createCachedResource({ key, freshMs: 1, staleMs: 1, load: unused, validate: isString }).put(key);

    await Promise.all(
      Array.from({ length: perWriter }, (_, index) => [put(cache, `a:${index}`), put(other, `b:${index}`)]).flat(),
    );

    const { rows, bytes } = await tableStats();
    const writers = await reader.execute(
      "SELECT substr(key, 1, 1) AS writer, COUNT(*) AS rows FROM api_cache WHERE key LIKE 'a:%' OR key LIKE 'b:%' GROUP BY writer ORDER BY writer",
    );
    expect(rows).toBe(cache.CACHE_MAX_ROWS);
    expect(bytes).toBeLessThanOrEqual(cache.CACHE_MAX_BYTES);
    expect(writers.rows.map((row) => row.writer)).toEqual(["a", "b"]);
    expect(await hasKey(`a:${perWriter - 1}`)).toBe(true);
    expect(await hasKey(`b:${perWriter - 1}`)).toBe(true);
  });
});

describe("cached resource reads", () => {
  it("loads once for concurrent cold reads", async () => {
    const load = vi.fn(async () => "roster");
    const roster = resource("roster", load);

    const values = await Promise.all([roster.get(fetch), roster.get(fetch), roster.get(fetch)]);

    expect(values.map((value) => value.data)).toEqual(["roster", "roster", "roster"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("falls back to a persisted copy when a refresh fails", async () => {
    await reader.execute({
      sql: "INSERT INTO api_cache (key, value, updated_at, bytes) VALUES (?, ?, ?, ?)",
      args: ["profile:stale", JSON.stringify("last good"), Date.now() - 120_000, 11],
    });
    const profile = resource("profile:stale", async () => {
      throw new Error("Wynncraft is down");
    });

    const result = await profile.get(fetch);

    expect(result).toMatchObject({ data: "last good", stale: true });
  });
});

describe("legacy table upgrade", () => {
  it("adds byte accounting in place, drops oversized rows, trims to budget and keeps stale fallbacks", { timeout: 60_000 }, async () => {
    const legacy = await db.connect("legacy.db");
    await legacy.execute("CREATE TABLE api_cache (key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at INTEGER NOT NULL)");
    const now = Date.now();
    const total = cache.CACHE_MAX_ROWS + 10;
    await legacy.batch(
      [
        ...Array.from({ length: total }, (_, index) => ({
          sql: "INSERT INTO api_cache (key, value, updated_at) VALUES (?, ?, ?)",
          args: [`old:${index}`, JSON.stringify(`value ${index}`), now - 120_000 - (total - index)],
        })),
        {
          sql: "INSERT INTO api_cache (key, value, updated_at) VALUES (?, ?, ?)",
          args: ["old:oversized", JSON.stringify("z".repeat(cache.CACHE_MAX_VALUE_BYTES)), now - 60_000],
        },
      ],
      "write",
    );
    const upgraded = await cacheBoundTo(legacy);

    const newest = upgraded.createCachedResource({
      key: `old:${total - 1}`,
      freshMs: 60_000,
      staleMs: 3_600_000,
      load: async () => {
        throw new Error("upstream down");
      },
      validate: isString,
    });
    const result = await newest.get(fetch);

    const stats = await legacy.execute(
      "SELECT COUNT(*) AS rows, MIN(bytes) AS smallest, MAX(bytes) AS largest, SUM(key = 'old:oversized') AS oversized FROM api_cache",
    );
    expect(result).toMatchObject({ data: `value ${total - 1}`, stale: true });
    expect(Number(stats.rows[0].rows)).toBe(upgraded.CACHE_MAX_ROWS);
    expect(Number(stats.rows[0].smallest)).toBeGreaterThan(0);
    expect(Number(stats.rows[0].largest)).toBeLessThanOrEqual(upgraded.CACHE_MAX_VALUE_BYTES);
    expect(Number(stats.rows[0].oversized)).toBe(0);
  });
});
