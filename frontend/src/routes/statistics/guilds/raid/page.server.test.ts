import { describe, expect, it, vi } from "vitest";

import { loadModLeaderboard, loadRaidEvents, loadTrackerLeaderboard } from "$lib/server/raidEventBoards";
import { load } from "./+page.server";

vi.mock("$lib/api/client", () => ({
  createSequoiaApiClient: () => ({ getSeasonRaidActivity: async () => ({ days: [] }) }),
}));
vi.mock("$lib/server/eventStore", () => ({ eventStore: { list: async () => [] } }));
vi.mock("$lib/server/eventVisibility", () => ({
  canSeeEvent: () => true,
  // A manager sees every tracker, which keeps these cases about the query string.
  resolveEventAudience: async () => ({ audience: "manager", roster: [] }),
}));
vi.mock("$lib/server/guildStats", () => ({ getGuildStats: async () => ({ members: [], stale: false }) }));
vi.mock("$lib/server/rankProfiles", () => ({
  getLinkedRankProfiles: async () => [],
  memberRanksByUuid: () => ({}),
}));
vi.mock("$lib/server/raidEventBoards", () => ({
  loadRaidEvents: vi.fn(async () => [{ id: "summer-slam", name: "Summer Slam", tracking: "mod", raid: null }]),
  loadModLeaderboard: vi.fn(async () => ({ leaderboard: [], error: null })),
  loadTrackerLeaderboard: vi.fn(async () => ({ leaderboard: [], error: null })),
}));

/** Runs the raid page load for one query string, as a signed-in viewer. */
function loadFor(query: string) {
  return load({
    fetch,
    url: new URL(`https://seq.test/statistics/guilds/raid${query}`),
    parent: async () => ({ viewer: { websiteAdmin: false } }),
  } as never) as Promise<Record<string, unknown>>;
}

describe("raid board timeframe selection", () => {
  it("selects a visible event named by ?event=", async () => {
    const data = await loadFor("?event=summer-slam");

    expect((data.selectedEvent as { id: string } | null)?.id).toBe("summer-slam");
    expect(data.customWindow).toBeNull();
    expect(vi.mocked(loadTrackerLeaderboard).mock.calls.length + vi.mocked(loadModLeaderboard).mock.calls.length)
      .toBeGreaterThan(0);
  });

  it("lets an explicit window outrank an event named alongside it", async () => {
    // The board below is built from the window whenever there is one, so leaving the event
    // selected too would light up its chip and its "an event is driving the board" note over
    // numbers that are the window's. Reachable from a hand-edited or bookmarked URL.
    const data = await loadFor("?event=summer-slam&window=3d");

    expect(data.selectedEvent).toBeNull();
    expect(data.windowInput).toBe("3d");
    expect((data.customWindow as { kind: string } | null)?.kind).toBe("duration");
    expect(data.windowIsDefault).toBe(false);
  });

  it("falls back to the default window with neither param", async () => {
    const data = await loadFor("");

    expect(data.selectedEvent).toBeNull();
    expect(data.windowIsDefault).toBe(true);
    expect(data.windowInput).toBe("7d");
  });
});

it("keeps the event list loading regardless of the timeframe", async () => {
  await loadFor("?window=1d");
  expect(vi.mocked(loadRaidEvents)).toHaveBeenCalled();
});
