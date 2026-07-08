import { describe, expect, it } from "vitest";

import { createSequoiaApiClient } from "$lib/api/client";
import type { BranchmastersResponse, HomepageStatsResponse, SeasonRaidActivityResponse } from "$lib/api/client";

const homepageStatsBody: HomepageStatsResponse = {
  generated_at: "2026-07-08T12:00:00Z",
  members: 128,
  guild_level: 142,
  territories: 312,
  total_wars: 18_472,
  raids: 9_043,
  online_now: 7,
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

const branchmastersBody: BranchmastersResponse = {
  generated_at: "2026-07-08T12:00:00Z",
  members: [
    {
      username: "Branchmaster",
      rank: "chief",
      online: true,
      contributed: 1200,
      contribution_rank: 2,
      wars: 11,
      raids: 7,
      joined: "2024-01-01T00:00:00Z",
    },
  ],
};

describe("createSequoiaApiClient", () => {
  it("requests public homepage stats without query parameters", async () => {
    const requests: string[] = [];
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test/",
      fetch: async (input) => {
        requests.push(String(input));
        return jsonResponse(homepageStatsBody);
      },
    });

    const result = await client.getHomepageStats();

    expect(result).toEqual({ ok: true, data: homepageStatsBody });
    expect(requests).toEqual(["https://api.example.test/public/homepage/stats"]);
  });

  it("rejects malformed homepage stats success payloads", async () => {
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test",
      fetch: async () => jsonResponse({ generated_at: "2026-07-08T12:00:00Z", members: "128" }),
    });

    const result = await client.getHomepageStats();

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_response", message: "Unexpected homepage stats response." },
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

  it("requests public branchmasters without query parameters", async () => {
    const requests: string[] = [];
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test/",
      fetch: async (input) => {
        requests.push(String(input));
        return jsonResponse(branchmastersBody);
      },
    });

    const result = await client.getBranchmasters();

    expect(result).toEqual({ ok: true, data: branchmastersBody });
    expect(requests).toEqual(["https://api.example.test/public/guild/branchmasters"]);
  });

  it("rejects malformed branchmasters payloads", async () => {
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test",
      fetch: async () => jsonResponse({ generated_at: "2026-07-08T12:00:00Z", members: [{}] }),
    });

    const result = await client.getBranchmasters();

    expect(result).toEqual({
      ok: false,
      error: { code: "invalid_response", message: "Unexpected branchmasters response." },
    });
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
