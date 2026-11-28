import { describe, expect, it, vi } from "vitest";

import type { GuildEvent } from "#lib/events/types.js";
import type { Viewer } from "#lib/site/viewer.js";

const H = vi.hoisted(() => ({
  stats: null as { stale: boolean; members: { username: string; uuid: string }[] } | null,
  rosterSeenByBoard: undefined as unknown,
  boardCalls: 0,
}));

const ADMIN_UUID = "33333333-3333-3333-3333-333333333333";
const MEMBER_UUID = "22222222-2222-2222-2222-222222222222";
const TRACKER_ID = "tracker-1";

const EVENT: GuildEvent = {
  slug: "test-event",
  name: "Test Event",
  tagline: "Testing.",
  access: "public",
  theme: {
    sky: ["#000000", "#111111"],
    accent: "#ffffff",
    accentSecondary: "#eeeeee",
    star: "#dddddd",
  },
  startsAt: "2020-01-01T00:00:00Z",
  endsAt: "2099-01-01T00:00:00Z",
  tracker: { eventId: TRACKER_ID, tracking: "mod" },
};

vi.mock("#lib/server/eventStore.js", () => ({
  eventStore: { get: async () => ({ event: EVENT, published: true }) },
}));
vi.mock("#lib/server/guildStats.js", () => ({
  getGuildStats: async () => {
    if (H.stats === null) throw new Error("Unable to load guild statistics.");
    return H.stats;
  },
}));
vi.mock("#lib/server/rankProfiles.js", () => ({
  getLinkedRankProfilesResult: async () => ({
    stale: false,
    updatedAt: 0,
    data: { source: { stale: false }, profiles: [] },
  }),
  getLinkedRankProfiles: async () => ({ profiles: [] }),
  memberRanksByUuid: () => ({}),
}));
vi.mock("#lib/server/raidEventBoards.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("#lib/server/raidEventBoards.js")>();
  return {
    ...actual,
    loadRaidEvents: async () => [
      {
        id: TRACKER_ID,
        tracking: "mod",
        starts_at: EVENT.startsAt,
        ends_at: EVENT.endsAt,
        raid: null,
      },
    ],
    loadModLeaderboard: async (_fetch: unknown, _window: unknown, roster: unknown) => {
      H.boardCalls += 1;
      H.rosterSeenByBoard = roster;
      return {
        leaderboard: [{ player_uuid: MEMBER_UUID, player_name: "Member", raids: 7 }],
        error: null,
      };
    },
  };
});

const { load } = await import("./+page.server");

function admin(): Viewer {
  return {
    discordId: "1",
    discordUsername: "tester",
    minecraftUuid: ADMIN_UUID,
    minecraftUsername: "Admin",
    websiteAdmin: true,
  };
}

type PageData = {
  standings: { state: string; leaderboard?: unknown[]; error?: string | null };
  viewerRaids: number | null;
};

function loadPage(viewer: Viewer) {
  return (load as unknown as (event: unknown) => Promise<PageData>)({
    fetch,
    locals: { requestId: "test-request" },
    params: { slug: "test-event" },
    parent: async () => ({ viewer }),
  });
}

describe("event page standings roster", () => {
  it("falls back to the stale roster for an administrator", async () => {
    H.stats = { stale: true, members: [{ username: "Member", uuid: MEMBER_UUID }] };
    H.boardCalls = 0;
    H.rosterSeenByBoard = undefined;

    const data = await loadPage(admin());

    expect(H.boardCalls).toBe(1);
    expect(H.rosterSeenByBoard).toEqual([{ username: "Member", uuid: MEMBER_UUID }]);
    expect(data.standings.state).toBe("board");
    expect(data.standings.error).toBeNull();
  });

  it("reports an outage rather than an empty board when no roster can be read", async () => {
    H.stats = null;
    H.boardCalls = 0;
    H.rosterSeenByBoard = undefined;

    const data = await loadPage(admin());

    expect(H.boardCalls).toBe(0);
    expect(data.standings.state).toBe("board");
    expect(data.standings.leaderboard).toEqual([]);
    expect(data.standings.error).toBe("Member contributions are temporarily unavailable.");
    expect(data.viewerRaids).toBeNull();
  });

  it("uses the fresh roster when one is available", async () => {
    H.stats = { stale: false, members: [{ username: "Member", uuid: MEMBER_UUID }] };
    H.boardCalls = 0;
    H.rosterSeenByBoard = undefined;

    await loadPage(admin());

    expect(H.rosterSeenByBoard).toEqual([{ username: "Member", uuid: MEMBER_UUID }]);
  });
});
