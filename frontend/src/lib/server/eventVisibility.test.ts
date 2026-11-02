import { beforeEach, describe, expect, it, vi } from "vitest";

import type { GuildMemberStats } from "#lib/api/guildStats.js";
import type { GuildEvent } from "#lib/events/types.js";
import { checkBranchAreaWithRoster } from "#lib/server/branchAccess.js";
import {
  canSeeEvent,
  eventAudience,
  resolveEventAudience,
  visibilityTightened,
  type EventAudience,
} from "#lib/server/eventVisibility.js";
import type { Viewer } from "#lib/site/viewer.js";

vi.mock("#lib/server/branchAccess.js", () => ({ checkBranchAreaWithRoster: vi.fn() }));

const mockBranchArea = vi.mocked(checkBranchAreaWithRoster);

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
    expect(eventAudience(null, [rosterEntry("recruit")], false)).toBe("anonymous");
  });

  it("separates roster members from signed-in outsiders", () => {
    expect(eventAudience(VIEWER, [rosterEntry("recruit")], false)).toBe("member");
    expect(
      eventAudience(VIEWER, [rosterEntry("recruit", "99999999-9999-9999-9999-999999999999")], false),
    ).toBe("signedIn");
  });

  it("promotes whoever the event-manager rule granted, whatever their rank", () => {
    // The rule is broader than guild leadership: an Events-branch member or a
    // website admin manages events on an ordinary rank, and demoting them here
    // would hide the drafts their management actions still authorize.
    expect(eventAudience(VIEWER, [rosterEntry("recruit")], true)).toBe("manager");
    expect(eventAudience(VIEWER, [rosterEntry("captain")], false)).toBe("member");
  });

  it("keeps a manager whose roster could not be verified", () => {
    // Their grant never came from the roster, so losing it changes nothing.
    expect(eventAudience(VIEWER, null, true)).toBe("manager");
  });

  it("degrades to signedIn when the roster could not be verified", () => {
    // A null roster is the caller reporting a stale or failed refresh. Keeping
    // the membership would let a departure survive in cache as access.
    expect(eventAudience(VIEWER, null, false)).toBe("signedIn");
  });

  it("matches uuids across dash formats, as the two APIs disagree", () => {
    expect(
      eventAudience(VIEWER, [rosterEntry("recruit", VIEWER_UUID.replaceAll("-", ""))], false),
    ).toBe("member");
  });
});

describe("resolveEventAudience", () => {
  const noFetch = (() => {
    throw new Error("unexpected fetch");
  }) as unknown as typeof fetch;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("asks the events branch, so its answer matches the management gate", async () => {
    // A full Events-branch member on an ordinary guild rank manages events;
    // reading ranks alone would have called them a plain member.
    mockBranchArea.mockResolvedValue({ access: "granted", roster: [rosterEntry("recruit")] });

    await expect(resolveEventAudience(fetch, VIEWER)).resolves.toEqual({
      audience: "manager",
      roster: [rosterEntry("recruit")],
    });
    expect(mockBranchArea).toHaveBeenCalledWith(fetch, VIEWER, "events");
  });

  it("reads a denied branch answer as membership off the roster", async () => {
    mockBranchArea.mockResolvedValue({ access: "denied", roster: [rosterEntry("captain")] });

    await expect(resolveEventAudience(fetch, VIEWER)).resolves.toMatchObject({
      audience: "member",
    });
  });

  it("answers an anonymous viewer without any upstream read", async () => {
    await expect(resolveEventAudience(noFetch, null)).resolves.toEqual({
      audience: "anonymous",
      roster: null,
    });
    expect(mockBranchArea).not.toHaveBeenCalled();
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

describe("visibilityTightened", () => {
  const live = (event: GuildEvent) => ({ event, published: true });

  it("catches a published event dropped back to a draft", () => {
    expect(visibilityTightened(live(makeEvent()), { event: makeEvent(), published: false }, NOW)).toBe(
      true,
    );
  });

  it("catches a public event narrowed to members", () => {
    expect(
      visibilityTightened(live(makeEvent()), live(makeEvent({ access: "members" })), NOW),
    ).toBe(true);
  });

  it("catches a dated event whose dates are cleared back to tba", () => {
    // The transition a transition-by-transition predicate misses: the event
    // stays published and public, but "tba" makes it manager-only, so a
    // connected non-manager stage has to lose its feed here too.
    const cleared = makeEvent({ startsAt: undefined, endsAt: undefined });

    expect(visibilityTightened(live(makeEvent()), live(cleared), NOW)).toBe(true);
  });

  it("catches a member event losing just one of its dates", () => {
    const members = makeEvent({ access: "members" });

    expect(visibilityTightened(live(members), live({ ...members, endsAt: undefined }), NOW)).toBe(
      true,
    );
  });

  it("leaves a widening save alone", () => {
    const tba = makeEvent({ startsAt: undefined, endsAt: undefined });

    expect(visibilityTightened(live(makeEvent({ access: "members" })), live(makeEvent()), NOW)).toBe(
      false,
    );
    expect(visibilityTightened({ event: makeEvent(), published: false }, live(makeEvent()), NOW)).toBe(
      false,
    );
    expect(visibilityTightened(live(tba), live(makeEvent()), NOW)).toBe(false);
  });

  it("leaves an edit that changes nothing visible alone", () => {
    expect(visibilityTightened(live(makeEvent()), live(makeEvent({ tagline: "New." })), NOW)).toBe(
      false,
    );
  });

  it("does not call an edit between two drafts a tightening", () => {
    // Nobody but a manager could see either side, so there is no stream to cut.
    const draft = (event: GuildEvent) => ({ event, published: false });

    expect(visibilityTightened(draft(makeEvent()), draft(makeEvent({ access: "members" })), NOW)).toBe(
      false,
    );
  });

  it("judges both versions against the same now", () => {
    // An event that merely ended between saves is not a visibility change.
    const ended = makeEvent({ startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-01-02T00:00:00Z" });

    expect(visibilityTightened(live(ended), live(ended), NOW)).toBe(false);
  });
});
