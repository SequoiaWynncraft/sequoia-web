import { afterEach, describe, expect, it, vi } from "vitest";

import type { GuildMemberStats } from "#lib/api/guildStats.js";

vi.mock("#lib/server/sequoiaBackend.js", () => ({
  sequoiaBackendInternalHeaders: () => ({ authorization: "Bearer mod" }),
  sequoiaBackendOrigin: () => "https://backend.test",
}));
vi.mock("#lib/server/sequoiaWebBackend.js", () => ({
  sequoiaWebBackendUrl: (path: string) => `https://web.test${path}`,
  sequoiaWebBackendInternalHeaders: () => ({ authorization: "Bearer web" }),
}));

const { loadModLeaderboard, loadRaffleEligible } = await import("#lib/server/raidEventBoards.js");

afterEach(() => {
  vi.unstubAllGlobals();
});

interface TrackedEvent {
  id: string;
  tracking: "api" | "mod" | "wars";
  starts_at: string;
  ends_at: string;
  raid?: string | null;
}
interface ModEntry {
  player_uuid: string | null;
  username: string;
  raids: number;
}
interface WarEntry {
  player_uuid: string | null;
  username: string;
  war_points: number;
  war_count: number;
  unavailable_war_count: number;
}
interface ApiEntry {
  player_uuid: string;
  username: string;
  raids: number;
  rank: string;
}

function stubRoutes(config: {
  tracked: TrackedEvent[];
  modEntries?: ModEntry[];
  apiEntries?: ApiEntry[];
  warEntries?: WarEntry[];
}) {
  const seen: {
    modFrom: string | null;
    modTo: string | null;
    modRaid: string | null;
    warFrom: string | null;
    warTo: string | null;
  } = {
    modFrom: null,
    modTo: null,
    modRaid: null,
    warFrom: null,
    warTo: null,
  };
  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  vi.stubGlobal("fetch", async (input: string) => {
    const url = new URL(String(input));
    if (url.pathname === "/v1/raid-events") {
      return json(config.tracked.map((entry) => ({ slug: entry.id, name: entry.id, ...entry })));
    }
    if (url.pathname === "/internal/mod-raids/leaderboard") {
      seen.modFrom = url.searchParams.get("from");
      seen.modTo = url.searchParams.get("to");
      seen.modRaid = url.searchParams.get("raid");
      return json({ entries: config.modEntries ?? [] });
    }
    if (url.pathname === "/internal/war-points/leaderboard") {
      seen.warFrom = url.searchParams.get("from");
      seen.warTo = url.searchParams.get("to");
      return json({ entries: config.warEntries ?? [] });
    }
    if (url.pathname.endsWith("/leaderboard")) {
      return json(config.apiEntries ?? []);
    }
    return new Response("not found", { status: 404 });
  });
  return seen;
}

function member(username: string, uuid: string | null): GuildMemberStats {
  return {
    username,
    uuid,
    rank: "Sprout" as GuildMemberStats["rank"],
    online: null,
    server: null,
    contributed: 0,
    contribution_rank: 0,
    joined: null,
    last_join: null,
    playtime: null,
    wars: null,
    raids_total: null,
    raids: {},
    dungeons_total: null,
    total_level: null,
    quests: null,
  };
}

const MONTH: TrackedEvent = {
  id: "evt",
  tracking: "mod",
  starts_at: "2026-08-01T00:00:00.000Z",
  ends_at: "2026-08-31T00:00:00.000Z",
  raid: null,
};
const ROSTER = [member("Alice", "uuid-alice"), member("Bob", "uuid-bob")];

describe("loadRaffleEligible", () => {
  it("scopes a mod raffle to its window and weights tickets by raids-per-ticket", async () => {
    const seen = stubRoutes({
      tracked: [MONTH],
      modEntries: [
        { player_uuid: "uuid-alice", username: "Alice", raids: 20 },
        { player_uuid: "uuid-bob", username: "Bob", raids: 4 },
        { player_uuid: "uuid-outsider", username: "Outsider", raids: 99 },
      ],
    });

    const result = await loadRaffleEligible(fetch, { eventId: "evt", tracking: "mod" }, ROSTER, {
      perTicket: 5,
      window: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-07T00:00:00.000Z" },
    });

    expect(result.error).toBeNull();
    expect(seen.modFrom).toBe("2026-08-01T00:00:00.000Z");
    expect(seen.modTo).toBe("2026-08-07T00:00:00.000Z");
    expect(result.entrants).toEqual([{ player_uuid: "uuid-alice", username: "Alice", tickets: 4 }]);
  });

  it("counts the whole tracked window when a raffle has no window of its own", async () => {
    const seen = stubRoutes({
      tracked: [MONTH],
      modEntries: [{ player_uuid: "uuid-alice", username: "Alice", raids: 30 }],
    });

    await loadRaffleEligible(fetch, { eventId: "evt", tracking: "mod" }, ROSTER, { perTicket: 10 });

    expect(seen.modFrom).toBe(MONTH.starts_at);
    expect(seen.modTo).toBe(MONTH.ends_at);
  });

  it("drops members below a personal-milestone raid gate", async () => {
    stubRoutes({
      tracked: [MONTH],
      modEntries: [
        { player_uuid: "uuid-alice", username: "Alice", raids: 30 },
        { player_uuid: "uuid-bob", username: "Bob", raids: 12 },
      ],
    });

    const result = await loadRaffleEligible(fetch, { eventId: "evt", tracking: "mod" }, ROSTER, {
      perTicket: 5,
      requiredRaids: 20,
    });

    expect(result.error).toBeNull();
    expect(result.entrants).toEqual([{ player_uuid: "uuid-alice", username: "Alice", tickets: 6 }]);
  });

  it("measures the milestone gate over the full window, not the raffle window", async () => {
    const seen = stubRoutes({
      tracked: [MONTH],
      modEntries: [{ player_uuid: "uuid-alice", username: "Alice", raids: 25 }],
    });

    const result = await loadRaffleEligible(fetch, { eventId: "evt", tracking: "mod" }, ROSTER, {
      perTicket: 5,
      window: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-07T00:00:00.000Z" },
      requiredRaids: 20,
    });

    expect(result.error).toBeNull();
    expect(result.entrants).toEqual([{ player_uuid: "uuid-alice", username: "Alice", tickets: 5 }]);
    expect(seen.modFrom).toBe(MONTH.starts_at);
    expect(seen.modTo).toBe(MONTH.ends_at);
    expect(seen.modRaid).toBeNull();
  });

  it("rejects a windowed raffle on an API tracker (whole-window totals only)", async () => {
    stubRoutes({ tracked: [{ ...MONTH, tracking: "api" }] });

    const result = await loadRaffleEligible(fetch, { eventId: "evt", tracking: "api" }, ROSTER, {
      perTicket: 5,
      window: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-07T00:00:00.000Z" },
    });

    expect(result.entrants).toEqual([]);
    expect(result.error).toContain("API-tracked");
  });

  it("weights an unwindowed API raffle from the tracker's running totals", async () => {
    stubRoutes({
      tracked: [{ ...MONTH, tracking: "api" }],
      apiEntries: [
        { player_uuid: "uuid-alice", username: "Alice", raids: 30, rank: "Sprout" },
        { player_uuid: "uuid-bob", username: "Bob", raids: 9, rank: "Sprout" },
      ],
    });

    const result = await loadRaffleEligible(fetch, { eventId: "evt", tracking: "api" }, ROSTER, {
      perTicket: 10,
    });

    expect(result.error).toBeNull();
    expect(result.entrants).toEqual([{ player_uuid: "uuid-alice", username: "Alice", tickets: 3 }]);
  });
});

describe("war-point trackers", () => {
  const WARS: TrackedEvent = { ...MONTH, id: "wars", tracking: "wars" };
  const war = (uuid: string | null, username: string, points: number, pending = 0): WarEntry => ({
    player_uuid: uuid,
    username,
    war_points: points,
    war_count: 3,
    unavailable_war_count: pending,
  });

  it("reads war points into the roster-filtered board, flagging partial totals", async () => {
    const seen = stubRoutes({
      tracked: [WARS],
      warEntries: [
        war("uuid-alice", "Alice", 123.5, 1),
        war("uuid-bob", "Bob", 40),
        war("uuid-outsider", "Outsider", 999),
      ],
    });

    const result = await loadModLeaderboard(
      fetch,
      { starts_at: WARS.starts_at, ends_at: WARS.ends_at },
      ROSTER,
      "wars",
    );

    expect(result.error).toBeNull();
    expect(seen.warFrom).toBe(WARS.starts_at);
    expect(seen.warTo).toBe(WARS.ends_at);
    expect(seen.modFrom).toBeNull();
    expect(result.leaderboard).toEqual([
      { player_uuid: "uuid-alice", username: "Alice", raids: 123.5, pendingWars: 1, rank: "Sprout" },
      { player_uuid: "uuid-bob", username: "Bob", raids: 40, rank: "Sprout" },
    ]);
  });

  it("weights a windowed raffle by war points per ticket", async () => {
    const seen = stubRoutes({
      tracked: [WARS],
      warEntries: [war("uuid-alice", "Alice", 52.5), war("uuid-bob", "Bob", 9)],
    });

    const result = await loadRaffleEligible(fetch, { eventId: "wars", tracking: "wars" }, ROSTER, {
      perTicket: 10,
      window: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-07T00:00:00.000Z" },
    });

    expect(result.error).toBeNull();
    expect(seen.warFrom).toBe("2026-08-01T00:00:00.000Z");
    expect(seen.warTo).toBe("2026-08-07T00:00:00.000Z");
    expect(result.entrants).toEqual([{ player_uuid: "uuid-alice", username: "Alice", tickets: 5 }]);
  });

  it("fails a draw closed while wars still await their points", async () => {
    stubRoutes({
      tracked: [WARS],
      warEntries: [war("uuid-alice", "Alice", 52.5, 1), war("uuid-bob", "Bob", 30)],
    });
    const tracker = { eventId: "wars", tracking: "wars" as const };

    const strict = await loadRaffleEligible(fetch, tracker, ROSTER, {
      perTicket: 10,
      failOnPending: true,
    });
    expect(strict).toEqual({
      entrants: [],
      error: "1 war is still waiting for point values - roll once they're calculated.",
    });

    const lenient = await loadRaffleEligible(fetch, tracker, ROSTER, { perTicket: 10 });
    expect(lenient.error).toBeNull();
    expect(lenient.entrants).toHaveLength(2);
  });

  it("checks the full-window milestone board for pending wars too", async () => {
    stubRoutes({ tracked: [WARS], warEntries: [] });
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = new URL(String(input));
      if (url.pathname === "/internal/war-points/leaderboard" && url.searchParams.get("to") === WARS.ends_at) {
        return new Response(JSON.stringify({ entries: [war("uuid-alice", "Alice", 80, 2)] }));
      }
      return fetch(input, init);
    };

    const result = await loadRaffleEligible(fetchImpl, { eventId: "wars", tracking: "wars" }, ROSTER, {
      perTicket: 10,
      window: { from: "2026-08-01T00:00:00.000Z", to: "2026-08-07T00:00:00.000Z" },
      requiredRaids: 50,
      failOnPending: true,
    });
    expect(result.error).toBe("2 wars are still waiting for point values - roll once they're calculated.");
  });
});
