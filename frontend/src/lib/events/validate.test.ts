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
});
