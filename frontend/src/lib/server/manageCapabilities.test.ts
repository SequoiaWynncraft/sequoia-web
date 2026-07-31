import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  navManageVisible,
  pageAreaAccess,
  peekManageCapabilities,
} from "./manageCapabilities";
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

describe("peekManageCapabilities", () => {
  it("is signin everywhere without a session, with zero upstream calls", async () => {
    expect(await peekManageCapabilities(noFetch, null)).toEqual({
      events: "signin",
      bagshop: "signin",
    });
    expect(mockStats).not.toHaveBeenCalled();
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("grants events to a strategist and denies a non-staff member the bagshop", async () => {
    rosterWith("strategist");
    expect(await peekManageCapabilities(fetch, viewer())).toEqual({
      events: "granted",
      bagshop: "denied",
    });
  });

  it("grants events to a website admin without consulting the roster rank", async () => {
    bagshopMe({ ok: true, staff: true });
    expect(await peekManageCapabilities(fetch, viewer({ websiteAdmin: true }))).toEqual({
      events: "granted",
      bagshop: "granted",
    });
  });

  it("uses a stale roster for display-only navigation", async () => {
    rosterWith("strategist", true);
    const caps = await peekManageCapabilities(fetch, viewer());
    expect(caps.events).toBe("granted");
  });

  it("maps an unreachable bagshop to unverified and retries next time", async () => {
    bagshopMe({ ok: false });
    const who = viewer();
    expect((await peekManageCapabilities(fetch, who)).bagshop).toBe("unverified");
    // Failure evicted: the next resolution asks the bot again.
    bagshopMe({ ok: true, staff: true });
    expect((await peekManageCapabilities(fetch, who)).bagshop).toBe("granted");
  });

  it("asks the bot fresh for gates while the navbar rides the memo", async () => {
    const who = viewer();
    // Strict resolutions never reuse a cached staff answer - an allowlist
    // change applies on the next navigation, not after a TTL.
    await pageAreaAccess(fetch, who, "bagshop");
    await pageAreaAccess(fetch, who, "bagshop");
    expect(mockClient).toHaveBeenCalledTimes(2);
    // The display-only navbar peek reuses the settled answer.
    mockClient.mockClear();
    await navManageVisible(fetch, who);
    expect(mockClient).not.toHaveBeenCalled();
  });

  it("shares an in-flight sidebar staff peek with the strict bagshop gate", async () => {
    let resolveMe!: (value: {
      ok: true;
      data: { minecraftUuid: string; staff: boolean };
    }) => void;
    mockClient.mockReturnValue({
      getMe: () => new Promise((resolve) => (resolveMe = resolve)),
    } as never);
    const who = viewer();

    const sidebar = peekManageCapabilities(fetch, who);
    const gate = pageAreaAccess(fetch, who, "bagshop");
    expect(mockClient).toHaveBeenCalledTimes(1);

    resolveMe({ ok: true, data: { minecraftUuid: UUID, staff: true } });
    await expect(gate).resolves.toBe("granted");
    await expect(sidebar).resolves.toMatchObject({ bagshop: "granted" });
  });

  it("keeps stale roster data out of the strict events gate", async () => {
    rosterWith("strategist", true);
    expect(await pageAreaAccess(fetch, viewer(), "events")).toBe("unverified");
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

  it("stays quiet when both display authorities reject the viewer", async () => {
    mockStats.mockRejectedValue(new Error("wynn down"));
    expect(await navManageVisible(fetch, viewer())).toBe(false);
  });

  it("still shows settled bagshop staff when the roster read fails", async () => {
    mockStats.mockRejectedValue(new Error("wynn down"));
    bagshopMe({ ok: true, staff: true });
    expect(await navManageVisible(fetch, viewer())).toBe(true);
  });

  it("checks bagshop independently when the roster read hangs", async () => {
    mockStats.mockReturnValue(new Promise(() => undefined));
    bagshopMe({ ok: true, staff: true });

    const startedAt = Date.now();
    expect(await navManageVisible(fetch, viewer())).toBe(true);
    expect(Date.now() - startedAt).toBeLessThan(1000);
    expect(mockClient).toHaveBeenCalledTimes(1);
  });
});
