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
  it("passes the server's night state and full catalog through unchanged", async () => {
    const catalog = ["quiet", "gnome_party", "duck_parade", "squirrel_chase", "owl_visit", "bunny_hop"].map((id) => ({ id, label: id, description: "", normal_ready: true, winter_ready: true }));
    const welcome = {
      settings: { guild_id: "1030187086722109570", night: { enabled: true, start: "21:00", end: "07:00", timezone: "Europe/Stockholm", moon: false } },
      catalog,
      effective_night: { active: true, scheduled: true, local_time: "23:00", timezone: "Europe/Stockholm", ready: true, timezones: ["UTC", "Europe/Stockholm"] },
    };
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(Response.json(welcome))
      .mockResolvedValueOnce(Response.json({ channels: [] }));
    const result = await load({ fetch: fetchImpl, cookies: { get: () => "real-cookie-source" } } as never);
    expect(result).toEqual({ access: "granted", welcome, channels: [] });
    expect(fetchImpl).toHaveBeenLastCalledWith("http://sierra:8082/v1/context?guild_id=1030187086722109570", expect.anything());
  });
  it("passes an older response without night fields through unchanged, rather than inventing them", async () => {
    const welcome = { settings: { guild_id: "1030187086722109570" }, catalog: [] };
    const fetchImpl = vi.fn().mockResolvedValueOnce(Response.json(welcome)).mockResolvedValueOnce(Response.json({ channels: [] }));
    const result = await load({ fetch: fetchImpl, cookies: { get: () => "real-cookie-source" } } as never);
    expect(result).toEqual({ access: "granted", welcome, channels: [] });
  });
});
