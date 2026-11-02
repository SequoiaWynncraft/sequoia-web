import { describe, expect, it, vi } from "vitest";

import type { GuildEvent } from "#lib/events/types.js";
import type { Viewer } from "#lib/site/viewer.js";

/**
 * The event page's existence gate. The hub hides an event it may not list, but
 * the slug is guessable and shareable, so these cases assert the URL agrees
 * with the listing rather than serving what the hub withheld.
 */
const H = vi.hoisted(() => ({
  stored: null as { event: GuildEvent; published: boolean } | null,
  rosterStale: false,
}));

const MANAGER_UUID = "11111111-1111-1111-1111-111111111111";
const MEMBER_UUID = "22222222-2222-2222-2222-222222222222";
const OUTSIDER_UUID = "33333333-3333-3333-3333-333333333333";
/** On the roster at an ordinary rank, but a full member of the Events branch. */
const BRANCH_UUID = "44444444-4444-4444-4444-444444444444";

vi.mock("#lib/server/eventStore.js", () => ({
  eventStore: { get: async () => H.stored },
}));
vi.mock("#lib/server/guildStats.js", () => ({
  getGuildStats: async () => ({
    stale: H.rosterStale,
    members: [
      { username: "Chief", uuid: MANAGER_UUID, rank: "chief" },
      { username: "Member", uuid: MEMBER_UUID, rank: "recruit" },
      { username: "Organiser", uuid: BRANCH_UUID, rank: "recruit" },
    ],
  }),
}));
vi.mock("#lib/server/rankProfiles.js", () => ({
  getLinkedRankProfilesResult: async () => ({
    stale: false,
    updatedAt: 0,
    data: {
      source: { stale: false },
      profiles: [
        {
          minecraft: { uuid: BRANCH_UUID },
          summary: { branches: [{ key: "events.member", branch: "events", level: "member" }] },
        },
      ],
    },
  }),
  getLinkedRankProfiles: async () => ({ profiles: [] }),
  memberRanksByUuid: () => ({}),
}));

const { load } = await import("./+page.server");

const THEME = {
  sky: ["#000000", "#111111"] as [string, string],
  accent: "#ffffff",
  accentSecondary: "#eeeeee",
  star: "#dddddd",
};

/** An event that is upcoming as of `NOW`, so no feed or board reads are made. */
function makeEvent(overrides: Partial<GuildEvent> = {}): GuildEvent {
  return {
    slug: "test-event",
    name: "Test Event",
    tagline: "Testing.",
    access: "public",
    theme: THEME,
    startsAt: "2099-01-01T00:00:00Z",
    endsAt: "2099-01-14T00:00:00Z",
    ...overrides,
  };
}

function viewerFor(uuid: string, overrides: Partial<Viewer> = {}): Viewer {
  return {
    discordId: "1",
    discordUsername: "tester",
    minecraftUuid: uuid,
    minecraftUsername: "Tester",
    websiteAdmin: false,
    ...overrides,
  };
}

/** Invokes the route's load with a stubbed `parent()` carrying the viewer. */
function loadPage(viewer: Viewer | null) {
  return (load as unknown as (event: unknown) => Promise<{ event: GuildEvent }>)({
    fetch,
    // The rejections are `error()` throws, which carry the request id from
    // locals - without it the gate would fail on the way to reporting itself.
    locals: { requestId: "test-request" },
    params: { slug: "test-event" },
    parent: async () => ({ viewer }),
  });
}

async function statusOfLoad(viewer: Viewer | null): Promise<number> {
  try {
    await loadPage(viewer);
    return 200;
  } catch (thrown) {
    return (thrown as { status?: number }).status ?? 500;
  }
}

describe("event page existence gate", () => {
  it("404s an anonymous visitor holding the slug of a published public event", async () => {
    H.stored = { event: makeEvent(), published: true };
    H.rosterStale = false;
    expect(await statusOfLoad(null)).toBe(404);
  });

  it("serves a published public event to a signed-in member", async () => {
    H.stored = { event: makeEvent(), published: true };
    H.rosterStale = false;
    const data = await loadPage(viewerFor(MEMBER_UUID));
    expect(data.event.slug).toBe("test-event");
  });

  it("404s a non-manager on a published event that still has no dates", async () => {
    H.stored = {
      event: makeEvent({ startsAt: undefined, endsAt: undefined }),
      published: true,
    };
    H.rosterStale = false;
    expect(await statusOfLoad(viewerFor(MEMBER_UUID))).toBe(404);
    expect(await statusOfLoad(viewerFor(MANAGER_UUID))).toBe(200);
  });

  it("keeps drafts to managers", async () => {
    H.stored = { event: makeEvent(), published: false };
    H.rosterStale = false;
    expect(await statusOfLoad(viewerFor(MEMBER_UUID))).toBe(404);
    expect(await statusOfLoad(viewerFor(MANAGER_UUID))).toBe(200);
  });

  it("404s a signed-in non-member on a member-only event", async () => {
    H.stored = { event: makeEvent({ access: "members" }), published: true };
    H.rosterStale = false;
    expect(await statusOfLoad(viewerFor(OUTSIDER_UUID))).toBe(404);
    expect(await statusOfLoad(viewerFor(MEMBER_UUID))).toBe(200);
  });

  it("fails closed on a member-only event when the roster read is stale", async () => {
    // A stale roster outlives the departure that should have closed access, so
    // even a real member is turned away rather than authorized from it.
    H.stored = { event: makeEvent({ access: "members" }), published: true };
    H.rosterStale = true;
    expect(await statusOfLoad(viewerFor(MEMBER_UUID))).toBe(404);
  });

  it("previews drafts and undated events to every event manager, not just leadership", async () => {
    // The management console grants the Events branch and website admins the
    // same actions as leadership; a gate that read guild ranks alone would 404
    // the very previews those actions authorize.
    H.rosterStale = false;
    const admin = viewerFor(OUTSIDER_UUID, { websiteAdmin: true });

    H.stored = { event: makeEvent(), published: false };
    expect(await statusOfLoad(viewerFor(BRANCH_UUID))).toBe(200);
    expect(await statusOfLoad(admin)).toBe(200);

    H.stored = { event: makeEvent({ startsAt: undefined, endsAt: undefined }), published: true };
    expect(await statusOfLoad(viewerFor(BRANCH_UUID))).toBe(200);
    expect(await statusOfLoad(admin)).toBe(200);
  });

  it("404s an unknown slug", async () => {
    H.stored = null;
    expect(await statusOfLoad(viewerFor(MEMBER_UUID))).toBe(404);
  });
});
