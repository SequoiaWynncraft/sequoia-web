import { describe, expect, it } from "vitest";

import { homepageEvents } from "./helpers";
import type { GuildEvent } from "./types";
import { eventTeaser, homepageEvent, hubEvent, hubGoal, viewerEvent } from "./viewerEvent";
import { EXPECTED_VIEW, FIXTURE_EVENT, WINNER_UUID, expectOnlyRenderedEventData } from "./viewerEvent.fixture";

describe("viewerEvent", () => {
  it("keeps the presentation and drops editor and server configuration", () => {
    expect(viewerEvent(FIXTURE_EVENT)).toEqual(EXPECTED_VIEW);
    expectOnlyRenderedEventData(JSON.stringify(viewerEvent(FIXTURE_EVENT)));
  });

  it("holds back a winner whose wheel is still spinning", () => {
    const view = viewerEvent(FIXTURE_EVENT, { spinningSlots: ["raffle-1:0"] });

    expect(view.raffles?.[0].winners).toEqual([]);
    expect(JSON.stringify(view)).not.toContain(WINNER_UUID);
    expect(viewerEvent(FIXTURE_EVENT, { spinningSlots: ["raffle-1:1"] }).raffles?.[0].winners).toHaveLength(1);
  });

  it("does not copy fields it was not told about, at any depth", () => {
    const widened = structuredClone(FIXTURE_EVENT) as GuildEvent & Record<string, unknown>;
    widened.futureField = "x";
    Object.assign(widened.theme, { futureField: "x" });
    Object.assign(widened.icon!, { futureField: "x" });
    Object.assign(widened.goals![0], { futureField: "x" });
    Object.assign(widened.goals![0].milestones[0], { futureField: "x" });
    Object.assign(widened.prizes![0], { futureField: "x" });
    Object.assign(widened.raffles![0].winners![0], { futureField: "x" });

    for (const view of [viewerEvent(widened), eventTeaser(widened), hubEvent(widened), homepageEvent(widened)]) {
      expect(JSON.stringify(view)).not.toContain("futureField");
    }
  });

  it("omits optional fields that are not set instead of sending undefined keys", () => {
    const minimal: GuildEvent = { slug: "s", name: "n", tagline: "t", access: "members", theme: FIXTURE_EVENT.theme };
    expect(Object.keys(viewerEvent(minimal)).sort()).toEqual(["access", "name", "slug", "tagline", "theme"]);
    expect(Object.keys(hubEvent(minimal)).sort()).toEqual(["access", "name", "slug", "tagline", "theme"]);
  });

  it("limits a locked teaser to the hero copy", () => {
    expect(Object.keys(eventTeaser(FIXTURE_EVENT)).sort()).toEqual(
      ["about", "access", "endsAt", "icon", "name", "slug", "startsAt", "tagline", "theme"],
    );
  });
});

describe("hub and homepage views", () => {
  it("gives a hub band the meter fields of a public event's primary goal", () => {
    expect(hubEvent({ ...FIXTURE_EVENT, icon: { file: "band.png", placements: ["band"] } })).toEqual({
      slug: "fixture-event",
      name: "Fixture Event",
      tagline: "A synthetic event.",
      access: "public",
      theme: FIXTURE_EVENT.theme,
      icon: { file: "band.png", placements: ["band"] },
      startsAt: "2020-01-01T00:00:00Z",
      endsAt: "2099-01-01T00:00:00Z",
      goal: EXPECTED_VIEW.goals![0],
    });
    expectOnlyRenderedEventData(JSON.stringify(hubEvent(FIXTURE_EVENT)));
  });

  it("keeps a members-only goal and a non-band icon off the hub", () => {
    const band = hubEvent({ ...FIXTURE_EVENT, access: "members" });
    expect(band).not.toHaveProperty("goal");
    expect(band).not.toHaveProperty("icon");
    expect(hubGoal({ ...FIXTURE_EVENT, access: "members" })).toBeUndefined();
    expect(hubGoal(FIXTURE_EVENT)?.feed).toBe("raids");
  });

  it("gives a homepage card only what the card shows", () => {
    const listed = homepageEvents([{ event: FIXTURE_EVENT, published: true }], new Date("2030-01-01T00:00:00Z"));

    expect(listed).toEqual([
      {
        slug: "fixture-event",
        name: "Fixture Event",
        tagline: "A synthetic event.",
        theme: FIXTURE_EVENT.theme,
        startsAt: "2020-01-01T00:00:00Z",
        endsAt: "2099-01-01T00:00:00Z",
      },
    ]);
    expectOnlyRenderedEventData(JSON.stringify(listed));
  });
});
