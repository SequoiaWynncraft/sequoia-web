import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({ client: null as Client | null }));
vi.mock("./db", () => ({
  database: async () => {
    if (!store.client) throw new Error("test database not opened");
    return store.client;
  },
}));

import { getPlayerSeries } from "./playerSeries";

const PLAYER = "66efb975-31b4-499e-9b46-a34980edd8ee";
const dir = await mkdtemp(path.join(tmpdir(), "sequoia-series-"));
let client: Client;

/** Disposable test file: synchronous=OFF only skips this fixture's fsyncs. */
beforeAll(async () => {
  client = createClient({ url: `file:${path.join(dir, "series.db")}`, timeout: 5000 });
  await client.execute("PRAGMA journal_mode = WAL");
  await client.execute("PRAGMA synchronous = OFF");
  store.client = client;
});

afterAll(async () => {
  client.close();
  await rm(dir, { recursive: true, force: true });
});

function backend() {
  return vi.fn<typeof fetch>(async (input) => {
    const url = new URL(String(input));
    return Response.json({
      generated_at: "2026-11-02T00:00:00Z",
      player_uuid: url.searchParams.get("player"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to"),
      data_since: { activity: "2025-01-01", raids: "2025-01-01", war_points: "2025-01-01" },
      days: [],
    });
  });
}

describe("player series cache", () => {
  it("keeps one durable row per player as the window moves from day to day", async () => {
    const fetchImpl = backend();

    await getPlayerSeries(fetchImpl, PLAYER, "2025-09-28", "2026-11-01");
    const today = await getPlayerSeries(fetchImpl, PLAYER.toUpperCase(), "2025-09-29", "2026-11-02");

    const rows = await client.execute("SELECT key, value FROM api_cache WHERE key LIKE 'player-series:%'");
    expect(today).toMatchObject({ from: "2025-09-29", to: "2026-11-02" });
    expect(rows.rows.map((row) => row.key)).toEqual([`player-series:${PLAYER}:v2`]);
    expect(JSON.parse(String(rows.rows[0].value))).toMatchObject({ to: "2026-11-02" });
  });
});
