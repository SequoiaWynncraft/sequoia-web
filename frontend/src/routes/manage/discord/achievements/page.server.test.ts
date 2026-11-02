import { describe, expect, it, vi } from "vitest";
import { load } from "./+page.server";
import { catalogFixture } from "#lib/achievements/catalog.fixture.js";

vi.mock("$app/env/private", () => ({ SEQUOIA_DISCORD_MANAGEMENT_URL: "http://sierra:8082" }));

describe("achievement catalog protected page", () => {
  it("does not ask Sierra without a session", async () => {
    const fetchImpl = vi.fn();
    const result = await load({ fetch: fetchImpl, cookies: { get: () => undefined } } as never);
    expect(result).toEqual({ access: "signin", catalog: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("requires a fresh Rust decision rather than a cached granted console capability", async () => {
    for (const [status, access] of [[401, "signin"], [403, "denied"], [503, "unverified"]] as const) {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status }));
      const parent = vi.fn().mockResolvedValue({ capabilities: { discord: "granted" } });
      const result = await load({ fetch: fetchImpl, cookies: { get: () => "fictional-session" }, parent } as never);
      expect(result).toEqual({ access, catalog: null });
      expect(parent).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledWith("http://sierra:8082/v1/achievements/catalog", expect.objectContaining({
        headers: { authorization: "Bearer fictional-session", "content-type": "application/json" },
      }));
    }
  });
  it("passes a valid catalog view through and treats an unreadable one as unverified", async () => {
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(catalogFixture));
    expect(await load({ fetch: fetchImpl, cookies: { get: () => "fictional-session" } } as never)).toEqual({ access: "granted", catalog: catalogFixture });
    fetchImpl.mockResolvedValueOnce(Response.json({ catalog: { version: 1 } }));
    expect(await load({ fetch: fetchImpl, cookies: { get: () => "fictional-session" } } as never)).toEqual({ access: "unverified", catalog: null });
  });
});
