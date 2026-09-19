import { describe, expect, it } from "vitest";

import { eventHubView, eventStatus, homepageEvents, hubGroups } from "$lib/events/helpers";
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

/** Wraps bare events as announced store entries - the common case. */
function published(events: GuildEvent[]): { event: GuildEvent; published: boolean }[] {
  return events.map((event) => ({ event, published: true }));
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
    const groups = hubGroups(published(SEED_EVENTS), now);
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

  it("flags unpublished entries so a manager can tell a draft from a live event", () => {
    const event = makeEvent({ startsAt: "2026-07-05T00:00:00Z", endsAt: "2026-07-19T23:59:59Z" });
    expect(eventHubView(event, false).draft).toBe(true);
    expect(eventHubView(event, true).draft).toBeUndefined();

    const now = new Date("2026-07-11T12:00:00Z");
    const groups = hubGroups([{ event, published: false }], now);
    expect(groups.live.map((entry) => entry.draft)).toEqual([true]);
  });

  it("picks running and next-day events for the homepage, live first, never drafts", () => {
    const now = new Date("2026-07-10T12:00:00Z");
    const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000).toISOString();
    const entries = [
      { event: makeEvent({ slug: "soon", startsAt: at(23), endsAt: at(48) }), published: true },
      { event: makeEvent({ slug: "later", startsAt: at(25), endsAt: at(48) }), published: true },
      { event: makeEvent({ slug: "live", startsAt: at(-5), endsAt: at(5) }), published: true },
      { event: makeEvent({ slug: "ended", startsAt: at(-48), endsAt: at(-1) }), published: true },
      { event: makeEvent({ slug: "tba" }), published: true },
      { event: makeEvent({ slug: "draft", startsAt: at(1), endsAt: at(5) }), published: false },
    ];
    expect(homepageEvents(entries, now).map((event) => event.slug)).toEqual(["live", "soon"]);
  });
});
