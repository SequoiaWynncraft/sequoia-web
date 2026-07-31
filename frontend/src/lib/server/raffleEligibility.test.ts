import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GuildMemberStats } from "$lib/api/guildStats";
import type { EventRaffle, GuildEvent } from "$lib/events/types";

import { resolveEligibility } from "./raffleEligibility";
import { getMemberProgressResult } from "./memberProgress";
import { loadRaffleEligible, loadTrackerBoard } from "./raidEventBoards";
import { getLinkedRankProfilesResult, memberRanksByUuid } from "./rankProfiles";

vi.mock("./memberProgress", () => ({ getMemberProgressResult: vi.fn() }));
vi.mock("./rankProfiles", () => ({
  getLinkedRankProfilesResult: vi.fn(),
  memberRanksByUuid: vi.fn(),
}));
vi.mock("./raidEventBoards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./raidEventBoards")>()),
  loadRaffleEligible: vi.fn(),
  loadTrackerBoard: vi.fn(),
  resolveTrackedEvent: vi.fn().mockResolvedValue(undefined),
}));

const mockProgress = vi.mocked(getMemberProgressResult);
const mockProfiles = vi.mocked(getLinkedRankProfilesResult);
const mockRanks = vi.mocked(memberRanksByUuid);
const mockLegacy = vi.mocked(loadRaffleEligible);
const mockBoard = vi.mocked(loadTrackerBoard);

const WINDOW = { from: "2026-07-01T00:00:00.000Z", to: "2026-07-15T00:00:00.000Z" };

function member(uuid: string, username: string, rank = "recruit"): GuildMemberStats {
  return { uuid, username, rank } as GuildMemberStats;
}

const ROSTER = [
  member("uuid-a", "Alice", "chief"),
  member("uuid-b", "Bob", "strategist"),
  member("uuid-c", "Cara", "recruit"),
];

function event(overrides: Partial<GuildEvent> = {}): GuildEvent {
  return {
    slug: "test",
    name: "Test",
    tagline: "t",
    access: "members",
    theme: { sky: ["#000000", "#000000"], accent: "#000000", accentSecondary: "#000000", star: "#000000" },
    tracker: { eventId: "evt-1", tracking: "mod" },
    ...overrides,
  };
}

function raffle(overrides: Partial<EventRaffle> = {}): EventRaffle {
  return { id: "r1", prize: "Mythic", winnerCount: 1, perTicket: 5, ...overrides };
}

function progressWith(
  entries: [string, { raids?: number; wars?: number; playtime?: number }][],
  dataSince: { activity?: string; raids?: string } = {},
  stale = false,
  resolvedRange: { from?: string; to?: string } = {},
) {
  mockProgress.mockResolvedValue({
    stale,
    updatedAt: 0,
    data: {
      generated_at: "",
      from: resolvedRange.from ?? WINDOW.from.slice(0, 10),
      to: resolvedRange.to ?? WINDOW.to.slice(0, 10),
      data_since: {
        activity: dataSince.activity ?? "",
        raids: dataSince.raids ?? "",
        war_points: "",
      },
      members: entries.map(([uuid, gains]) => ({
        player_uuid: uuid,
        player_name: uuid,
        playtime_hours: gains.playtime ?? 0,
        wars: gains.wars ?? 0,
        raids: gains.raids ?? 0,
        raids_by_type: {},
        war_points: 0,
        wars_participated: 0,
      })),
    },
  } as never);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveEligibility", () => {
  it("delegates legacy raffles (no eligibility) to the tracker-board path", async () => {
    mockLegacy.mockResolvedValue({
      entrants: [{ player_uuid: "uuid-a", username: "Alice", tickets: 4 }],
      error: null,
    });
    const result = await resolveEligibility(fetch, event(), raffle(), ROSTER);
    expect(result.error).toBeNull();
    expect(result.entrants).toEqual([
      { player_uuid: "uuid-a", username: "Alice", tickets: 4, source: "roster" },
    ]);
    expect(result.totalTickets).toBe(4);
    expect(mockLegacy).toHaveBeenCalledWith(fetch, event().tracker, ROSTER, {
      perTicket: 5,
      window: undefined,
      requiredRaids: undefined,
    });
  });

  it("legacy raffles without a tracker fail closed", async () => {
    const result = await resolveEligibility(fetch, event({ tracker: undefined }), raffle(), ROSTER);
    expect(result.error).toContain("tracker");
    expect(result.entrants).toEqual([]);
  });

  it("defaults to the whole roster with one flat ticket each", async () => {
    const result = await resolveEligibility(fetch, event(), raffle({ eligibility: {} }), ROSTER);
    expect(result.error).toBeNull();
    expect(result.entrants).toHaveLength(3);
    expect(result.entrants.every((entrant) => entrant.tickets === 1)).toBe(true);
    expect(result.totalTickets).toBe(3);
  });

  it("filters by guild rank", async () => {
    const result = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { rules: [{ type: "guildRank", ranks: ["chief", "strategist"] }] } }),
      ROSTER,
    );
    expect(result.entrants.map((entrant) => entrant.username).sort()).toEqual(["Alice", "Bob"]);
  });

  it("filters by Sequoia ladder rank, case-insensitively, dropping unlinked members", async () => {
    mockProfiles.mockResolvedValue({ data: {}, stale: false, updatedAt: 0 } as never);
    mockRanks.mockReturnValue({
      "uuid-a": { rank: "Druid", rankOrder: 5, insignia: null, insigniaUrl: null, honours: 0 },
      "uuid-b": { rank: "Leafkin", rankOrder: 1, insignia: null, insigniaUrl: null, honours: 0 },
    });
    const result = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { rules: [{ type: "seqRank", ranks: ["druid"] }] } }),
      ROSTER,
    );
    expect(result.entrants.map((entrant) => entrant.username)).toEqual(["Alice"]);
  });

  it("filters by windowed stat thresholds using whole UTC days", async () => {
    progressWith([
      ["uuid-a", { raids: 12 }],
      ["uuid-b", { raids: 3 }],
    ]);
    const result = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { rules: [{ type: "stat", stat: "raids", min: 10, window: WINDOW }] } }),
      ROSTER,
    );
    expect(result.entrants.map((entrant) => entrant.username)).toEqual(["Alice"]);
    expect(mockProgress).toHaveBeenCalledWith(fetch, "2026-07-01", "2026-07-15", { allowStale: true });
  });

  it("gates on a personal milestone via the full-window tracker board", async () => {
    mockBoard.mockResolvedValue({
      leaderboard: [
        { player_uuid: "uuid-a", username: "Alice", raids: 20, rank: "chief" },
        { player_uuid: "uuid-b", username: "Bob", raids: 5, rank: "strategist" },
      ],
      error: null,
    });
    const result = await resolveEligibility(
      fetch,
      event({ personalMilestones: [{ id: "m1", at: 15, unlock: "Entry" }] }),
      raffle({ eligibility: { rules: [{ type: "milestone", milestoneId: "m1" }] } }),
      ROSTER,
    );
    expect(result.entrants.map((entrant) => entrant.username)).toEqual(["Alice"]);
    expect(mockBoard).toHaveBeenCalledWith(fetch, event().tracker, ROSTER, { window: undefined }, undefined);
  });

  it("weights by stat gains, flooring and dropping zero-ticket members", async () => {
    progressWith([
      ["uuid-a", { playtime: 9 }],
      ["uuid-b", { playtime: 1 }],
    ]);
    const result = await resolveEligibility(
      fetch,
      event(),
      raffle({
        eligibility: { weight: { mode: "perStat", stat: "playtime", per: 2, window: WINDOW } },
      }),
      ROSTER,
    );
    expect(result.entrants).toEqual([
      { player_uuid: "uuid-a", username: "Alice", tickets: 4, source: "roster" },
    ]);
  });

  it("weights by tracker-board raids for perRaid", async () => {
    mockBoard.mockResolvedValue({
      leaderboard: [{ player_uuid: "uuid-c", username: "Cara", raids: 11, rank: "recruit" }],
      error: null,
    });
    const result = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { weight: { mode: "perRaid", perTicket: 5 } } }),
      ROSTER,
    );
    expect(result.entrants).toEqual([
      { player_uuid: "uuid-c", username: "Cara", tickets: 2, source: "roster" },
    ]);
  });

  it("weights an included roster member who fails the rules before applying the floor", async () => {
    mockBoard.mockResolvedValue({
      leaderboard: [{ player_uuid: "uuid-c", username: "Cara", raids: 50, rank: "recruit" }],
      error: null,
    });
    const result = await resolveEligibility(
      fetch,
      event(),
      raffle({
        eligibility: {
          rules: [{ type: "guildRank", ranks: ["chief"] }],
          weight: { mode: "perRaid", perTicket: 5 },
          include: [{ player_uuid: "UUID-C", username: "Cara", tickets: 3 }],
        },
      }),
      ROSTER,
    );
    expect(result.entrants).toEqual([
      { player_uuid: "uuid-c", username: "Cara", tickets: 10, source: "include" },
    ]);
  });

  it("pins includes past the rules and lets excludes beat everything", async () => {
    const result = await resolveEligibility(
      fetch,
      event(),
      raffle({
        eligibility: {
          rules: [{ type: "guildRank", ranks: ["chief"] }],
          include: [
            { player_uuid: "uuid-x", username: "Xavier", tickets: 3 },
            { player_uuid: "uuid-c", username: "Cara" },
          ],
          exclude: [{ player_uuid: "UUID-C", username: "Cara" }],
        },
      }),
      ROSTER,
    );
    // Alice via the rule; Xavier via include with his floor; Cara included
    // then excluded - exclude wins.
    expect(result.entrants).toEqual([
      { player_uuid: "uuid-a", username: "Alice", tickets: 1, source: "roster" },
      { player_uuid: "uuid-x", username: "Xavier", tickets: 3, source: "include" },
    ]);
  });

  it("raises an include already in the pool to its floor without double-counting", async () => {
    const result = await resolveEligibility(
      fetch,
      event(),
      raffle({
        eligibility: { include: [{ player_uuid: "uuid-a", username: "Alice", tickets: 5 }] },
      }),
      ROSTER,
    );
    const alice = result.entrants.find((entrant) => entrant.username === "Alice");
    expect(alice).toMatchObject({ tickets: 5, source: "include" });
    expect(result.entrants).toHaveLength(3);
  });

  it("fails stat windows closed when they start before the rollup history", async () => {
    progressWith([["uuid-a", { raids: 12 }]], { raids: "2026-07-05" });
    const rule = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { rules: [{ type: "stat", stat: "raids", min: 1, window: WINDOW }] } }),
      ROSTER,
    );
    expect(rule.error).toContain("2026-07-05");
    expect(rule.entrants).toEqual([]);

    // Wars and playtime read the activity rollups' start, not the raid feed's.
    progressWith([["uuid-a", { playtime: 9 }]], { activity: "2026-07-03" });
    const weight = await resolveEligibility(
      fetch,
      event(),
      raffle({
        eligibility: { weight: { mode: "perStat", stat: "playtime", per: 2, window: WINDOW } },
      }),
      ROSTER,
    );
    expect(weight.error).toContain("2026-07-03");

    // A window starting on or after the history start resolves normally.
    progressWith([["uuid-a", { raids: 12 }]], { raids: "2026-07-01" });
    const fine = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { rules: [{ type: "stat", stat: "raids", min: 1, window: WINDOW }] } }),
      ROSTER,
    );
    expect(fine.error).toBeNull();
    expect(fine.entrants.map((entrant) => entrant.username)).toEqual(["Alice"]);
  });

  it("fails closed when a data source is unavailable", async () => {
    mockProgress.mockRejectedValue(new Error("down"));
    const stat = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { rules: [{ type: "stat", stat: "wars", min: 1, window: WINDOW }] } }),
      ROSTER,
    );
    expect(stat.error).not.toBeNull();
    expect(stat.entrants).toEqual([]);

    mockBoard.mockResolvedValue({ leaderboard: [], error: "Board down." });
    const perRaid = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { weight: { mode: "perRaid", perTicket: 1 } } }),
      ROSTER,
    );
    expect(perRaid.error).toBe("Board down.");
  });
});

describe("strict resolution for rolls", () => {
  it("refuses a backend-truncated stat range under strict resolution", async () => {
    progressWith(
      [["uuid-a", { raids: 12 }]],
      {},
      false,
      { from: "2026-07-02", to: "2026-07-15" },
    );
    const rule = { type: "stat" as const, stat: "raids" as const, min: 1, window: WINDOW };

    const strict = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { rules: [rule] } }),
      ROSTER,
      { strict: true },
    );
    expect(strict.error).toBe("Member data is temporarily unavailable - try again shortly.");
    expect(strict.entrants).toEqual([]);

    const preview = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { rules: [rule] } }),
      ROSTER,
    );
    expect(preview.error).toBeNull();
  });

  it("refuses stale stat rollups and rank profiles under strict, tolerates them otherwise", async () => {
    progressWith([["uuid-a", { raids: 12 }]], {}, true);
    const rule = { type: "stat" as const, stat: "raids" as const, min: 1, window: WINDOW };
    const strict = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { rules: [rule] } }),
      ROSTER,
      { strict: true },
    );
    expect(strict.error).not.toBeNull();
    expect(mockProgress).toHaveBeenCalledWith(fetch, "2026-07-01", "2026-07-15", {
      allowStale: false,
    });
    const lenient = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { rules: [rule] } }),
      ROSTER,
    );
    expect(lenient.error).toBeNull();

    mockProfiles.mockResolvedValue({ data: {}, stale: true, updatedAt: 0 } as never);
    mockRanks.mockReturnValue({
      "uuid-a": { rank: "Druid", rankOrder: 5, insignia: null, insigniaUrl: null, honours: 0 },
    });
    const ranks = await resolveEligibility(
      fetch,
      event(),
      raffle({ eligibility: { rules: [{ type: "seqRank", ranks: ["druid"] }] } }),
      ROSTER,
      { strict: true },
    );
    expect(ranks.error).not.toBeNull();
    expect(mockProfiles).toHaveBeenCalledWith(fetch, { allowStale: false });
  });
});

describe("whitelist-only raffles", () => {
  it("pools exactly the include list - roster and rules ignored", async () => {
    const result = await resolveEligibility(
      fetch,
      event(),
      raffle({
        eligibility: {
          whitelistOnly: true,
          // A rule that would exclude everyone must have no effect.
          rules: [{ type: "guildRank", ranks: [] }],
          include: [
            { player_uuid: "uuid-b", username: "Bob" },
            { player_uuid: "outsider", username: "Zed", tickets: 3 },
          ],
        },
      }),
      ROSTER,
    );
    expect(result.error).toBeNull();
    expect(result.entrants.map((entry) => entry.username).sort()).toEqual(["Bob", "Zed"]);
    expect(result.entrants.find((entry) => entry.username === "Zed")?.tickets).toBe(3);
  });

  it("excludes still beat the whitelist", async () => {
    const result = await resolveEligibility(
      fetch,
      event(),
      raffle({
        eligibility: {
          whitelistOnly: true,
          include: [
            { player_uuid: "uuid-a", username: "Alice" },
            { player_uuid: "uuid-b", username: "Bob" },
          ],
          exclude: [{ player_uuid: "UUID-A", username: "Alice" }],
        },
      }),
      ROSTER,
    );
    expect(result.entrants.map((entry) => entry.username)).toEqual(["Bob"]);
  });
});
