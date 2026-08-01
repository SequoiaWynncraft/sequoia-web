import type { Client } from "@libsql/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SEQUOIA_API_BASE_URL, SEQUOIA_GUILD_UUID } from "$lib/config/public";

const H = vi.hoisted(() => ({ db: null as Client | null }));

// The cached resource persists through the shared libsql client; a fresh
// in-memory one per test keeps these off the developer's .data database file and
// stops one test's cached copy from answering the next test's request.
vi.mock("$lib/server/db", () => ({
  database: async () => {
    const { createClient } = await import("@libsql/client");
    H.db ??= createClient({ url: ":memory:" });
    return H.db;
  },
}));

const RESPONSE = {
  guild_uuid: SEQUOIA_GUILD_UUID,
  name: "Sequoia",
  prefix: "SEQ",
  current_level: 245,
  level_observed_at: "2026-07-30T11:08:51.822744Z",
  entries: [{ level: 245, observed_at: "2026-07-29T15:59:15.913142Z", baseline: true }],
};

/**
 * A fresh module instance, so the resource starts with an empty in-memory cache.
 * The module builds its cached resource once at import time, which would
 * otherwise leak a warm entry from test to test.
 */
async function freshFetcher() {
  vi.resetModules();
  return (await import("$lib/server/guildLevelHistory")).getGuildLevelHistory;
}

/** A stub fetch answering with one canned response, recording its calls. */
function stubFetch(body: string, status = 200) {
  return vi.fn(async () =>
    new Response(body, { status, headers: { "content-type": "application/json" } }),
  ) as unknown as typeof fetch & { mock: { calls: unknown[][] } };
}

beforeEach(() => {
  H.db = null;
  vi.restoreAllMocks();
});

describe("getGuildLevelHistory", () => {
  it("reads the history from the public route for the configured guild", async () => {
    const getGuildLevelHistory = await freshFetcher();
    const fetchImpl = stubFetch(JSON.stringify(RESPONSE));

    expect(await getGuildLevelHistory(fetchImpl)).toEqual(RESPONSE);

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `${SEQUOIA_API_BASE_URL}/public/global/guilds/${SEQUOIA_GUILD_UUID}/level-history`,
    );
    // The route is unauthenticated - no bearer token, no mod-version gate.
    expect(init.headers).toBeUndefined();
  });

  it("serves the cached copy rather than refetching within the fresh window", async () => {
    const getGuildLevelHistory = await freshFetcher();
    const fetchImpl = stubFetch(JSON.stringify(RESPONSE));

    await getGuildLevelHistory(fetchImpl);
    await getGuildLevelHistory(fetchImpl);

    expect(fetchImpl.mock.calls).toHaveLength(1);
  });

  it("reports an unknown history rather than throwing when the guild is not found", async () => {
    const getGuildLevelHistory = await freshFetcher();

    expect(await getGuildLevelHistory(stubFetch("", 404))).toBeNull();
  });

  it("reports an unknown history when the response is not JSON", async () => {
    const getGuildLevelHistory = await freshFetcher();

    expect(await getGuildLevelHistory(stubFetch("<html>502</html>"))).toBeNull();
  });

  it("reports an unknown history when the payload is not the expected shape", async () => {
    const getGuildLevelHistory = await freshFetcher();

    expect(await getGuildLevelHistory(stubFetch(JSON.stringify({ entries: "245" })))).toBeNull();
  });

  it("reports an unknown history when the request fails outright", async () => {
    const getGuildLevelHistory = await freshFetcher();
    const failing = vi.fn(async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;

    expect(await getGuildLevelHistory(failing)).toBeNull();
  });
});
