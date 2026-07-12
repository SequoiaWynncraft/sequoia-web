import { describe, expect, it } from "vitest";

import { SEED_EVENTS } from "$lib/events/seed";
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
