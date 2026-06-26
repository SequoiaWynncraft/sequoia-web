import { describe, expect, it } from "vitest";

import { createSequoiaApiClient } from "$lib/api/client";
import type { SeasonRaidActivityResponse } from "$lib/api/client";

const responseBody: SeasonRaidActivityResponse = {
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
  it("requests public season raid activity with typed query parameters", async () => {
    const requests: string[] = [];
    const client = createSequoiaApiClient({
      baseUrl: "https://api.example.test/",
      fetch: async (input) => {
        requests.push(String(input));
        return jsonResponse(responseBody);
      },
    });

    const result = await client.getSeasonRaidActivity({
      from: "2026-06-01T00:00:00Z",
      to: "2026-06-26T00:00:00Z",
      guild_names: "Sequoia",
    });

    expect(result).toEqual({ ok: true, data: responseBody });
    expect(requests).toEqual([
      "https://api.example.test/public/season/raid-activity?from=2026-06-01T00%3A00%3A00Z&to=2026-06-26T00%3A00%3A00Z&guild_names=Sequoia",
    ]);
  });

  it("supports same-origin API routing", async () => {
    const requests: string[] = [];
    const client = createSequoiaApiClient({
      baseUrl: "",
      fetch: async (input) => {
        requests.push(String(input));
        return jsonResponse(responseBody);
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
