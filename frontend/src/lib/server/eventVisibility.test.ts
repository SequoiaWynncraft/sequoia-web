import { describe, expect, it } from "vitest";

import type { GuildMemberStats } from "$lib/api/guildStats";
import type { GuildEvent } from "$lib/events/types";
import { canSeeEvent, eventAudience, type EventAudience } from "$lib/server/eventVisibility";
import type { Viewer } from "$lib/site/viewer";

const NOW = new Date("2026-07-10T00:00:00Z");
const VIEWER_UUID = "11111111-1111-1111-1111-111111111111";

const THEME = {
  sky: ["#000000", "#111111"] as [string, string],
  accent: "#ffffff",
  accentSecondary: "#eeeeee",
  star: "#dddddd",
};

const VIEWER = { discordId: "1", minecraftUuid: VIEWER_UUID } as Viewer;

/** A dated, public event - visible to the widest audience the rules allow. */
function makeEvent(overrides: Partial<GuildEvent> = {}): GuildEvent {
  return {
    slug: "test-event",
    name: "Test Event",
    tagline: "Testing.",
    access: "public",
    theme: THEME,
    startsAt: "2026-07-05T00:00:00Z",
    endsAt: "2026-07-19T23:59:59Z",
    ...overrides,
  };
}

function rosterEntry(rank: GuildMemberStats["rank"], uuid = VIEWER_UUID): GuildMemberStats {
  return { username: "Aylin", uuid, rank } as GuildMemberStats;
}

const EVERYONE: EventAudience[] = ["anonymous", "signedIn", "member", "manager"];

describe("eventAudience", () => {
  it("reads an anonymous viewer as anonymous", () => {
    expect(eventAudience(null, [rosterEntry("recruit")])).toBe("anonymous");
  });

  it("separates roster members from signed-in outsiders", () => {
    expect(eventAudience(VIEWER, [rosterEntry("recruit")])).toBe("member");
    expect(eventAudience(VIEWER, [rosterEntry("recruit", "99999999-9999-9999-9999-999999999999")])).toBe(
      "signedIn",
    );
  });

  it("promotes only the manager ranks", () => {
    expect(eventAudience(VIEWER, [rosterEntry("strategist")])).toBe("manager");
    expect(eventAudience(VIEWER, [rosterEntry("captain")])).toBe("member");
  });

  it("degrades to signedIn when the roster could not be verified", () => {
    // A null roster is the caller reporting a stale or failed refresh. Keeping
    // the membership would let a departure survive in cache as access.
    expect(eventAudience(VIEWER, null)).toBe("signedIn");
  });

  it("matches uuids across dash formats, as the two APIs disagree", () => {
    expect(eventAudience(VIEWER, [rosterEntry("recruit", VIEWER_UUID.replaceAll("-", ""))])).toBe(
      "member",
    );
  });
});

describe("canSeeEvent", () => {
  it("shows a live public event to every signed-in audience", () => {
    for (const audience of EVERYONE) {
      expect(canSeeEvent(makeEvent(), true, audience, NOW)).toBe(audience !== "anonymous");
    }
  });

  it("shows no event at all to an anonymous viewer", () => {
    const events = [makeEvent(), makeEvent({ access: "members" }), makeEvent({ startsAt: undefined })];
    for (const event of events) {
      expect(canSeeEvent(event, true, "anonymous", NOW)).toBe(false);
    }
  });

  it("keeps a member event from a signed-in outsider", () => {
    const event = makeEvent({ access: "members" });

    expect(canSeeEvent(event, true, "signedIn", NOW)).toBe(false);
    expect(canSeeEvent(event, true, "member", NOW)).toBe(true);
  });

  it("keeps an undated event with the managers until it is announced", () => {
    // No dates is `eventStatus` "tba": the structure exists, the announcement
    // has not happened, and the name alone would give it away.
    const tba = makeEvent({ startsAt: undefined, endsAt: undefined });

    expect(canSeeEvent(tba, true, "member", NOW)).toBe(false);
    expect(canSeeEvent(tba, true, "signedIn", NOW)).toBe(false);
    expect(canSeeEvent(tba, true, "manager", NOW)).toBe(true);
  });

  it("keeps drafts with the managers", () => {
    expect(canSeeEvent(makeEvent(), false, "member", NOW)).toBe(false);
    expect(canSeeEvent(makeEvent(), false, "manager", NOW)).toBe(true);
  });

  it("still shows a public event that has already ended", () => {
    // Past events stay on the hub; only "tba" is withheld by status.
    const ended = makeEvent({ startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-01-02T00:00:00Z" });

    expect(canSeeEvent(ended, true, "signedIn", NOW)).toBe(true);
  });

  it("lets a manager see everything", () => {
    const hidden = makeEvent({ access: "members", startsAt: undefined, endsAt: undefined });

    expect(canSeeEvent(hidden, false, "manager", NOW)).toBe(true);
  });
});
