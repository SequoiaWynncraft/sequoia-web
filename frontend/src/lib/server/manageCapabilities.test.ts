import { beforeEach, describe, expect, it, vi } from "vitest";

import { navManageVisible, resolveManageCapabilities } from "./manageCapabilities";
import { createBagshopClient } from "$lib/api/bagshop";
import { getGuildStats } from "./guildStats";
import type { Viewer } from "$lib/site/viewer";

vi.mock("./guildStats", () => ({ getGuildStats: vi.fn() }));
vi.mock("$lib/api/bagshop", () => ({ createBagshopClient: vi.fn() }));

const mockStats = vi.mocked(getGuildStats);
const mockClient = vi.mocked(createBagshopClient);

const UUID = "11111111-2222-3333-4444-555555555555";

// The staff flag is memoized per discordId at module level, so every case
// mints a fresh id to stay independent of its neighbours.
let nextId = 0;
function viewer(overrides: Partial<Viewer> = {}): Viewer {
  nextId += 1;
  return {
    discordId: `viewer-${nextId}`,
    discordUsername: null,
    minecraftUuid: UUID,
    minecraftUsername: null,
    websiteAdmin: false,
    ...overrides,
  };
}

function rosterWith(rank: string, stale = false) {
  mockStats.mockResolvedValue({
    data: undefined,
    stale,
    members: [{ uuid: UUID, rank }],
  } as never);
}

function bagshopMe(result: { ok: true; staff: boolean } | { ok: false }) {
  mockClient.mockReturnValue({
    getMe: async () =>
      result.ok
        ? { ok: true, data: { minecraftUuid: UUID, staff: result.staff } }
        : { ok: false, error: { code: "network_error", message: "down" } },
  } as never);
}

const noFetch = (() => {
  throw new Error("unexpected fetch");
}) as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  rosterWith("recruit");
  bagshopMe({ ok: true, staff: false });
});

describe("resolveManageCapabilities", () => {
  it("is signin everywhere without a session, with zero upstream calls", async () => {
    expect(await resolveManageCapabilities(noFetch, null)).toEqual({
      events: "signin",
      bagshop: "signin",
    });
    expect(mockStats).not.toHaveBeenCalled();
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("grants events to a strategist and denies a non-staff member the bagshop", async () => {
    rosterWith("strategist");
    expect(await resolveManageCapabilities(fetch, viewer())).toEqual({
      events: "granted",
      bagshop: "denied",
    });
  });

  it("grants events to a website admin without consulting the roster rank", async () => {
    bagshopMe({ ok: true, staff: true });
    expect(await resolveManageCapabilities(fetch, viewer({ websiteAdmin: true }))).toEqual({
      events: "granted",
      bagshop: "granted",
    });
  });

  it("fails events closed to unverified on a stale roster", async () => {
    rosterWith("strategist", true);
    const caps = await resolveManageCapabilities(fetch, viewer());
    expect(caps.events).toBe("unverified");
  });

  it("maps an unreachable bagshop to unverified and retries next time", async () => {
    bagshopMe({ ok: false });
    const who = viewer();
    expect((await resolveManageCapabilities(fetch, who)).bagshop).toBe("unverified");
    // Failure evicted: the next resolution asks the bot again.
    bagshopMe({ ok: true, staff: true });
    expect((await resolveManageCapabilities(fetch, who)).bagshop).toBe("granted");
  });

  it("memoizes a settled staff answer per viewer", async () => {
    const who = viewer();
    await resolveManageCapabilities(fetch, who);
    await resolveManageCapabilities(fetch, who);
    expect(mockClient).toHaveBeenCalledTimes(1);
  });
});

describe("navManageVisible", () => {
  it("is false signed out and true for admins, with zero upstream calls", async () => {
    expect(await navManageVisible(noFetch, null)).toBe(false);
    expect(await navManageVisible(noFetch, viewer({ websiteAdmin: true }))).toBe(true);
  });

  it("is true for manager ranks off the stale-tolerant roster", async () => {
    rosterWith("chief");
    expect(await navManageVisible(fetch, viewer())).toBe(true);
    expect(mockStats).toHaveBeenCalledWith(fetch, { allowStale: true });
  });

  it("falls through to the staff flag for everyone else", async () => {
    bagshopMe({ ok: true, staff: true });
    expect(await navManageVisible(fetch, viewer())).toBe(true);
    bagshopMe({ ok: true, staff: false });
    expect(await navManageVisible(fetch, viewer())).toBe(false);
  });

  it("stays quiet when the roster read fails and the viewer is not staff", async () => {
    mockStats.mockRejectedValue(new Error("wynn down"));
    expect(await navManageVisible(fetch, viewer())).toBe(false);
  });
});
