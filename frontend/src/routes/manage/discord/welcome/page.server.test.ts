import { describe, expect, it, vi } from "vitest";
import { load } from "./+page.server";

vi.mock("$env/dynamic/private", () => ({ env: { SEQUOIA_DISCORD_MANAGEMENT_URL: "http://sierra:8082" } }));

describe("welcome protected page", () => {
  it("does not ask Sierra without a session", async () => {
    const fetchImpl = vi.fn();
    const result = await load({ fetch: fetchImpl, cookies: { get: () => undefined } } as never);
    expect(result).toMatchObject({ access: "signin", welcome: null, channels: [] });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("requires a fresh Rust decision rather than a cached granted console capability", async () => {
    for (const [status, access] of [[401, "signin"], [403, "denied"], [503, "unverified"]] as const) {
      const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status }));
      const parent = vi.fn().mockResolvedValue({ capabilities: { discord: "granted" } });
      const result = await load({ fetch: fetchImpl, cookies: { get: () => "real-cookie-source" }, parent } as never);
      expect(result).toMatchObject({ access, welcome: null });
      expect(parent).not.toHaveBeenCalled();
      expect(fetchImpl).toHaveBeenCalledOnce();
      expect(fetchImpl).toHaveBeenCalledWith("http://sierra:8082/v1/welcome", expect.objectContaining({
        headers: { authorization: "Bearer real-cookie-source", "content-type": "application/json" },
      }));
    }
  });
});
