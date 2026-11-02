import { describe, expect, it, vi } from "vitest";
import { load } from "./+page.server";

vi.mock("$app/env/private", () => ({ SEQUOIA_DISCORD_MANAGEMENT_URL: "http://sierra:8082" }));

describe("achievement ceremonies protected page", () => {
  it("does not ask Sierra without a session", async () => {
    const fetchImpl = vi.fn();
    const result = await load({ fetch: fetchImpl, cookies: { get: () => undefined } } as never);
    expect(result).toMatchObject({ access: "signin", ceremonies: null, channels: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("requires a fresh Rust decision rather than a cached granted console capability", async () => {
    for (const [status, access] of [[401, "signin"], [403, "denied"], [503, "unverified"]] as const) {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status }));
      const parent = vi.fn().mockResolvedValue({ capabilities: { discord: "granted" } });
      const result = await load({ fetch: fetchImpl, cookies: { get: () => "fictional-session" }, parent } as never);
      expect(result).toMatchObject({ access, ceremonies: null, channels: [] });
      expect(parent).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(fetchImpl).toHaveBeenCalledWith("http://sierra:8082/v1/ceremonies", expect.objectContaining({
        headers: { authorization: "Bearer fictional-session", "content-type": "application/json" },
      }));
    }
  });
  it("passes the server's settings, catalog and scene through unchanged with channel choices", async () => {
    // Fictional guild, channel and story ids.
    const ceremonies = {
      settings: { version: 4, guild_id: "1111111111111111111", enabled: false, channel_id: "2222222222222222222", stories: [{ id: "sample_story", enabled: true, weight: 10 }] },
      catalog: [{ id: "sample_story", label: "Sample story", description: "", layout: "banner", ready: true }],
      ready: true,
      effective_chances: [{ id: "sample_story", percent: 100 }],
      effective_scene: { season: "winter", ambiance: "night" },
      viewer: { display_name: "FictionalMember" },
    };
    const channels = [{ id: "2222222222222222222", name: "achievements" }];
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(ceremonies)).mockResolvedValueOnce(Response.json({ channels }));
    const result = await load({ fetch: fetchImpl, cookies: { get: () => "fictional-session" } } as never);
    expect(result).toEqual({ access: "granted", ceremonies, channels });
    expect(fetchImpl).toHaveBeenLastCalledWith("http://sierra:8082/v1/context?guild_id=1111111111111111111", expect.anything());
  });
  it("keeps the page usable without channel context", async () => {
    const ceremonies = { settings: { guild_id: "1111111111111111111" } };
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(ceremonies)).mockResolvedValueOnce(new Response(null, { status: 503 }));
    const result = await load({ fetch: fetchImpl, cookies: { get: () => "fictional-session" } } as never);
    expect(result).toEqual({ access: "granted", ceremonies, channels: [] });
  });
});
