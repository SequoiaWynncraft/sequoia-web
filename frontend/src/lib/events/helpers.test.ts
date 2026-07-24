import { describe, expect, it } from "vitest";

import { eventHubView, eventStatus, hubGroups } from "$lib/events/helpers";
import { SEED_EVENTS } from "$lib/events/seed";
import type { GuildEvent } from "$lib/events/types";

const THEME = {
  sky: ["#000000", "#111111"] as [string, string],
  accent: "#ffffff",
  accentSecondary: "#eeeeee",
  star: "#dddddd",
};

function makeEvent(overrides: Partial<GuildEvent>): GuildEvent {
  return {
    slug: "test-event",
    name: "Test Event",
    tagline: "Testing.",
    access: "public",
    theme: THEME,
    ...overrides,
  };
}

describe("event helpers", () => {
  it("seeds unique slugs", () => {
    const slugs = SEED_EVENTS.map((event) => event.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("derives status from the event window", () => {
    const event = makeEvent({
      startsAt: "2026-07-05T00:00:00Z",
      endsAt: "2026-07-19T23:59:59Z",
    });
    expect(eventStatus(event, new Date("2026-07-04T23:59:59Z"))).toBe("upcoming");
    expect(eventStatus(event, new Date("2026-07-05T00:00:00Z"))).toBe("live");
    expect(eventStatus(event, new Date("2026-07-19T23:59:59Z"))).toBe("live");
    expect(eventStatus(event, new Date("2026-07-20T00:00:00Z"))).toBe("ended");
  });

  it("treats undated events as TBA", () => {
    expect(eventStatus(makeEvent({}), new Date("2026-07-11T00:00:00Z"))).toBe("tba");
  });

  it("groups the hub with dated upcoming events before TBA entries", () => {
    const now = new Date("2026-07-11T12:00:00Z");
    const groups = hubGroups(SEED_EVENTS, now);
    expect(groups.live.map((event) => event.slug)).toContain("grootslang-gauntlet");
    expect(groups.past.map((event) => event.slug)).toContain("colossus-sprint");

    const upcoming = groups.upcoming.map((event) => event.slug);
    expect(upcoming.indexOf("lsto-article-5")).toBeLessThan(upcoming.indexOf("the-nameless-hunt"));
  });

  it("does not expose gated member details in hub entries", () => {
    const event = makeEvent({
      access: "members",
      about: ["Public hero copy"],
      goals: [{ metricLabel: "raids", milestones: [{ at: 10, unlock: "Prize" }] }],
      prizes: [{ donor: "member", prize: "Secret prize" }],
      rules: ["Secret rule"],
    });

    expect(eventHubView(event)).toEqual({
      slug: event.slug,
      name: event.name,
      tagline: event.tagline,
      access: event.access,
      theme: event.theme,
      startsAt: undefined,
      endsAt: undefined,
    });
  });
});
