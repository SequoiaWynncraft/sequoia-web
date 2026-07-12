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
    expectError({ ...VALID, goal: { metricLabel: "raids", target: 10, unlock: "Prize", feed: "wars" } }, "feed");
    expectError({ ...VALID, prizes: [{ donor: "kd" }] }, "prize");
    expectError({ ...VALID, comp: { roles: [] } }, "role");
    expectError({ ...VALID, tracker: { eventId: "abc", tracking: "webhook" } }, "tracking");
  });
});
