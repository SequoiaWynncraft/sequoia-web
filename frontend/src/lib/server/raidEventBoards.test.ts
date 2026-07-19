import { afterEach, describe, expect, it, vi } from "vitest";

import type { GuildMemberStats } from "$lib/api/guildStats";

vi.mock("$lib/server/sequoiaBackend", () => ({
  sequoiaBackendInternalHeaders: () => ({ authorization: "Bearer mod" }),
  sequoiaBackendOrigin: () => "https://backend.test",
}));
vi.mock("$lib/server/sequoiaWebBackend", () => ({
  sequoiaWebBackendUrl: (path: string) => `https://web.test${path}`,
  sequoiaWebBackendInternalHeaders: () => ({ authorization: "Bearer web" }),
}));

// Imported after the mocks so the module binds the stubbed backends.
const { loadRaffleEligible } = await import("$lib/server/raidEventBoards");

afterEach(() => {
  vi.unstubAllGlobals();
});

interface TrackedEvent {
  id: string;
  tracking: "api" | "mod";
  starts_at: string;
  ends_at: string;
  raid?: string | null;
}
interface ModEntry {
  player_uuid: string | null;
  username: string;
  raids: number;
}
interface ApiEntry {
  player_uuid: string;
  username: string;
  raids: number;
  rank: string;
}

/** Routes fetch by path and records the window the mod leaderboard was queried with. */
function stubRoutes(config: {
  tracked: TrackedEvent[];
  modEntries?: ModEntry[];
  apiEntries?: ApiEntry[];
}) {
  const seen: { modFrom: string | null; modTo: string | null; modRaid: string | null } = {
    modFrom: null,
    modTo: null,
    modRaid: null,
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
    // The raffle's own window - not the whole event - is what the board counts.
    expect(seen.modFrom).toBe("2026-08-01T00:00:00.000Z");
    expect(seen.modTo).toBe("2026-08-07T00:00:00.000Z");
    // Alice: floor(20/5)=4 tickets. Bob: floor(4/5)=0, dropped. Outsider: off
    // the roster, dropped. Identity comes from the roster, not the mod report.
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
    // Bob (12 raids) is below the gate and dropped even though he earns tickets;
    // Alice (30) clears it: floor(30/5)=6.
    expect(result.entrants).toEqual([{ player_uuid: "uuid-alice", username: "Alice", tickets: 6 }]);
  });

  it("measures the milestone gate over the full window, not the raffle window", async () => {
    // The gate reads the tracker's whole window while tickets read the raffle
    // window; the stub returns the same board for both, so a member clearing the
    // gate on full-window totals still qualifies.
    stubRoutes({
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
    // Alice: floor(30/10)=3. Bob: floor(9/10)=0, dropped.
    expect(result.entrants).toEqual([{ player_uuid: "uuid-alice", username: "Alice", tickets: 3 }]);
  });
});
