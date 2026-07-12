import { describe, expect, it, vi } from "vitest";

import {
  getPartyFinderDmLevel,
  parsePartyFinderDmLevel,
  setPartyFinderDmLevel,
} from "$lib/server/partyFinderPreferences";

describe("partyFinderPreferences", () => {
  it("accepts only supported levels", () => {
    expect(parsePartyFinderDmLevel("important_only")).toBe("important_only");
    expect(parsePartyFinderDmLevel("all")).toBe("all");
    expect(parsePartyFinderDmLevel("everything")).toBeNull();
  });

  it("loads a validated preference", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ dm_level: "none" }))) as typeof fetch;

    await expect(getPartyFinderDmLevel("session", fetchImpl)).resolves.toBe("none");
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/auth/web/preferences/party-finder"),
      expect.objectContaining({ headers: { authorization: "Bearer session" } }),
    );
  });

  it("does not accept malformed backend data", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ dm_level: "loud" }))) as typeof fetch;

    await expect(getPartyFinderDmLevel("session", fetchImpl)).resolves.toBeNull();
  });

  it("sends the selected level as JSON", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 })) as typeof fetch;

    await expect(setPartyFinderDmLevel("session", "all", fetchImpl)).resolves.toBe("saved");
    expect(fetchImpl).toHaveBeenCalledWith(
      expect.stringContaining("/auth/web/preferences/party-finder"),
      expect.objectContaining({ method: "PUT", body: JSON.stringify({ dm_level: "all" }) }),
    );
  });
});
