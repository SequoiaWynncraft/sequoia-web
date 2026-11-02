import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient, type Client } from "@libsql/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ client: null as Client | null }));
vi.mock("./db", () => ({
  database: async () => {
    if (!store.client) throw new Error("test database not opened");
    return store.client;
  },
}));

const PLAYER_A = "66efb975-31b4-499e-9b46-a34980edd8ee";
const PLAYER_B = "0a000000-0000-4000-8000-0000000000b2";

const dir = await mkdtemp(path.join(tmpdir(), "sequoia-players-"));
let client: Client;
let players: typeof import("./globalPlayer");

/** Disposable test file: synchronous=OFF only skips this fixture's fsyncs. */
beforeAll(async () => {
  client = createClient({ url: `file:${path.join(dir, "players.db")}`, timeout: 5000 });
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA synchronous = OFF");
  store.client = client;
});

beforeEach(async () => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-02T12:00:00Z") });
  players = await import("./globalPlayer");
  await client.execute("DELETE FROM api_cache").catch(() => undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(async () => {
  client.close();
  await rm(dir, { recursive: true, force: true });
});

type Names = Record<string, { status: number; uuid?: string }>;

/** Wynncraft as seen by the app: a name route and a UUID route. */
function wynncraft(names: Names) {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    const ident = decodeURIComponent(url.pathname.split("/").at(-1) ?? "");
    const named = names[ident.toLowerCase()];
    if (named) {
      if (named.status !== 200 || !named.uuid) return new Response("", { status: named.status });
      return Response.json({ username: ident, uuid: named.uuid });
    }
    if ([PLAYER_A, PLAYER_B].includes(ident)) return Response.json({ username: `owner-of-${ident}`, uuid: ident });
    return new Response("", { status: 404 });
  });
}

async function storedPlayerKeys(): Promise<string[]> {
  const result = await client.execute("SELECT key FROM api_cache WHERE key LIKE 'wynn-player%' ORDER BY key");
  return result.rows.map((row) => String(row.key));
}

describe("getAnyPlayerCard identity", () => {
  it("stores one durable copy per player however it is looked up", async () => {
    const fetchImpl = wynncraft({ gaz: { status: 200, uuid: PLAYER_A } });

    const byName = await players.getAnyPlayerCard(fetchImpl, "Gaz");
    const byUuid = await players.getAnyPlayerCard(fetchImpl, PLAYER_A.toUpperCase().replaceAll("-", ""));

    expect(byName?.uuid).toBe(PLAYER_A);
    expect(byUuid?.uuid).toBe(PLAYER_A);
    expect(await storedPlayerKeys()).toEqual([`wynn-player:${PLAYER_A}:v1`]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("fetches a new name once for concurrent first lookups", async () => {
    const fetchImpl = wynncraft({ gaz: { status: 200, uuid: PLAYER_A } });

    const cards = await Promise.all([1, 2, 3].map(() => players.getAnyPlayerCard(fetchImpl, "gaz")));

    expect(cards.map((card) => card?.uuid)).toEqual([PLAYER_A, PLAYER_A, PLAYER_A]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("re-resolves a remembered name once it is no longer fresh", async () => {
    const names: Names = { gaz: { status: 200, uuid: PLAYER_A } };
    const fetchImpl = wynncraft(names);
    await players.getAnyPlayerCard(fetchImpl, "Gaz");

    names.gaz = { status: 200, uuid: PLAYER_B };
    vi.setSystemTime(new Date("2026-11-02T12:03:00Z"));
    const reassigned = await players.getAnyPlayerCard(fetchImpl, "Gaz");

    expect(reassigned?.uuid).toBe(PLAYER_B);
    expect(await storedPlayerKeys()).toEqual([`wynn-player:${PLAYER_B}:v1`, `wynn-player:${PLAYER_A}:v1`].sort());
  });

  it("reports a name that has become ambiguous instead of the player it used to mean", async () => {
    const names: Names = { gaz: { status: 200, uuid: PLAYER_A } };
    const fetchImpl = wynncraft(names);
    await players.getAnyPlayerCard(fetchImpl, "Gaz");

    names.gaz = { status: 300 };
    vi.setSystemTime(new Date("2026-11-02T12:03:00Z"));

    await expect(players.getAnyPlayerCard(fetchImpl, "Gaz")).rejects.toBeInstanceOf(players.AmbiguousPlayerError);
  });

  it("keeps serving the last resolved player while Wynncraft is unavailable", async () => {
    const names: Names = { gaz: { status: 200, uuid: PLAYER_A } };
    const fetchImpl = wynncraft(names);
    await players.getAnyPlayerCard(fetchImpl, "Gaz");

    names.gaz = { status: 503 };
    vi.setSystemTime(new Date("2026-11-02T12:03:00Z"));
    const card = await players.getAnyPlayerCard(fetchImpl, "Gaz");

    expect(card?.uuid).toBe(PLAYER_A);
  });

  it("bounds durable storage when more players are looked up than it holds, keeping recent ones useful", { timeout: 60_000 }, async () => {
    const { CACHE_MAX_BYTES, CACHE_MAX_ROWS } = await import("./serverCache");
    const total = CACHE_MAX_ROWS + 20;
    const uuids = Array.from({ length: total }, (_, index) => `00000000-0000-4000-8000-${index.toString(16).padStart(12, "0")}`);
    const upstream = vi.fn<typeof fetch>(async (input) => {
      const uuid = new URL(String(input)).pathname.split("/").at(-1) ?? "";
      return Response.json({ username: `player-${uuid.slice(-4)}`, uuid, playtime: 12 });
    });
    const start = Date.now();
    for (const [index, uuid] of uuids.entries()) {
      // Distinct timestamps, so eviction order is the lookup order, not a tie.
      vi.setSystemTime(start + index);
      expect((await players.getAnyPlayerCard(upstream, uuid))?.uuid).toBe(uuid);
    }
    const stats = await client.execute(
      "SELECT COUNT(*) AS rows, SUM(bytes) AS bytes FROM api_cache WHERE key LIKE 'wynn-player:%'",
    );

    // A restart during a Wynncraft outage: memory is gone, only durable rows remain.
    vi.resetModules();
    const restarted = await import("./globalPlayer");
    const down = vi.fn<typeof fetch>(async () => new Response("", { status: 503 }));
    vi.setSystemTime(start + total + 5 * 60 * 1000);
    const recent = await restarted.getAnyPlayerCard(down, uuids[total - 1]);

    expect(Number(stats.rows[0].rows)).toBe(CACHE_MAX_ROWS);
    expect(Number(stats.rows[0].bytes)).toBeLessThanOrEqual(CACHE_MAX_BYTES);
    expect(recent).toMatchObject({ uuid: uuids[total - 1], stale: true, playtime: 12 });
    await expect(restarted.getAnyPlayerCard(down, uuids[0])).rejects.toThrow("503");
  });

  it("does not persist anything for a name that matches no player", async () => {
    const fetchImpl = wynncraft({});

    const card = await players.getAnyPlayerCard(fetchImpl, "NobodyHere");

    expect(card).toBeNull();
    expect(await storedPlayerKeys()).toEqual([]);
  });
});
