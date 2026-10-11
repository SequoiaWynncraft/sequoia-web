import { describe, expect, it, vi } from "vitest";
import { load } from "./+page.server";
import { sampleProgress } from "$lib/achievements/progress.fixture";

vi.mock("$env/dynamic/private", () => ({ env: { SEQUOIA_DISCORD_MANAGEMENT_URL: "http://sierra:8082" } }));

describe("member achievements page", () => {
  it("asks for sign-in without calling Sierra when there is no session", async () => {
    const fetchImpl = vi.fn();
    expect(await load({ fetch: fetchImpl, cookies: { get: () => undefined } } as never)).toEqual({ access: "signin", progress: null });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it("maps Sierra refusals and failures to page states", async () => {
    for (const [status, access] of [[401, "signin"], [403, "denied"], [500, "unavailable"], [503, "unavailable"]] as const) {
      const fetchImpl = vi.fn().mockResolvedValue(Response.json({ error: "no" }, { status }));
      expect(await load({ fetch: fetchImpl, cookies: { get: () => "fictional-session" } } as never)).toEqual({ access, progress: null });
      expect(fetchImpl).toHaveBeenCalledWith("http://sierra:8082/v1/achievements/me", expect.objectContaining({
        headers: { authorization: "Bearer fictional-session", "content-type": "application/json" },
      }));
    }
  });
  it("treats an unreadable body as unavailable", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json({ player: null }));
    expect(await load({ fetch: fetchImpl, cookies: { get: () => "fictional-session" } } as never)).toEqual({ access: "unavailable", progress: null });
  });
  it("returns the parsed progress for a linked member", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(sampleProgress));
    const result = await load({ fetch: fetchImpl, cookies: { get: () => "fictional-session" } } as never);
    expect(result).toMatchObject({ access: "granted", progress: { player: { username: "FictionalMember" }, eligible: true } });
    expect(result).toHaveProperty("progress.categories.length", 4);
  });
});
