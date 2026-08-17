import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  branchAccessFrom,
  checkBranchArea,
  checkBranchAreaWithRoster,
  requireBranchArea,
} from "./branchAccess";
import { getGuildStats } from "./guildStats";
import { getLinkedRankProfilesResult } from "./rankProfiles";
import { loadViewer } from "./viewerSession";
import type { Viewer } from "$lib/site/viewer";

vi.mock("./guildStats", () => ({ getGuildStats: vi.fn() }));
vi.mock("./rankProfiles", () => ({ getLinkedRankProfilesResult: vi.fn() }));
vi.mock("./viewerSession", () => ({ loadViewer: vi.fn() }));

const mockStats = vi.mocked(getGuildStats);
const mockProfiles = vi.mocked(getLinkedRankProfilesResult);
const mockLoadViewer = vi.mocked(loadViewer);

const UUID = "11111111-2222-3333-4444-555555555555";
// The rank API strips dashes; sameUuid must bridge the two formats.
const UNDASHED = UUID.replaceAll("-", "");

function viewer(overrides: Partial<Viewer> = {}): Viewer {
  return {
    discordId: "viewer-1",
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

function profilesWith(
  branches: { branch: string; level: "member" | "trainee" }[],
  options: { stale?: boolean; sourceStale?: boolean; linked?: boolean } = {},
) {
  mockProfiles.mockResolvedValue({
    stale: options.stale ?? false,
    updatedAt: 0,
    data: {
      source: { stale: options.sourceStale ?? false },
      profiles: [
        {
          minecraft: options.linked === false ? null : { uuid: UNDASHED },
          summary: {
            branches: branches.map((entry, index) => ({ key: `branch.${index}`, ...entry })),
          },
        },
      ],
    },
  } as never);
}

const noFetch = (() => {
  throw new Error("unexpected fetch");
}) as unknown as typeof fetch;

beforeEach(() => {
  vi.clearAllMocks();
  rosterWith("recruit");
  profilesWith([]);
});

describe("checkBranchArea", () => {
  it("is signin without a session and granted for admins, with zero upstream calls", async () => {
    expect(await checkBranchArea(noFetch, null, "treasury")).toBe("signin");
    expect(await checkBranchArea(noFetch, viewer({ websiteAdmin: true }), "treasury")).toBe(
      "granted",
    );
    expect(mockStats).not.toHaveBeenCalled();
    expect(mockProfiles).not.toHaveBeenCalled();
  });

  it("grants every branch to guild leadership without waiting on profiles", async () => {
    rosterWith("strategist");
    // A hung profile service must not delay a decision the roster settles.
    mockProfiles.mockReturnValue(new Promise(() => undefined) as never);
    expect(await checkBranchArea(fetch, viewer(), "treasury")).toBe("granted");
    expect(await checkBranchArea(fetch, viewer(), "military")).toBe("granted");
  });

  it("denies an off-roster viewer without waiting on profiles", async () => {
    mockStats.mockResolvedValue({ stale: false, members: [] } as never);
    mockProfiles.mockReturnValue(new Promise(() => undefined) as never);
    expect(await checkBranchArea(fetch, viewer(), "treasury")).toBe("denied");
  });

  it("grants a full branch member their own branch only", async () => {
    profilesWith([{ branch: "treasury", level: "member" }]);
    expect(await checkBranchArea(fetch, viewer(), "treasury")).toBe("granted");
    expect(await checkBranchArea(fetch, viewer(), "events")).toBe("denied");
  });

  it("denies a trainee the branch they are training in", async () => {
    profilesWith([{ branch: "development", level: "trainee" }]);
    expect(await checkBranchArea(fetch, viewer(), "development")).toBe("denied");
  });

  it("denies a branch role holder who left the guild roster", async () => {
    mockStats.mockResolvedValue({ stale: false, members: [] } as never);
    profilesWith([{ branch: "treasury", level: "member" }]);
    expect(await checkBranchArea(fetch, viewer(), "treasury")).toBe("denied");
  });

  it("fails closed to unverified on a structurally skewed profile", async () => {
    // The shared validator only checks the shallow shape; summary.branches
    // can be missing on a version-skewed payload and must not throw a 500
    // out of the access check.
    mockProfiles.mockResolvedValue({
      stale: false,
      updatedAt: 0,
      data: {
        source: { stale: false },
        profiles: [{ minecraft: { uuid: UNDASHED }, summary: {} }],
      },
    } as never);
    expect(await checkBranchArea(fetch, viewer(), "treasury")).toBe("unverified");
  });

  it("fails closed to unverified on malformed entries inside the branches array", async () => {
    mockProfiles.mockResolvedValue({
      stale: false,
      updatedAt: 0,
      data: {
        source: { stale: false },
        profiles: [
          {
            minecraft: { uuid: UNDASHED },
            // A null neighbour must not throw past an otherwise valid grant.
            summary: { branches: [null, { key: "b", branch: "treasury", level: "member" }] },
          },
        ],
      },
    } as never);
    expect(await checkBranchArea(fetch, viewer(), "treasury")).toBe("unverified");
  });

  it("denies a viewer whose rank profile is not linked to their account", async () => {
    profilesWith([{ branch: "treasury", level: "member" }], { linked: false });
    expect(await checkBranchArea(fetch, viewer(), "treasury")).toBe("denied");
  });

  it("fails closed to unverified on a stale roster", async () => {
    rosterWith("strategist", true);
    expect(await checkBranchArea(fetch, viewer(), "events")).toBe("unverified");
  });

  it("fails closed to unverified on stale profiles for non-leadership", async () => {
    profilesWith([{ branch: "treasury", level: "member" }], { stale: true });
    expect(await checkBranchArea(fetch, viewer(), "treasury")).toBe("unverified");
  });

  it("fails closed when the backend's own Discord snapshot is stale", async () => {
    // `result.stale` covers our cache; `data.source.stale` is the authority's
    // reconciliation. A revoked role survives in a fresh-looking response.
    profilesWith([{ branch: "treasury", level: "member" }], { sourceStale: true });
    expect(await checkBranchArea(fetch, viewer(), "treasury")).toBe("unverified");
  });

  it("asks both sources for fresh data", async () => {
    await checkBranchArea(fetch, viewer(), "treasury");
    expect(mockStats).toHaveBeenCalledWith(fetch, { allowStale: false });
    expect(mockProfiles).toHaveBeenCalledWith(fetch, { allowStale: false });
  });
});

describe("checkBranchAreaWithRoster", () => {
  it("hands back the roster the decision was judged against", async () => {
    profilesWith([{ branch: "events", level: "member" }]);
    const result = await checkBranchAreaWithRoster(fetch, viewer(), "events");
    expect(result.access).toBe("granted");
    expect(result.roster).toEqual([{ uuid: UUID, rank: "recruit" }]);
    // One roster read serves both halves of the answer.
    expect(mockStats).toHaveBeenCalledTimes(1);
  });

  it("reads the roster for an admin but never their profiles", async () => {
    // Their access is settled by the session; the roster is the caller's data.
    const result = await checkBranchAreaWithRoster(fetch, viewer({ websiteAdmin: true }), "events");
    expect(result.access).toBe("granted");
    expect(result.roster).toEqual([{ uuid: UUID, rank: "recruit" }]);
    expect(mockProfiles).not.toHaveBeenCalled();
  });

  it("reports a null roster when the refresh came back stale", async () => {
    rosterWith("strategist", true);
    await expect(checkBranchAreaWithRoster(fetch, viewer(), "events")).resolves.toEqual({
      access: "unverified",
      roster: null,
    });
  });

  it("answers a signed-out caller without any read", async () => {
    await expect(checkBranchAreaWithRoster(noFetch, null, "events")).resolves.toEqual({
      access: "signin",
      roster: null,
    });
    expect(mockStats).not.toHaveBeenCalled();
  });
});

describe("branchAccessFrom", () => {
  it("reports unverified when the roster half is missing", () => {
    expect(branchAccessFrom({ roster: null, profiles: null }, viewer(), "treasury")).toBe(
      "unverified",
    );
  });

  it("still grants leadership when only the profiles half is missing", () => {
    const roster = [{ uuid: UUID, rank: "chief" }] as never;
    expect(branchAccessFrom({ roster, profiles: null }, viewer(), "treasury")).toBe("granted");
  });

  it("reports unverified for members when the profiles half is missing", () => {
    const roster = [{ uuid: UUID, rank: "recruit" }] as never;
    expect(branchAccessFrom({ roster, profiles: null }, viewer(), "treasury")).toBe("unverified");
  });
});

describe("requireBranchArea", () => {
  const request = {
    cookies: { get: () => "session-token" },
    fetch,
    locals: { requestId: "req-1" } as App.Locals,
  };

  it("throws 403 with the area's message for a non-member", async () => {
    mockLoadViewer.mockResolvedValue(viewer());
    await expect(requireBranchArea(request, "treasury", "Treasury only")).rejects.toMatchObject({
      status: 403,
      body: { message: "Treasury only" },
    });
  });

  it("returns the acting viewer when the branch grants access", async () => {
    const who = viewer();
    mockLoadViewer.mockResolvedValue(who);
    profilesWith([{ branch: "treasury", level: "member" }]);
    await expect(requireBranchArea(request, "treasury", "Treasury only")).resolves.toBe(who);
  });
});
