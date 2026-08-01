import { describe, expect, it } from "vitest";

import { createSequoiaApiClient } from "$lib/api/client";
import type { SeasonRaidActivityResponse } from "$lib/api/client";
import type { GuildOverviewResponse } from "$lib/api/guildOverview";

const guildOverviewBody: GuildOverviewResponse = {
  generated_at: "2026-07-08T12:00:00Z",
  stale: false,
  stats: {
    members: 149,
    guild_level: 240,
    territories: 60,
    total_wars: 149_330,
    raids: 142_884,
    online_now: 19,
  },
  branchmasters: [
    {
      username: "Branchmaster",
      rank: "branchmaster",
      rank_label: "Branchmaster",
      rank_color: "#DBD1C7",
      online: true,
      contributed: 1200,
      contribution_rank: 2,
      wars: 11,
      raids: 7,
      joined: "2024-01-01T00:00:00Z",
    },
  ],
};

const seasonRaidActivityBody: SeasonRaidActivityResponse = {
  generated_at: "2026-06-26T12:00:00Z",
  averages: [{ raid_name: "Nest of the Grootslangs", average_sr: 14.2 }],
  entries: [
    {
      guild_name: "Sequoia",
      days: [
        {
          day: "2026-06-25",
          raid_counts: [{ raid_name: "Nest of the Grootslangs", count: 7 }],
        },
      ],
    },
  ],
};

describe("createSequoiaApiClient", () => {
  it("requests the linked rank-profile snapshot by default", async () => {
    const requests: string[] = [];
    const body = {
      schema_version: 1,
      revision: "test-revision",
      generated_at: "2026-07-10T12:00:00Z",
      source: { stale: false, guilds: [] },
      catalog: { roles: [], awards: [], assets: [] },
      profiles: [],
    };
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test/",
      fetch: async (input) => {
        requests.push(String(input));
        return jsonResponse(body);
      },
    });

    const result = await client.getRankProfiles();

    expect(result).toEqual({ ok: true, data: body });
    expect(requests).toEqual([
      "https://api.example.test/v1/rank-profiles?scope=linked",
    ]);
  });

  it("requests the web-owned guild overview without using the backend base URL", async () => {
    const requests: string[] = [];
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test/",
      fetch: async (input) => {
        requests.push(String(input));
        return jsonResponse(guildOverviewBody);
      },
    });

    const result = await client.getGuildOverview();

    expect(result).toEqual({ ok: true, data: guildOverviewBody });
    expect(requests).toEqual(["/api/guild-overview"]);
  });

  it("rejects malformed guild overview payloads", async () => {
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test",
      fetch: async () => jsonResponse({ generated_at: "2026-07-08T12:00:00Z", stats: {} }),
    });

    const result = await client.getGuildOverview();

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_response", message: "Unexpected guild overview response." },
    });
  });

  it("requests public season raid activity with typed query parameters", async () => {
    const requests: string[] = [];
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test/",
      fetch: async (input) => {
        requests.push(String(input));
        return jsonResponse(seasonRaidActivityBody);
      },
    });

    const result = await client.getSeasonRaidActivity({
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-26T00:00:00Z",
      guild_names: "Sequoia",
    });

    expect(result).toEqual({ ok: true, data: seasonRaidActivityBody });
    expect(requests).toEqual([
      "https://api.example.test/public/season/raid-activity?from=2026-06-01T00%3A00%3A00Z&to=2026-06-26T00%3A00%3A00Z&guild_names=Sequoia",
    ]);
  });

  it("supports same-origin API routing through the injected fetch", async () => {
    const requests: string[] = [];
    const client = createSequoiaApiClient({
      baseUrl: "",
      fetch: async (input) => {
        requests.push(String(input));
        return jsonResponse(seasonRaidActivityBody);
      },
    });

    await client.getSeasonRaidActivity({
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-26T00:00:00Z",
      guild_names: "Sequoia",
    });

    expect(requests[0]?.startsWith("/public/season/raid-activity?")).toBe(true);
  });

  it("returns backend validation errors without throwing", async () => {
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test",
      fetch: async () => jsonResponse({ error: "from must be before to" }, 400),
    });

    const result = await client.getSeasonRaidActivity({
      from: "2026-06-26T00:00:00Z",
      to: "2026-06-01T00:00:00Z",
      guild_names: "Sequoia",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "http_error", message: "from must be before to", status: 400 },
    });
  });

  it("rejects malformed success payloads", async () => {
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test",
      fetch: async () => jsonResponse({ entries: [] }),
    });

    const result = await client.getSeasonRaidActivity({
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-26T00:00:00Z",
      guild_names: "Sequoia",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_response", message: "Unexpected season raid activity response." },
    });
  });

  it("rejects malformed nested success payloads", async () => {
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test",
      fetch: async () => jsonResponse({ generated_at: "2026-06-26T12:00:00Z", averages: [{}], entries: [{}] }),
    });

    const result = await client.getSeasonRaidActivity({
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-26T00:00:00Z",
      guild_names: "Sequoia",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_response", message: "Unexpected season raid activity response." },
    });
  });

  it("returns network errors without throwing", async () => {
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test",
      fetch: async () => {
        throw new Error("connection refused");
      },
    });

    const result = await client.getSeasonRaidActivity({
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-26T00:00:00Z",
      guild_names: "Sequoia",
    });

    expect(result).toEqual({
      ok: false,
      error: { code: "network_error", message: "connection refused" },
    });
  });
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}
