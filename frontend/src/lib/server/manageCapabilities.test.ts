import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  combineAccess,
  navManageVisible,
  pageAreaAccess,
  peekManageCapabilities,
} from "./manageCapabilities";
import { createBagshopClient } from "$lib/api/bagshop";
import { getGuildStats } from "./guildStats";
import { getLinkedRankProfilesResult } from "./rankProfiles";
import type { Viewer } from "$lib/site/viewer";

vi.mock("./guildStats", () => ({ getGuildStats: vi.fn() }));
vi.mock("./rankProfiles", () => ({ getLinkedRankProfilesResult: vi.fn() }));
vi.mock("$lib/api/bagshop", () => ({ createBagshopClient: vi.fn() }));

const mockStats = vi.mocked(getGuildStats);
const mockProfiles = vi.mocked(getLinkedRankProfilesResult);
const mockClient = vi.mocked(createBagshopClient);

const UUID = "11111111-2222-3333-4444-555555555555";
const UNDASHED = UUID.replaceAll("-", "");

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
  mockStats.mockResolvedValue({ stale, members: [{ uuid: UUID, rank }] } as never);
}

function branchesWith(branches: { branch: string; level: "member" | "trainee" }[]) {
  mockProfiles.mockResolvedValue({
    stale: false,
    updatedAt: 0,
    data: {
      source: { stale: false },
      profiles: [
        {
          minecraft: { uuid: UNDASHED },
          summary: {
            branches: branches.map((entry, index) => ({ key: `branch.${index}`, ...entry })),
          },
        },
      ],
    },
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
  branchesWith([]);
  bagshopMe({ ok: true, staff: false });
});

describe("peekManageCapabilities", () => {
  it("is signin everywhere without a session, with zero upstream calls", async () => {
    const capabilities = await peekManageCapabilities(noFetch, null);
    expect(Object.values(capabilities)).toHaveLength(6);
    expect(new Set(Object.values(capabilities))).toEqual(new Set(["signin"]));
    expect(mockStats).not.toHaveBeenCalled();
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("grants every branch area to a strategist, staff or not", async () => {
    rosterWith("strategist");
    expect(await peekManageCapabilities(fetch, viewer())).toEqual({
      events: "granted",
      treasury: "granted",
      military: "granted",
      community: "granted",
      endGame: "granted",
      development: "granted",
    });
  });

  it("grants a branch member their own area only", async () => {
    branchesWith([{ branch: "events", level: "member" }]);
    const capabilities = await peekManageCapabilities(fetch, viewer());
    expect(capabilities.events).toBe("granted");
    expect(capabilities.treasury).toBe("denied");
    expect(capabilities.development).toBe("denied");
  });

  it("resolves all six areas from one roster read and one profiles read", async () => {
    await peekManageCapabilities(fetch, viewer());
    expect(mockStats).toHaveBeenCalledTimes(1);
    expect(mockProfiles).toHaveBeenCalledTimes(1);
  });

  it("grants treasury to bot staff whose branch answer is denied or unknown", async () => {
    bagshopMe({ ok: true, staff: true });
    const capabilities = await peekManageCapabilities(fetch, viewer());
    expect(capabilities.treasury).toBe("granted");
    expect(capabilities.events).toBe("denied");

    // Even when the roster is down, a settled staff answer stands.
    mockStats.mockRejectedValue(new Error("wynn down"));
    bagshopMe({ ok: true, staff: true });
    const outage = await peekManageCapabilities(fetch, viewer());
    expect(outage.treasury).toBe("granted");
    expect(outage.events).toBe("unverified");
  });

  it("uses a stale roster for display-only navigation", async () => {
    rosterWith("strategist", true);
    const capabilities = await peekManageCapabilities(fetch, viewer());
    expect(capabilities.events).toBe("granted");
  });

  it("maps an unreachable bagshop to unverified and retries next time", async () => {
    bagshopMe({ ok: false });
    const who = viewer();
    expect((await peekManageCapabilities(fetch, who)).treasury).toBe("unverified");
    // Failure evicted: the next resolution asks the bot again.
    bagshopMe({ ok: true, staff: true });
    expect((await peekManageCapabilities(fetch, who)).treasury).toBe("granted");
  });

  it("keeps a completed roster when only the profiles half times out", async () => {
    rosterWith("strategist");
    mockProfiles.mockReturnValue(new Promise(() => undefined) as never);
    const startedAt = Date.now();
    const capabilities = await peekManageCapabilities(fetch, viewer());
    expect(Date.now() - startedAt).toBeLessThan(1000);
    // Leadership reads from the roster alone; the lost profiles half must
    // not cost owners their Manage navigation for the render.
    expect(capabilities.events).toBe("granted");
    expect(capabilities.development).toBe("granted");
  });

  it("waits the bounded peek, not the full timeout, when the roster hangs", async () => {
    mockStats.mockReturnValue(new Promise(() => undefined) as never);
    mockProfiles.mockReturnValue(new Promise(() => undefined) as never);
    const startedAt = Date.now();
    const capabilities = await peekManageCapabilities(fetch, viewer());
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(capabilities.events).toBe("unverified");
  });
});

describe("pageAreaAccess", () => {
  it("asks the bot fresh for treasury gates while the sidebar rides the memo", async () => {
    const who = viewer();
    // Strict resolutions never reuse a cached staff answer - an allowlist
    // change applies on the next navigation, not after a TTL.
    await pageAreaAccess(fetch, who, "treasury");
    await pageAreaAccess(fetch, who, "treasury");
    expect(mockClient).toHaveBeenCalledTimes(2);
    // The display-only peek reuses the settled answer.
    mockClient.mockClear();
    await peekManageCapabilities(fetch, who);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("shares an in-flight sidebar staff peek with the strict treasury gate", async () => {
    let resolveMe!: (value: {
      ok: true;
      data: { minecraftUuid: string; staff: boolean };
    }) => void;
    mockClient.mockReturnValue({
      getMe: () => new Promise((resolve) => (resolveMe = resolve)),
    } as never);
    const who = viewer();

    const sidebar = peekManageCapabilities(fetch, who);
    const gate = pageAreaAccess(fetch, who, "treasury");
    expect(mockClient).toHaveBeenCalledTimes(1);

    resolveMe({ ok: true, data: { minecraftUuid: UUID, staff: true } });
    await expect(gate).resolves.toBe("granted");
    await expect(sidebar).resolves.toMatchObject({ treasury: "granted" });
  });

  it("keeps stale roster data out of the strict gates", async () => {
    rosterWith("strategist", true);
    expect(await pageAreaAccess(fetch, viewer(), "events")).toBe("unverified");
    expect(await pageAreaAccess(fetch, viewer(), "development")).toBe("unverified");
  });

  it("grants treasury staff without waiting out a hung roster", async () => {
    mockStats.mockReturnValue(new Promise(() => undefined) as never);
    mockProfiles.mockReturnValue(new Promise(() => undefined) as never);
    bagshopMe({ ok: true, staff: true });
    const startedAt = Date.now();
    expect(await pageAreaAccess(fetch, viewer(), "treasury")).toBe("granted");
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it("grants a treasury branch member without waiting out a hung bot", async () => {
    branchesWith([{ branch: "treasury", level: "member" }]);
    mockClient.mockReturnValue({ getMe: () => new Promise(() => undefined) } as never);
    const startedAt = Date.now();
    expect(await pageAreaAccess(fetch, viewer(), "treasury")).toBe("granted");
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it("never consults the bot for non-treasury areas", async () => {
    branchesWith([{ branch: "community", level: "member" }]);
    expect(await pageAreaAccess(fetch, viewer(), "community")).toBe("granted");
    expect(mockClient).not.toHaveBeenCalled();
  });
});

describe("combineAccess", () => {
  it("prefers granted, then unverified, then denied", () => {
    expect(combineAccess("denied", "granted")).toBe("granted");
    expect(combineAccess("unverified", "granted")).toBe("granted");
    expect(combineAccess("unverified", "denied")).toBe("unverified");
    expect(combineAccess("denied", "denied")).toBe("denied");
    expect(combineAccess("signin", "signin")).toBe("signin");
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

  it("stays hidden for a branch whose console has no content yet", async () => {
    branchesWith([{ branch: "end_game", level: "member" }]);
    expect(await navManageVisible(fetch, viewer())).toBe(false);
  });

  it("shows for a branch member whose area has content", async () => {
    branchesWith([{ branch: "treasury", level: "member" }]);
    expect(await navManageVisible(fetch, viewer())).toBe(true);
  });

  it("waits briefly for the staff flag but never the full bot timeout", async () => {
    bagshopMe({ ok: true, staff: true });
    expect(await navManageVisible(fetch, viewer())).toBe(true);
    bagshopMe({ ok: true, staff: false });
    expect(await navManageVisible(fetch, viewer())).toBe(false);

    // A hung bot costs the bounded peek, not STAFF_TIMEOUT_MS, and reads as
    // not-staff for this render.
    mockClient.mockReturnValue({ getMe: () => new Promise(() => undefined) } as never);
    const startedAt = Date.now();
    expect(await navManageVisible(fetch, viewer())).toBe(false);
    expect(Date.now() - startedAt).toBeLessThan(1000);
  });

  it("stays quiet when every display authority rejects the viewer", async () => {
    mockStats.mockRejectedValue(new Error("wynn down"));
    expect(await navManageVisible(fetch, viewer())).toBe(false);
  });

  it("still shows settled bagshop staff when the roster read fails", async () => {
    mockStats.mockRejectedValue(new Error("wynn down"));
    bagshopMe({ ok: true, staff: true });
    expect(await navManageVisible(fetch, viewer())).toBe(true);
  });

  it("checks bagshop independently when the roster read hangs", async () => {
    mockStats.mockReturnValue(new Promise(() => undefined) as never);
    mockProfiles.mockReturnValue(new Promise(() => undefined) as never);
    bagshopMe({ ok: true, staff: true });

    const startedAt = Date.now();
    expect(await navManageVisible(fetch, viewer())).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(mockClient).toHaveBeenCalledTimes(1);
  });
});
