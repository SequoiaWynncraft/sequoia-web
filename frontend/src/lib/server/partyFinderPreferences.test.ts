import { describe, expect, it, vi } from "vitest";

import {
  getPartyFinderDmLevel,
  parsePartyFinderDmLevel,
  setPartyFinderDmLevel,
} from "#lib/server/partyFinderPreferences.js";

describe("partyFinderPreferences", () => {
  it("accepts only supported levels", () => {
    expect(parsePartyFinderDmLevel("important_only")).toBe("important_only");
    expect(parsePartyFinderDmLevel("all")).toBe("all");
    expect(parsePartyFinderDmLevel("everything")).toBeNull();
  });

  it("loads a validated preference", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ dm_level: "none" }))) as typeof fetch;

    await expect(getPartyFinderDmLevel("session", fetchImpl)).resolves.toEqual({ status: "ok", level: "none" });
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/auth/web/preferences/party-finder"),
      expect.objectContaining({ headers: { authorization: "Bearer session" } }),
    );
  });

  it("does not accept malformed backend data", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ dm_level: "loud" }))) as typeof fetch;

    await expect(getPartyFinderDmLevel("session", fetchImpl)).resolves.toEqual({ status: "unavailable" });
  });

  it("distinguishes an unauthorized preference read", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 })) as typeof fetch;

    await expect(getPartyFinderDmLevel("session", fetchImpl)).resolves.toEqual({ status: "unauthorized" });
  });

  it("treats failed preference reads as unavailable", async () => {
    const serverError = vi.fn(async () => new Response(null, { status: 503 })) as typeof fetch;
    const networkError = vi.fn(async () => {
      throw new Error("network error");
    }) as typeof fetch;

    await expect(getPartyFinderDmLevel("session", serverError)).resolves.toEqual({ status: "unavailable" });
    await expect(getPartyFinderDmLevel("session", networkError)).resolves.toEqual({ status: "unavailable" });
  });

  it("sends the selected level as JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as typeof fetch;

    await expect(setPartyFinderDmLevel("session", "all", fetchImpl)).resolves.toBe("saved");
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/auth/web/preferences/party-finder"),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ dm_level: "all" }) }),
    );
  });

  it("distinguishes an unauthorized preference save", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 })) as typeof fetch;

    await expect(setPartyFinderDmLevel("session", "all", fetchImpl)).resolves.toBe("unauthorized");
  });

  it("treats failed preference saves as unavailable", async () => {
    const serverError = vi.fn(async () => new Response(null, { status: 503 })) as typeof fetch;
    const networkError = vi.fn(async () => {
      throw new Error("network error");
    }) as typeof fetch;

    await expect(setPartyFinderDmLevel("session", "all", serverError)).resolves.toBe("unavailable");
    await expect(setPartyFinderDmLevel("session", "all", networkError)).resolves.toBe("unavailable");
  });
});
