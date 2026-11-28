import { afterEach, describe, expect, it, vi } from "vitest";

import type { ViewerEvent } from "#lib/events/viewerEvent.js";
import {
  COUNT_RAID,
  ENTRANT_UUID,
  EXPECTED_VIEW,
  FIXTURE_EVENT,
  TRACKER_ID,
  VIEWER_UUID,
  WINNER_UUID,
  expectOnlyRenderedEventData,
  storedRoll,
} from "#lib/events/viewerEvent.fixture.js";
import type { RaffleRoll } from "#lib/server/raffleRolls.js";
import type { Viewer } from "#lib/site/viewer.js";

const H = vi.hoisted(() => ({
  audience: "member" as "member" | "manager",
  rolls: [] as RaffleRoll[],
}));

vi.mock("#lib/server/eventStore.js", () => ({
  eventStore: { get: async () => ({ event: structuredClone(FIXTURE_EVENT), published: true, updatedAt: 1 }) },
}));
vi.mock("#lib/server/eventVisibility.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/server/eventVisibility.js")>()),
  resolveEventAudience: async () => ({
    audience: H.audience,
    roster: [{ username: "Viewer", uuid: VIEWER_UUID, rank: "recruit" }],
  }),
}));
vi.mock("#lib/server/viewerSession.js", () => ({ loadViewer: async () => viewer }));
vi.mock("#lib/server/raffleRolls.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/server/raffleRolls.js")>()),
  raffleRollStore: { latestForEvent: async () => H.rolls },
}));
vi.mock("#lib/server/guildStats.js", () => ({ getGuildStats: async () => ({ stale: false, members: [] }) }));
vi.mock("#lib/server/rankProfiles.js", () => ({
  getLinkedRankProfiles: async () => ({ profiles: [] }),
  memberRanksByUuid: () => ({}),
}));
vi.mock("#lib/server/raidEventBoards.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/server/raidEventBoards.js")>()),
  loadRaidEvents: async () => [
    { id: TRACKER_ID, slug: "t", name: "t", tracking: "mod", starts_at: "2020-01-01T00:00:00Z", ends_at: "2099-01-01T00:00:00Z" },
  ],
  loadModLeaderboard: async () => ({ leaderboard: [], error: "invalid internal API token" }),
}));
vi.mock("#lib/server/eventActivity.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("#lib/server/eventActivity.js")>()),
  loadEventRaidCounts: async () => [{ day: "2020-01-01", value: 2 }],
}));

const detail = await import("./+page.server");
const stage = await import("./raffle/+page.server");
const stream = await import("./raffle/stream/+server");
const { publish } = await import("#lib/server/liveRolls.js");

const viewer: Viewer = {
  discordId: "700000000000000007",
  discordUsername: "fixture-viewer",
  minecraftUuid: VIEWER_UUID,
  minecraftUsername: "Viewer",
  websiteAdmin: false,
};

const routeInput = {
  fetch,
  locals: { requestId: "fixture-request" },
  params: { slug: "fixture-event" },
  parent: async () => ({ viewer }),
  cookies: { get: () => "fixture-session" },
};

async function runLoad<T>(load: unknown): Promise<T> {
  return (await (load as (input: unknown) => Promise<unknown>)(routeInput)) as T;
}

type DetailData = {
  event: ViewerEvent;
  chart: unknown;
  standings: { error: string | null };
  spinningSlots: string[];
};

afterEach(() => {
  H.audience = "member";
  H.rolls = [];
});

describe("event detail page data", () => {
  it.each(["member", "manager"] as const)("serves the viewer projection to a %s", async (audience) => {
    H.audience = audience;
    H.rolls = [storedRoll()];

    const data = await runLoad<DetailData>(detail.load);

    expect(data.event).toEqual(EXPECTED_VIEW);
    expectOnlyRenderedEventData(JSON.stringify(data));
  });

  it("sends the activity chart's label, not its feed settings", async () => {
    const data = await runLoad<DetailData>(detail.load);

    expect(data.chart).toEqual({ label: COUNT_RAID });
  });

  it("holds back the winner of a slot that is still spinning", async () => {
    H.rolls = [storedRoll({ slot: 0, state: "spinning", settlesAt: Date.now() + 60_000 })];

    const data = await runLoad<DetailData>(detail.load);

    expect(data.spinningSlots).toEqual(["raffle-1:0"]);
    expect(data.event.raffles?.[0].winners).toEqual([]);
    expect(JSON.stringify(data.event)).not.toContain(WINNER_UUID);
  });

  it("replaces upstream leaderboard error text with the fixed notice", async () => {
    const data = await runLoad<DetailData>(detail.load);

    expect(data.standings.error).toBe("Member contributions are temporarily unavailable.");
    expect(JSON.stringify(data)).not.toContain("internal API token");
  });
});

describe("raffle stage page data", () => {
  it("serves the viewer projection and wire-shaped rolls", async () => {
    H.rolls = [storedRoll()];

    const data = await runLoad<{ event: ViewerEvent; rolls: unknown[] }>(stage.load);

    expect(data.event).toEqual(EXPECTED_VIEW);
    expect(data.rolls).toEqual([
      {
        rollId: "roll-1",
        raffleId: "raffle-1",
        slot: 1,
        prize: "Grand prize",
        entrants: [
          { player_uuid: ENTRANT_UUID, username: "EntrantOne", tickets: 3 },
          { player_uuid: WINNER_UUID, username: "WinnerOne", tickets: 9 },
        ],
        winnerIndex: 1,
        winner: { player_uuid: WINNER_UUID, username: "WinnerOne", tickets: 9 },
        spin: { turns: 5, durationMs: 9000 },
        state: "settled",
        startedAt: 1_000,
        settlesAt: 10_000,
      },
    ]);
    expectOnlyRenderedEventData(JSON.stringify(data));
  });
});

describe("raffle stage stream", () => {
  it("sends only wire fields in the snapshot and in live rolls", async () => {
    H.rolls = [storedRoll()];

    const response = await runLoad<Response>(stream.GET);
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    const next = async () => decoder.decode((await reader.read()).value);

    const snapshot = await next();
    expect(snapshot).toContain('"type":"snapshot"');
    expect(snapshot).toContain(ENTRANT_UUID);
    expectOnlyRenderedEventData(snapshot);

    // A fresh draw is published with its event slug and drawer attached.
    publish("fixture-event", { type: "roll", now: 0, roll: storedRoll({ rollId: "roll-2", state: "spinning" }) });
    const live = await next();
    expect(live).toContain('"rollId":"roll-2"');
    expectOnlyRenderedEventData(live);

    await reader.cancel();
  });
});
