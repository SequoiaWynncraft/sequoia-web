import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GuildLevelHistoryResponse } from "$lib/api/guildLevel";

const VIEWER_UUID = "11111111-1111-1111-1111-111111111111";

/** The backend history the tracker reads, oldest entry first as it is sent. */
function historyResponse(entries: { level: number; observed_at: string }[]) {
  return {
    guild_uuid: "ee860b7c-9a1d-49cf-9f19-ab673ba0f23b",
    name: "Sequoia",
    prefix: "SEQ",
    current_level: entries.at(-1)?.level ?? 0,
    level_observed_at: "2026-07-29T13:10:26.765Z",
    entries,
  } satisfies GuildLevelHistoryResponse;
}

const TWO_LEVEL_UPS = [
  { level: 244, observed_at: "2026-07-26T17:45:23.605Z" },
  { level: 245, observed_at: "2026-07-29T01:45:24.811Z" },
];

/**
 * Three entries, the shape a payout message actually needs: the oldest row only
 * marks when tracking started, so the two rows above it are the first pair whose
 * gap is a real level-up window.
 */
const RECORDED_LEVEL_UPS = [
  { level: 243, observed_at: "2026-07-24T12:00:00.000Z" },
  ...TWO_LEVEL_UPS,
];

const H = vi.hoisted(() => ({
  /** The guild payload the page (and the tracker) reads. */
  guild: { level: 245, xp_percent: 12 },
  generatedAt: "2026-07-29T13:10:26.765Z",
  /** Linked profiles the gate reads; individual tests swap this in. */
  profiles: { profiles: [] } as { profiles: unknown[] },
  /** Staleness the two gate reads report back; the fail-closed cases set these. */
  rosterStale: false,
  profilesStale: false,
  /** Roster the gate checks the viewer against. */
  roster: [{ username: "Aylin", uuid: "11111111-1111-1111-1111-111111111111", rank: "recruit" }],
  /** Backend history, or null when the backend could not be read. */
  history: null as GuildLevelHistoryResponse | null,
  /** Counts reads, so the gate can be shown to run before the history fetch. */
  historyReads: 0,
}));

vi.mock("$lib/server/guildStats", () => ({
  getGuildStats: async () => ({
    stale: H.rosterStale,
    generated_at: H.generatedAt,
    guild: H.guild,
    members: H.roster,
  }),
}));

vi.mock("$lib/server/rankProfiles", () => ({
  getLinkedRankProfiles: async () => H.profiles,
  getLinkedRankProfilesResult: async () => ({
    data: H.profiles,
    stale: H.profilesStale,
    updatedAt: Date.now(),
  }),
}));

// Stubbing the fetcher keeps the tracker's tests about the tracker: the request,
// its caching and its failure modes are covered in guildLevelHistory.test.ts.
vi.mock("$lib/server/guildLevelHistory", () => ({
  getGuildLevelHistory: async () => {
    H.historyReads += 1;
    return H.history;
  },
}));

// Imported after the mocks so the module binds the stubbed reads.
const { buildPayoutText, loadGuildLevelTracker } = await import("$lib/server/guildLevelTracker");

/** A profile granting the viewer a branch role at the given level. */
function profileWith(branch: string, level: string) {
  return {
    minecraft: { uuid: VIEWER_UUID },
    summary: { branches: [{ branch, level }] },
  };
}

const VIEWER = {
  discordId: "1",
  discordUsername: "aylin",
  minecraftUuid: VIEWER_UUID,
  minecraftUsername: "Aylin",
};

beforeEach(() => {
  H.guild = { level: 245, xp_percent: 12 };
  H.generatedAt = "2026-07-29T13:10:26.765Z";
  H.profiles = { profiles: [profileWith("development", "member")] };
  H.rosterStale = false;
  H.profilesStale = false;
  H.roster = [{ username: "Aylin", uuid: VIEWER_UUID, rank: "recruit" }];
  H.history = historyResponse(RECORDED_LEVEL_UPS);
  H.historyReads = 0;
});

describe("buildPayoutText", () => {
  it("reproduces the reference message with a four-decimal day gap", () => {
    const text = buildPayoutText([
      { level: 245, fromLevel: 244, reachedAt: "2026-07-29T01:45:24.811Z" },
      { level: 244, fromLevel: 243, reachedAt: "2026-07-26T17:45:23.605Z" },
    ]);

    expect(text).toBe(
      `# Level 245 Reached!
2.3333 days
<@&1030198924323078194> please contact me, <@420289176421007360>, <@581255561941614607>, <@894980597557100554>, <@261115988831895552> or <@366506301544726528> for your payout

0.5LE per raid`,
    );
  });

  it("has no window to pay out below two level-ups", () => {
    expect(buildPayoutText([])).toBeNull();
    expect(
      buildPayoutText([{ level: 245, fromLevel: 244, reachedAt: "2026-07-29T01:45:24.811Z" }]),
    ).toBeNull();
  });

  it("still quotes a gap measured from the oldest recorded row", () => {
    // `fromLevel: null` marks a row that may be a first observation rather than
    // an observed level-up, so this gap starts at "when tracking began" and runs
    // short. The message is built anyway - the tracker says so beside the button
    // rather than withholding the payout for the level-up that just happened.
    const text = buildPayoutText([
      { level: 245, fromLevel: 244, reachedAt: "2026-07-29T01:45:24.811Z" },
      { level: 244, fromLevel: null, reachedAt: "2026-07-26T17:45:23.605Z" },
    ]);

    expect(text).toContain("# Level 245 Reached!");
    expect(text).toContain("2.3333 days");
  });
});

describe("loadGuildLevelTracker", () => {
  it("serves a full member of a gated branch", async () => {
    const tracker = await loadGuildLevelTracker(fetch, VIEWER);

    expect(tracker?.current).toEqual({
      level: 245,
      xpPercent: 12,
      observedAt: "2026-07-29T13:10:26.765Z",
    });
    expect(tracker?.history[0]?.level).toBe(245);
    expect(tracker?.payoutText).toContain("# Level 245 Reached!");
  });

  it("serves a Community member too", async () => {
    H.profiles = { profiles: [profileWith("community", "member")] };

    expect(await loadGuildLevelTracker(fetch, VIEWER)).not.toBeNull();
  });

  it("denies anonymous viewers", async () => {
    expect(await loadGuildLevelTracker(fetch, null)).toBeNull();
  });

  it("denies a trainee of a gated branch", async () => {
    H.profiles = { profiles: [profileWith("development", "trainee")] };

    expect(await loadGuildLevelTracker(fetch, VIEWER)).toBeNull();
  });

  it("denies a member of an ungated branch", async () => {
    H.profiles = { profiles: [profileWith("warring", "member")] };

    expect(await loadGuildLevelTracker(fetch, VIEWER)).toBeNull();
  });

  it("denies a branch member who has left the guild", async () => {
    H.roster = [
      { username: "Someone", uuid: "99999999-9999-9999-9999-999999999999", rank: "recruit" },
    ];

    expect(await loadGuildLevelTracker(fetch, VIEWER)).toBeNull();
  });

  it("fails closed when the roster read is stale", async () => {
    H.rosterStale = true;

    expect(await loadGuildLevelTracker(fetch, VIEWER)).toBeNull();
  });

  it("fails closed when the profile read is stale", async () => {
    H.profilesStale = true;

    expect(await loadGuildLevelTracker(fetch, VIEWER)).toBeNull();
  });

  it("does not read the history for a viewer the gate denies", async () => {
    H.profiles = { profiles: [profileWith("development", "trainee")] };

    await loadGuildLevelTracker(fetch, VIEWER);

    expect(H.historyReads).toBe(0);
  });

  it("turns the backend's ascending entries into a newest-first history", async () => {
    H.history = historyResponse([
      ...TWO_LEVEL_UPS,
      { level: 246, observed_at: "2026-08-01T09:00:00.000Z" },
    ]);

    const tracker = await loadGuildLevelTracker(fetch, VIEWER);

    expect(tracker?.history).toEqual([
      { level: 246, fromLevel: 245, reachedAt: "2026-08-01T09:00:00.000Z" },
      { level: 245, fromLevel: 244, reachedAt: "2026-07-29T01:45:24.811Z" },
      { level: 244, fromLevel: null, reachedAt: "2026-07-26T17:45:23.605Z" },
    ]);
  });

  it("takes the current level and XP from the guild stats, not the history payload", async () => {
    H.guild = { level: 246, xp_percent: 37 };
    // The backend snapshots every ten minutes, so its view of "current" lags.
    H.history = historyResponse(TWO_LEVEL_UPS);

    const tracker = await loadGuildLevelTracker(fetch, VIEWER);

    expect(tracker?.current).toEqual({
      level: 246,
      xpPercent: 37,
      observedAt: "2026-07-29T13:10:26.765Z",
    });
  });

  it("has no payout message until the backend has recorded two level-ups", async () => {
    H.history = historyResponse([{ level: 245, observed_at: "2026-07-29T01:45:24.811Z" }]);

    const tracker = await loadGuildLevelTracker(fetch, VIEWER);

    expect(tracker?.history).toHaveLength(1);
    expect(tracker?.payoutText).toBeNull();
  });

  it("has a payout message as soon as the backend has recorded two rows", async () => {
    // The older row is a first observation, so the quoted window runs short -
    // this is the shape of the live backend right after tracking begins, and the
    // buttons have to work in it rather than wait for a third row.
    H.history = historyResponse(TWO_LEVEL_UPS);

    const tracker = await loadGuildLevelTracker(fetch, VIEWER);

    expect(tracker?.history).toHaveLength(2);
    expect(tracker?.history[1]?.fromLevel).toBeNull();
    expect(tracker?.payoutText).toContain("# Level 245 Reached!");
  });

  it("shows an empty history when the backend has recorded no level change", async () => {
    H.history = historyResponse([]);

    const tracker = await loadGuildLevelTracker(fetch, VIEWER);

    expect(tracker?.history).toEqual([]);
    expect(tracker?.payoutText).toBeNull();
  });

  it("hides the section when the history cannot be read", async () => {
    H.history = null;

    expect(await loadGuildLevelTracker(fetch, VIEWER)).toBeNull();
  });
});
