import { describe, expect, it } from "vitest";

import { EVENTS, eventBySlug, eventStatus, hubGroups } from "$lib/events/registry";
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

describe("event registry", () => {
  it("has unique slugs", () => {
    const slugs = EVENTS.map((event) => event.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("looks up events by slug", () => {
    expect(eventBySlug("the-nameless-hunt")?.name).toBe("The Nameless Hunt");
    expect(eventBySlug("no-such-event")).toBeUndefined();
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
    const groups = hubGroups(now);
    expect(groups.live.map((event) => event.slug)).toContain("grootslang-gauntlet");
    expect(groups.past.map((event) => event.slug)).toContain("colossus-sprint");

    const upcoming = groups.upcoming.map((event) => event.slug);
    expect(upcoming.indexOf("war-week")).toBeLessThan(upcoming.indexOf("the-nameless-hunt"));
  });
});
