import { describe, expect, it } from "vitest";

import { parseGuildEvent } from "$lib/events/validate";

const VALID = {
  slug: "test-event",
  name: "Test Event",
  tagline: "Testing.",
  access: "public",
  theme: {
    sky: ["#171120", "#251B38"],
    accent: "#a78bfa",
    accentSecondary: "#8fb2f0",
    star: "#c4b5fd",
  },
};

const RAFFLE = { id: "r1", prize: "Mythic", winnerCount: 1, perTicket: 3 };

function withEligibility(eligibility: unknown) {
  return { ...VALID, raffles: [{ ...RAFFLE, eligibility }] };
}

function expectError(value: unknown, fragment: string) {
  const result = parseGuildEvent(value);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(fragment);
}

describe("raffle eligibility parsing", () => {
  it("keeps a legacy raffle without eligibility byte-identical", () => {
    const result = parseGuildEvent({ ...VALID, raffles: [RAFFLE] });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.event.raffles?.[0]).toEqual(RAFFLE);
  });

  it("round-trips a full eligibility block", () => {
    const eligibility = {
      include: [{ player_uuid: "uuid-a", username: "Alice", tickets: 3 }],
      exclude: [{ player_uuid: "uuid-b", username: "Bob" }],
      rules: [
        { type: "guildRank", ranks: ["chief", "strategist"] },
        { type: "seqRank", ranks: ["Druid", "Treant"] },
        {
          type: "stat",
          stat: "raids",
          min: 10,
          window: { from: "2026-07-01T00:00:00Z", to: "2026-07-15T00:00:00Z" },
        },
      ],
      weight: {
        mode: "perStat",
        stat: "playtime",
        per: 2,
        window: { from: "2026-07-01T00:00:00Z", to: "2026-07-15T00:00:00Z" },
      },
    };
    const result = parseGuildEvent(withEligibility(eligibility));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const parsed = result.event.raffles?.[0].eligibility;
    expect(parsed?.include).toEqual(eligibility.include);
    expect(parsed?.exclude).toEqual(eligibility.exclude);
    expect(parsed?.rules).toHaveLength(3);
    expect(parsed?.weight).toMatchObject({ mode: "perStat", stat: "playtime", per: 2 });
  });

  it("accepts flat and windowed per-raid weights", () => {
    const flat = parseGuildEvent(withEligibility({ weight: { mode: "flat" } }));
    expect(flat.ok).toBe(true);
    const perRaid = parseGuildEvent(
      withEligibility({
        weight: {
          mode: "perRaid",
          perTicket: 5,
          window: { from: "2026-07-01T00:00:00Z", to: "2026-07-15T00:00:00Z" },
        },
      }),
    );
    expect(perRaid.ok).toBe(true);
  });

  it("rejects unknown rule types, ranks, stats, and weight modes", () => {
    expectError(withEligibility({ rules: [{ type: "vibes" }] }), "unknown type");
    expectError(withEligibility({ rules: [{ type: "guildRank", ranks: ["emperor"] }] }), "unknown rank");
    expectError(withEligibility({ rules: [{ type: "guildRank", ranks: [] }] }), "at least one rank");
    expectError(
      withEligibility({
        rules: [{ type: "stat", stat: "luck", min: 1, window: { from: "2026-07-01T00:00:00Z", to: "2026-07-02T00:00:00Z" } }],
      }),
      "raids, playtime, or wars",
    );
    expectError(withEligibility({ weight: { mode: "lottery" } }), "unknown mode");
  });

  it("rejects duplicate manual entries", () => {
    expectError(
      withEligibility({
        include: [
          { player_uuid: "uuid-a", username: "Alice" },
          { player_uuid: "UUID-A", username: "Alice2" },
        ],
      }),
      "twice",
    );
  });

  it("cross-checks milestone rules against personal milestones", () => {
    const base = {
      ...VALID,
      personalMilestones: [{ id: "m1", at: 10, unlock: "Raffle entry" }],
    };
    const ok = parseGuildEvent({
      ...base,
      raffles: [{ ...RAFFLE, eligibility: { rules: [{ type: "milestone", milestoneId: "m1" }] } }],
    });
    expect(ok.ok).toBe(true);
    expectError(
      {
        ...base,
        raffles: [{ ...RAFFLE, eligibility: { rules: [{ type: "milestone", milestoneId: "ghost" }] } }],
      },
      "does not exist",
    );
  });

  it("allows zero tickets only on manually placed winners", () => {
    const manual = parseGuildEvent({
      ...VALID,
      raffles: [
        {
          ...RAFFLE,
          winners: [{ slot: 0, username: "Alice", player_uuid: "uuid-a", tickets: 0, source: "manual" }],
        },
      ],
    });
    expect(manual.ok).toBe(true);
    if (manual.ok) expect(manual.event.raffles?.[0].winners?.[0].source).toBe("manual");
    expectError(
      {
        ...VALID,
        raffles: [
          { ...RAFFLE, winners: [{ slot: 0, username: "Alice", player_uuid: "uuid-a", tickets: 0 }] },
        ],
      },
      "tickets",
    );
    expectError(
      {
        ...VALID,
        raffles: [
          {
            ...RAFFLE,
            winners: [{ slot: 0, username: "Alice", player_uuid: "uuid-a", tickets: 1, source: "lucky" }],
          },
        ],
      },
      "unknown source",
    );
  });

  it("parses a stored production-shaped event verbatim (rollback safety)", () => {
    // A drawn, windowed, milestone-gated raffle exactly as pre-eligibility
    // code persisted it. If this ever fails, stored rows silently vanish
    // from listings - see eventStore.rowToStored.
    const stored = {
      ...VALID,
      access: "members",
      startsAt: "2026-06-01T00:00:00.000Z",
      endsAt: "2026-06-08T00:00:00.000Z",
      personalMilestones: [{ id: "pm-1", at: 15, unlock: "Raffle" }],
      tracker: { eventId: "evt-1", tracking: "mod" },
      raffleExcludeWinners: true,
      raffles: [
        {
          id: "raffle-1",
          prize: "1 stx LE",
          winnerCount: 2,
          perTicket: 5,
          window: { from: "2026-06-01T00:00:00.000Z", to: "2026-06-08T00:00:00.000Z" },
          winners: [{ slot: 0, username: "Alice", player_uuid: "uuid-a", tickets: 4 }],
          drawnAt: "2026-06-08T12:00:00.000Z",
          requiresMilestone: "pm-1",
        },
      ],
    };
    const result = parseGuildEvent(JSON.parse(JSON.stringify(stored)));
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.event.raffles?.[0]).toEqual(stored.raffles[0]);
  });
});

describe("round-five hardening", () => {
  it("accepts one-day stat windows and rejects inverted ones", () => {
    const oneDay = { from: "2026-07-01T00:00:00Z", to: "2026-07-01T00:00:00Z" };
    expect(
      parseGuildEvent(
        withEligibility({
          rules: [{ type: "stat", stat: "raids", min: 1, window: oneDay }],
          weight: { mode: "perStat", stat: "wars", per: 1, window: oneDay },
        }),
      ).ok,
    ).toBe(true);

    expectError(
      withEligibility({
        rules: [
          {
            type: "stat",
            stat: "raids",
            min: 1,
            window: { from: "2026-07-02T00:00:00Z", to: "2026-07-01T00:00:00Z" },
          },
        ],
      }),
      "end after it starts",
    );
  });

  it("requires UTC-midnight bounds on stat windows", () => {
    expectError(
      withEligibility({
        rules: [
          {
            type: "stat",
            stat: "raids",
            min: 1,
            window: { from: "2026-07-01T12:00:00Z", to: "2026-07-15T00:00:00Z" },
          },
        ],
      }),
      "UTC midnight",
    );
    expectError(
      withEligibility({
        weight: {
          mode: "perStat",
          stat: "wars",
          per: 1,
          window: { from: "2026-07-01T00:00:00Z", to: "2026-07-15T18:30:00Z" },
        },
      }),
      "UTC midnight",
    );
  });

  it("accepts 400 inclusive stat days and rejects 401", () => {
    const fourHundredDays = {
      from: "2026-01-01T00:00:00Z",
      to: "2027-02-04T00:00:00Z",
    };
    const fourHundredOneDays = { ...fourHundredDays, to: "2027-02-05T00:00:00Z" };

    expect(
      parseGuildEvent(
        withEligibility({
          rules: [{ type: "stat", stat: "raids", min: 1, window: fourHundredDays }],
          weight: { mode: "perStat", stat: "wars", per: 1, window: fourHundredDays },
        }),
      ).ok,
    ).toBe(true);
    expectError(
      withEligibility({
        rules: [{ type: "stat", stat: "raids", min: 1, window: fourHundredOneDays }],
      }),
      "at most 400 inclusive days",
    );
    expectError(
      withEligibility({
        weight: { mode: "perStat", stat: "wars", per: 1, window: fourHundredOneDays },
      }),
      "at most 400 inclusive days",
    );
  });

  it("caps manual ticket floors below overflow territory", () => {
    expectError(
      withEligibility({ include: [{ player_uuid: "uuid-a", username: "Alice", tickets: 1e308 }] }),
      "at most",
    );
  });
});
