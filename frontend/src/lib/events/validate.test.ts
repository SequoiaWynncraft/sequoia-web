import { describe, expect, it } from "vitest";

import { SEED_EVENTS } from "$lib/events/seed";
import { ICON_PLACEMENTS, parseGuildEvent } from "$lib/events/validate";

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

function expectError(value: unknown, fragment: string) {
  const result = parseGuildEvent(value);
  expect(result.ok).toBe(false);
  if (!result.ok) expect(result.error).toContain(fragment);
}

describe("parseGuildEvent", () => {
  it("accepts every seed event, only normalizing instants", () => {
    for (const event of SEED_EVENTS) {
      const result = parseGuildEvent(JSON.parse(JSON.stringify(event)));
      expect(result).toEqual({
        ok: true,
        event: {
          ...event,
          startsAt: event.startsAt ? new Date(event.startsAt).toISOString() : undefined,
          endsAt: event.endsAt ? new Date(event.endsAt).toISOString() : undefined,
        },
      });
    }
  });

  it("canonicalizes colors, whitespace, and instants", () => {
    const result = parseGuildEvent({
      ...VALID,
      name: "  Test Event  ",
      startsAt: "2026-07-05T02:00:00+02:00",
      endsAt: "2026-07-19T23:59:59Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.name).toBe("Test Event");
    expect(result.event.theme.sky[1]).toBe("#251b38");
    expect(result.event.startsAt).toBe("2026-07-05T00:00:00.000Z");
  });

  it("drops unknown fields and empty optional sections", () => {
    const result = parseGuildEvent({ ...VALID, secret: "x", rules: [], prizesNote: "  " });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event).toEqual({
      ...VALID,
      theme: { ...VALID.theme, sky: ["#171120", "#251b38"] },
    });
  });

  it("keeps the donor player link when present", () => {
    const result = parseGuildEvent({
      ...VALID,
      prizes: [
        { donor: "kd", prize: "5 stx LE", donorPlayer: " KDGamer " },
        { donor: "hmar", prize: "5 stx LE" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.prizes?.[0].donorPlayer).toBe("KDGamer");
    expect(result.event.prizes?.[1].donorPlayer).toBeUndefined();
  });

  it("accepts multi-source goals and chart configs", () => {
    const wars = parseGuildEvent({
      ...VALID,
      goals: [{ metricLabel: "wars", milestones: [{ at: 500, unlock: "War chest" }], feed: "wars" }],
      activity: { source: "raids", countRaid: "The Nameless Anomaly" },
    });
    expect(wars.ok).toBe(true);
    if (!wars.ok) return;
    expect(wars.event.goals?.[0].feed).toBe("wars");
    expect(wars.event.activity).toEqual({ source: "raids", countRaid: "The Nameless Anomaly" });

    const hidden = parseGuildEvent({ ...VALID, activity: { source: "none" } });
    expect(hidden.ok).toBe(true);
    if (hidden.ok) expect(hidden.event.activity).toEqual({ source: "none" });

    const runs = parseGuildEvent({
      ...VALID,
      goals: [
        {
          metricLabel: "TNA runs",
          milestones: [{ at: 900, unlock: "Raffle" }],
          feed: "raidRuns",
          countRaid: "The Nameless Anomaly",
        },
      ],
      activity: { source: "raidRuns", countRaid: "The Nameless Anomaly" },
    });
    expect(runs.ok).toBe(true);
    if (runs.ok) {
      expect(runs.event.goals?.[0].feed).toBe("raidRuns");
      expect(runs.event.activity?.source).toBe("raidRuns");
    }

    const points = parseGuildEvent({
      ...VALID,
      goals: [{ metricLabel: "war points", milestones: [{ at: 5000, unlock: "War chest" }], feed: "warPoints" }],
    });
    expect(points.ok).toBe(true);
    if (points.ok) expect(points.event.goals?.[0].feed).toBe("warPoints");
  });

  it("accepts a catalog icon and normalizes its placements", () => {
    const result = parseGuildEvent({
      ...VALID,
      icon: { file: "raid_icon_tna_transparent.png", placements: ["meta", "hero", "hero"] },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Duplicates drop and the order becomes canonical.
    expect(result.event.icon).toEqual({
      file: "raid_icon_tna_transparent.png",
      placements: ["hero", "meta"],
    });
  });

  it("accepts every known icon placement", () => {
    const result = parseGuildEvent({
      ...VALID,
      icon: {
        file: "raid_icon_tna_transparent.png",
        // Derived from the catalog so a future placement cannot dodge this test.
        placements: [...ICON_PLACEMENTS].reverse(),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.event.icon?.placements).toEqual(ICON_PLACEMENTS);
    }
  });

  it("rejects icons outside the catalog or with unknown placements", () => {
    expectError(
      { ...VALID, icon: { file: "raid_icon_fake.png", placements: ["hero"] } },
      "raid-icon catalog",
    );
    expectError(
      { ...VALID, icon: { file: "raid_icon_tcc_transparent.png", placements: ["footer"] } },
      "hero, band, meta, or manage",
    );
    expectError(
      { ...VALID, icon: { file: "raid_icon_tcc_transparent.png", placements: [] } },
      "at least one placement",
    );
    expectError({ ...VALID, icon: { placements: ["hero"] } }, "icon file");
  });

  it("keeps a known wheel style and silently drops an unknown one", () => {
    const parsed = parseGuildEvent({
      ...VALID,
      raffles: [
        { id: "r1", prize: "LE", winnerCount: 1, perTicket: 1, wheelStyle: "names" },
        { id: "r2", prize: "LE", winnerCount: 1, perTicket: 1, wheelStyle: "confetti" },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.event.raffles?.[0].wheelStyle).toBe("names");
      expect(parsed.event.raffles?.[1].wheelStyle).toBeUndefined();
    }
  });

  it("keeps a catalog prize icon and silently drops an unknown one", () => {
    const parsed = parseGuildEvent({
      ...VALID,
      raffles: [
        { id: "r1", prize: "LE", winnerCount: 1, perTicket: 1, icon: "le.svg" },
        { id: "r2", prize: "??", winnerCount: 1, perTicket: 1, icon: "not-in-catalog.svg" },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.event.raffles?.[0].icon).toBe("le.svg");
      // Cosmetic field: never a reason to reject a stored event row.
      expect(parsed.event.raffles?.[1].icon).toBeUndefined();
    }
  });

  it("round-trips a whitelist-only raffle and rejects an empty whitelist", () => {
    const parsed = parseGuildEvent({
      ...VALID,
      raffles: [
        {
          id: "r1", prize: "LE", winnerCount: 1, perTicket: 1,
          eligibility: { whitelistOnly: true, include: [{ player_uuid: "u1", username: "Zed" }] },
        },
      ],
    });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.event.raffles?.[0].eligibility?.whitelistOnly).toBe(true);
    expectError(
      {
        ...VALID,
        raffles: [
          { id: "r1", prize: "LE", winnerCount: 1, perTicket: 1, eligibility: { whitelistOnly: true } },
        ],
      },
      "whitelist-only but has more winners than surviving include-list members",
    );
    // Fully excluded whitelist: saves would only ever roll into an error.
    expectError(
      {
        ...VALID,
        raffles: [
          {
            id: "r1", prize: "LE", winnerCount: 1, perTicket: 1,
            eligibility: {
              whitelistOnly: true,
              include: [{ player_uuid: "AA-bb", username: "Zed" }],
              exclude: [{ player_uuid: "aabb", username: "Zed" }],
            },
          },
        ],
      },
      "more winners than surviving include-list members",
    );
    // A partially excluded whitelist with fewer surviving members than winner
    // slots would fail deterministically after drawing every survivor.
    expectError(
      {
        ...VALID,
        raffles: [
          {
            id: "r1", prize: "LE", winnerCount: 3, perTicket: 1,
            eligibility: {
              whitelistOnly: true,
              include: [
                { player_uuid: "u1", username: "Zed" },
                { player_uuid: "u2", username: "Yara" },
                { player_uuid: "u3", username: "Xena" },
              ],
              exclude: [{ player_uuid: "u1", username: "Zed" }],
            },
          },
        ],
      },
      "more winners than surviving include-list members",
    );
    // Partially excluded is fine when the surviving member count exactly
    // matches the winner count.
    const partial = parseGuildEvent({
      ...VALID,
      raffles: [
        {
          id: "r1", prize: "LE", winnerCount: 2, perTicket: 1,
          eligibility: {
            whitelistOnly: true,
            include: [
              { player_uuid: "u1", username: "Zed" },
              { player_uuid: "u2", username: "Yara" },
              { player_uuid: "u3", username: "Xena" },
            ],
            exclude: [{ player_uuid: "u1", username: "Zed" }],
          },
        },
      ],
    });
    expect(partial.ok).toBe(true);

    // Having more survivors than winner slots remains valid.
    const extra = parseGuildEvent({
      ...VALID,
      raffles: [
        {
          id: "r1", prize: "LE", winnerCount: 2, perTicket: 1,
          eligibility: {
            whitelistOnly: true,
            include: [
              { player_uuid: "u1", username: "Zed" },
              { player_uuid: "u2", username: "Yara" },
              { player_uuid: "u3", username: "Xena" },
            ],
          },
        },
      ],
    });
    expect(extra.ok).toBe(true);

    // Frozen winners already occupy slots, so only the remaining slots need
    // surviving whitelist members.
    const partiallyDrawn = parseGuildEvent({
      ...VALID,
      raffles: [
        {
          id: "r1", prize: "LE", winnerCount: 3, perTicket: 1,
          winners: [
            { slot: 0, username: "Zed", player_uuid: "u1", tickets: 1 },
            { slot: 1, username: "Yara", player_uuid: "u2", tickets: 1 },
          ],
          eligibility: {
            whitelistOnly: true,
            include: [{ player_uuid: "u3", username: "Xena" }],
          },
        },
      ],
    });
    expect(partiallyDrawn.ok).toBe(true);

    // One frozen winner leaves two slots, which one survivor cannot fill.
    expectError(
      {
        ...VALID,
        raffles: [
          {
            id: "r1", prize: "LE", winnerCount: 3, perTicket: 1,
            winners: [{ slot: 0, username: "Zed", player_uuid: "u1", tickets: 1 }],
            eligibility: {
              whitelistOnly: true,
              include: [{ player_uuid: "u2", username: "Yara" }],
            },
          },
        ],
      },
      "more winners than surviving include-list members",
    );
  });

  it("rejects overlapping whitelists that cannot fill every slot jointly", () => {
    const zed = { player_uuid: "u1", username: "Zed" };
    const yara = { player_uuid: "u2", username: "Yara" };
    const shared = (include: (typeof zed)[]) => ({ whitelistOnly: true, include });
    // Two one-slot whitelists sharing their ONLY member: each passes alone,
    // but whichever rolls second must fail - reject at save.
    expectError(
      {
        ...VALID,
        raffleExcludeWinners: true,
        raffles: [
          { id: "r1", prize: "A", winnerCount: 1, perTicket: 1, eligibility: shared([zed]) },
          { id: "r2", prize: "B", winnerCount: 1, perTicket: 1, eligibility: shared([zed]) },
        ],
      },
      "whitelist raffles overlap too much",
    );
    // Two members cover two slots even when both lists overlap fully.
    const feasible = parseGuildEvent({
      ...VALID,
      raffleExcludeWinners: true,
      raffles: [
        { id: "r1", prize: "A", winnerCount: 1, perTicket: 1, eligibility: shared([zed, yara]) },
        { id: "r2", prize: "B", winnerCount: 1, perTicket: 1, eligibility: shared([zed, yara]) },
      ],
    });
    expect(feasible.ok).toBe(true);
    // Without event-wide exclusion the pools are independent - no joint check.
    const independent = parseGuildEvent({
      ...VALID,
      raffles: [
        { id: "r1", prize: "A", winnerCount: 1, perTicket: 1, eligibility: shared([zed]) },
        { id: "r2", prize: "B", winnerCount: 1, perTicket: 1, eligibility: shared([zed]) },
      ],
    });
    expect(independent.ok).toBe(true);
  });

  it("counts other raffle winners as whitelist exclusions only when enabled", () => {
    const raffles = [
      {
        id: "r1",
        prize: "LE",
        winnerCount: 1,
        perTicket: 1,
        winners: [{ slot: 0, username: "Zed", player_uuid: "AA-bb", tickets: 1 }],
      },
      {
        id: "r2",
        prize: "Mythic",
        winnerCount: 1,
        perTicket: 1,
        eligibility: {
          whitelistOnly: true,
          include: [{ player_uuid: "aabb", username: "Zed" }],
        },
      },
    ];

    expectError(
      { ...VALID, raffleExcludeWinners: true, raffles },
      "too few eligible members after excluding other raffle winners",
    );
    expect(parseGuildEvent({ ...VALID, raffleExcludeWinners: false, raffles }).ok).toBe(true);
    expect(parseGuildEvent({ ...VALID, raffles }).ok).toBe(true);

    const partiallyDrawn = {
      id: "r2",
      prize: "Mythic",
      winnerCount: 3,
      perTicket: 1,
      winners: [
        { slot: 0, username: "Yara", player_uuid: "u2", tickets: 1 },
        { slot: 1, username: "Xena", player_uuid: "u3", tickets: 1 },
      ],
      eligibility: {
        whitelistOnly: true,
        include: [
          { player_uuid: "aabb", username: "Zed" },
          { player_uuid: "u4", username: "Willow" },
        ],
      },
    };
    expect(
      parseGuildEvent({ ...VALID, raffleExcludeWinners: true, raffles: [raffles[0], partiallyDrawn] }).ok,
    ).toBe(true);
    expectError(
      {
        ...VALID,
        raffleExcludeWinners: true,
        raffles: [raffles[0], { ...partiallyDrawn, winnerCount: 4 }],
      },
      "too few eligible members after excluding other raffle winners",
    );
  });


  it("normalizes the legacy single goal into a one-milestone goals list", () => {
    const result = parseGuildEvent({
      ...VALID,
      goal: { metricLabel: "guild raids", target: 2500, unlock: "Rank Up Raffle", feed: "raids" },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.goals).toEqual([
      {
        metricLabel: "guild raids",
        milestones: [{ at: 2500, unlock: "Rank Up Raffle" }],
        feed: "raids",
      },
    ]);
  });

  it("accepts several goals with ascending milestone tiers", () => {
    const result = parseGuildEvent({
      ...VALID,
      goals: [
        {
          metricLabel: "guild raids",
          milestones: [
            { at: 1000, unlock: "Giveaway" },
            { at: 2500, unlock: "Rank Up Raffle" },
          ],
          feed: "raids",
        },
        { metricLabel: "wars", milestones: [{ at: 300, unlock: "War chest" }], feed: "wars" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.goals?.length).toBe(2);
    expect(result.event.goals?.[0].milestones.length).toBe(2);
  });

  it("round-trips milestone marker labels and display style", () => {
    const result = parseGuildEvent({
      ...VALID,
      goals: [
        {
          metricLabel: "raids",
          milestoneStyle: "markers",
          milestones: [
            { at: 1000, unlock: "1.3x payout", label: "1.3x" },
            { at: 2500, unlock: "Rank raffle" },
          ],
        },
      ],
    });
    if (!result.ok) throw new Error(result.error);
    expect(result.event.goals?.[0].milestoneStyle).toBe("markers");
    expect(result.event.goals?.[0].milestones[0].label).toBe("1.3x");
    // Absent label and style stay absent - old events keep validating unchanged.
    expect(result.event.goals?.[0].milestones[1].label).toBeUndefined();

    expectError(
      {
        ...VALID,
        goals: [{ metricLabel: "raids", milestoneStyle: "bars", milestones: [{ at: 5, unlock: "A" }] }],
      },
      "milestone style",
    );
    expectError(
      {
        ...VALID,
        goals: [
          { metricLabel: "raids", milestones: [{ at: 5, unlock: "A", label: "x".repeat(25) }] },
        ],
      },
      "marker label",
    );
  });

  it("rejects out-of-order or duplicate milestone targets", () => {
    expectError(
      {
        ...VALID,
        goals: [
          {
            metricLabel: "raids",
            milestones: [
              { at: 2500, unlock: "A" },
              { at: 1000, unlock: "B" },
            ],
          },
        ],
      },
      "ascending",
    );
    expectError(
      {
        ...VALID,
        goals: [
          {
            metricLabel: "raids",
            milestones: [
              { at: 1000, unlock: "A" },
              { at: 1000, unlock: "B" },
            ],
          },
        ],
      },
      "ascending",
    );
    expectError({ ...VALID, goals: [{ metricLabel: "raids", milestones: [] }] }, "milestone");
    expectError(
      { ...VALID, goals: [{ metricLabel: "raids", milestones: [{ at: 5, unlock: " " }] }] },
      "unlock",
    );
  });

  it("round-trips ascending personal milestones with their ids", () => {
    const result = parseGuildEvent({
      ...VALID,
      personalMilestones: [
        { id: "m1", at: 10, unlock: "Bronze" },
        { id: "m2", at: 30, unlock: "Silver" },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.personalMilestones).toEqual([
      { id: "m1", at: 10, unlock: "Bronze" },
      { id: "m2", at: 30, unlock: "Silver" },
    ]);
  });

  it("accepts a full 64-milestone ladder", () => {
    const full = Array.from({ length: 64 }, (_, index) => ({
      id: `m${index}`,
      at: (index + 1) * 10,
      unlock: `Tier ${index}`,
    }));
    const result = parseGuildEvent({ ...VALID, personalMilestones: full });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.personalMilestones).toHaveLength(64);
  });

  it("rejects out-of-order, duplicate-id, or over-cap personal milestones", () => {
    expectError(
      {
        ...VALID,
        personalMilestones: [
          { id: "m1", at: 30, unlock: "A" },
          { id: "m2", at: 10, unlock: "B" },
        ],
      },
      "ascending",
    );
    expectError(
      {
        ...VALID,
        personalMilestones: [
          { id: "dup", at: 10, unlock: "A" },
          { id: "dup", at: 30, unlock: "B" },
        ],
      },
      "ids must be unique",
    );
    expectError(
      { ...VALID, personalMilestones: [{ at: 10, unlock: "A" }] },
      "id",
    );
    const overCap = Array.from({ length: 65 }, (_, index) => ({
      id: `m${index}`,
      at: (index + 1) * 10,
      unlock: `Tier ${index}`,
    }));
    expectError({ ...VALID, personalMilestones: overCap }, "at most 64 personal milestones");
  });

  it("gates a raffle on an existing personal milestone but rejects a dangling reference", () => {
    const ok = parseGuildEvent({
      ...VALID,
      personalMilestones: [{ id: "m1", at: 20, unlock: "Eligible" }],
      raffles: [{ id: "r1", prize: "x", winnerCount: 1, perTicket: 1, requiresMilestone: "m1" }],
    });
    expect(ok.ok).toBe(true);
    if (ok.ok) expect(ok.event.raffles?.[0].requiresMilestone).toBe("m1");

    expectError(
      {
        ...VALID,
        personalMilestones: [{ id: "m1", at: 20, unlock: "Eligible" }],
        raffles: [{ id: "r1", prize: "x", winnerCount: 1, perTicket: 1, requiresMilestone: "ghost" }],
      },
      "does not exist",
    );
    expectError(
      {
        ...VALID,
        raffles: [{ id: "r1", prize: "x", winnerCount: 1, perTicket: 1, requiresMilestone: "m1" }],
      },
      "does not exist",
    );
  });

  it("round-trips raffles, normalizing the window and carrying frozen winners", () => {
    const result = parseGuildEvent({
      ...VALID,
      raffleExcludeWinners: true,
      raffles: [
        {
          id: "r1",
          prize: " 5 stx LE ",
          winnerCount: 2,
          perTicket: 5,
          window: { from: "2026-08-01T00:00:00+02:00", to: "2026-08-08T00:00:00Z" },
          winners: [{ slot: 0, username: "Alice", player_uuid: "uuid-a", tickets: 4 }],
          drawnAt: "2026-08-08T12:00:00Z",
        },
      ],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.raffleExcludeWinners).toBe(true);
    const raffle = result.event.raffles?.[0];
    expect(raffle?.prize).toBe("5 stx LE");
    expect(raffle?.window?.from).toBe("2026-07-31T22:00:00.000Z");
    expect(raffle?.winners).toEqual([{ slot: 0, username: "Alice", player_uuid: "uuid-a", tickets: 4 }]);
    expect(raffle?.drawnAt).toBe("2026-08-08T12:00:00.000Z");
  });

  it("accepts a minimal undrawn raffle and drops the exclude flag when false", () => {
    const result = parseGuildEvent({
      ...VALID,
      raffleExcludeWinners: false,
      raffles: [{ id: "r1", prize: "Mythic", winnerCount: 1, perTicket: 3 }],
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.event.raffleExcludeWinners).toBeUndefined();
    expect(result.event.raffles?.[0].winners).toBeUndefined();
    expect(result.event.raffles?.[0].window).toBeUndefined();
  });

  it("rejects malformed raffles with a field-specific error", () => {
    expectError({ ...VALID, raffles: [{ prize: "x", winnerCount: 1, perTicket: 1 }] }, "id");
    expectError({ ...VALID, raffles: [{ id: "r1", winnerCount: 1, perTicket: 1 }] }, "prize");
    expectError(
      { ...VALID, raffles: [{ id: "r1", prize: "x", winnerCount: 0, perTicket: 1 }] },
      "winner count",
    );
    expectError(
      { ...VALID, raffles: [{ id: "r1", prize: "x", winnerCount: 1, perTicket: 0 }] },
      "per ticket",
    );
    expectError(
      {
        ...VALID,
        raffles: [
          {
            id: "r1",
            prize: "x",
            winnerCount: 1,
            perTicket: 1,
            window: { from: "2026-08-08T00:00:00Z", to: "2026-08-01T00:00:00Z" },
          },
        ],
      },
      "end after it starts",
    );
    expectError(
      {
        ...VALID,
        raffles: [
          {
            id: "r1",
            prize: "x",
            winnerCount: 1,
            perTicket: 1,
            window: { from: "2026-08-01T00:00", to: "2026-08-08T00:00:00Z" },
          },
        ],
      },
      "timezone",
    );
    expectError(
      {
        ...VALID,
        raffles: [
          {
            id: "r1",
            prize: "x",
            winnerCount: 1,
            perTicket: 1,
            winners: [{ slot: 1, username: "Alice", player_uuid: "uuid-a", tickets: 2 }],
          },
        ],
      },
      "out of range",
    );
    expectError(
      {
        ...VALID,
        raffles: [
          {
            id: "r1",
            prize: "x",
            winnerCount: 2,
            perTicket: 1,
            winners: [
              { slot: 0, username: "Alice", player_uuid: "uuid-a", tickets: 2 },
              { slot: 0, username: "Bob", player_uuid: "uuid-b", tickets: 1 },
            ],
          },
        ],
      },
      "same slot",
    );
    expectError(
      {
        ...VALID,
        raffles: [
          {
            id: "r1",
            prize: "x",
            winnerCount: 2,
            perTicket: 1,
            winners: [
              { slot: 0, username: "Alice", player_uuid: "uuid-a", tickets: 2 },
              { slot: 1, username: "Alice", player_uuid: "uuid-a", tickets: 2 },
            ],
          },
        ],
      },
      "same player",
    );
    expectError(
      {
        ...VALID,
        raffles: [
          { id: "dup", prize: "x", winnerCount: 1, perTicket: 1 },
          { id: "dup", prize: "y", winnerCount: 1, perTicket: 1 },
        ],
      },
      "ids must be unique",
    );
    expectError(
      {
        ...VALID,
        raffles: [
          {
            id: "r1",
            prize: "x",
            winnerCount: 1,
            perTicket: 1,
            winners: [{ slot: 0, username: "Alice", player_uuid: "uuid-a", tickets: 0 }],
          },
        ],
      },
      "winner tickets",
    );
    expectError(
      {
        ...VALID,
        raffleExcludeWinners: true,
        raffles: [
          {
            id: "r1",
            prize: "x",
            winnerCount: 1,
            perTicket: 1,
            winners: [{ slot: 0, username: "Alice", player_uuid: "uuid-a", tickets: 2 }],
          },
          {
            id: "r2",
            prize: "y",
            winnerCount: 1,
            perTicket: 1,
            winners: [{ slot: 0, username: "Alice", player_uuid: "uuid-a", tickets: 3 }],
          },
        ],
      },
      "more than one raffle",
    );
    expectError(
      {
        ...VALID,
        raffles: [
          { id: "r1", prize: "x", winnerCount: 1, perTicket: 1, window: { from: "2026-08-01T00:00:00Z" } },
        ],
      },
      "timezone",
    );
  });

  it("supports up to 50 raffles but rejects a 51st", () => {
    const raffle = (index: number) => ({
      id: `r${index}`,
      prize: "Mythic",
      winnerCount: 1,
      perTicket: 1,
    });
    const fifty = Array.from({ length: 50 }, (_, index) => raffle(index));
    const result = parseGuildEvent({ ...VALID, raffles: fifty });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.event.raffles?.length).toBe(50);

    const fiftyOne = Array.from({ length: 51 }, (_, index) => raffle(index));
    expectError({ ...VALID, raffles: fiftyOne }, "at most 50 raffles are supported");
  });

  it("rejects malformed input with a field-specific error", () => {
    expectError({ ...VALID, slug: "Bad Slug!" }, "slug");
    expectError({ ...VALID, slug: "manage" }, "reserved");
    expectError({ ...VALID, access: "secret" }, "access");
    expectError({ ...VALID, theme: { ...VALID.theme, accent: "purple" } }, "accent");
    expectError({ ...VALID, startsAt: "2026-07-05T00:00:00Z" }, "both dates");
    expectError({ ...VALID, startsAt: "2026-07-05T00:00", endsAt: "2026-07-06T00:00" }, "timezone");
    expectError(
      { ...VALID, startsAt: "2026-07-06T00:00:00Z", endsAt: "2026-07-05T00:00:00Z" },
      "end after it starts",
    );
    expectError({ ...VALID, goal: { metricLabel: "raids", target: 0, unlock: "Prize" } }, "target");
    expectError({ ...VALID, goal: { metricLabel: "raids", target: 10, unlock: "Prize", feed: "xp" } }, "feed");
    expectError(
      { ...VALID, goal: { metricLabel: "wars", target: 10, unlock: "Prize", feed: "wars", countRaid: "TNA" } },
      "raid-based feed",
    );
    expectError({ ...VALID, activity: { source: "wars" } }, "activity chart source");
    expectError({ ...VALID, activity: { source: "none", countRaid: "TNA" } }, "raid-based source");
    expectError({ ...VALID, prizes: [{ donor: "kd" }] }, "prize");
    expectError({ ...VALID, comp: { roles: [] } }, "role");
    expectError({ ...VALID, tracker: { eventId: "abc", tracking: "webhook" } }, "tracking");
  });

  it("accepts war-point trackers", () => {
    const result = parseGuildEvent({ ...VALID, tracker: { eventId: "abc", tracking: "wars" } });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.event.tracker).toEqual({ eventId: "abc", tracking: "wars" });
  });

  it("stores the wheel toggle only when hidden", () => {
    const hidden = parseGuildEvent({ ...VALID, raffleHideWheel: true });
    expect(hidden.ok).toBe(true);
    if (hidden.ok) expect(hidden.event.raffleHideWheel).toBe(true);
    // Anything but literal true - including false - stays absent, so old
    // events and sloppy payloads keep their wheel.
    const shown = parseGuildEvent({ ...VALID, raffleHideWheel: false });
    expect(shown.ok).toBe(true);
    if (shown.ok) expect(shown.event.raffleHideWheel).toBeUndefined();
  });
});
