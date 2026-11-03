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
    expect(eventAudience(VIEWER, [rosterEntry("recruit")], true)).toBe("manager");
    expect(eventAudience(VIEWER, [rosterEntry("captain")], false)).toBe("member");
  });

  it("keeps a manager whose roster could not be verified", () => {
    expect(eventAudience(VIEWER, null, true)).toBe("manager");
  });

  it("degrades to signedIn when the roster could not be verified", () => {
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
    const draft = (event: GuildEvent) => ({ event, published: false });

    expect(visibilityTightened(draft(makeEvent()), draft(makeEvent({ access: "members" })), NOW)).toBe(
      false,
    );
  });

  it("judges both versions against the same now", () => {
    const ended = makeEvent({ startsAt: "2026-01-01T00:00:00Z", endsAt: "2026-01-02T00:00:00Z" });

    expect(visibilityTightened(live(ended), live(ended), NOW)).toBe(false);
  });
});
