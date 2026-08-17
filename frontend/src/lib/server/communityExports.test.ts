import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  buildExport,
  findExportDataset,
  parseExportParams,
  type ExportDataset,
} from "./communityExports";
import { getGuildStats } from "./guildStats";
import { getMemberProgressResult } from "./memberProgress";
import { loadModRunCounts } from "./modActivity";
import { getLinkedRankProfilesResult } from "./rankProfiles";

vi.mock("./guildStats", () => ({ getGuildStats: vi.fn() }));
vi.mock("./memberProgress", () => ({ getMemberProgressResult: vi.fn() }));
vi.mock("./modActivity", () => ({ loadModRunCounts: vi.fn() }));
vi.mock("./rankProfiles", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./rankProfiles")>()),
  getLinkedRankProfilesResult: vi.fn(),
}));

const mockStats = vi.mocked(getGuildStats);
const mockProgressResult = vi.mocked(getMemberProgressResult);
const mockRuns = vi.mocked(loadModRunCounts);
const mockProfilesResult = vi.mocked(getLinkedRankProfilesResult);

/** Wraps profile data in a fresh CachedValue, as the strict loader expects. */
function mockProfiles(data: unknown, options: { stale?: boolean; sourceStale?: boolean } = {}) {
  mockProfilesResult.mockResolvedValue({
    stale: options.stale ?? false,
    updatedAt: 0,
    data: { source: { stale: options.sourceStale ?? false }, ...(data as object) },
  } as never);
}

function mockProgress(data: unknown, options: { stale?: boolean } = {}) {
  mockProgressResult.mockResolvedValue({
    stale: options.stale ?? false,
    updatedAt: 0,
    data,
  } as never);
}

const UUID = "11111111-2222-3333-4444-555555555555";
const UNDASHED = UUID.replaceAll("-", "");

function dataset(id: string): ExportDataset {
  const found = findExportDataset(id);
  if (!found) throw new Error(`missing dataset ${id}`);
  return found;
}

function search(entries: Record<string, string>): URLSearchParams {
  return new URLSearchParams(entries);
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("parseExportParams", () => {
  it("accepts a plain roster request and ignores foreign filters", () => {
    const parsed = parseExportParams(dataset("roster"), search({ from: "junk", raid: "junk" }));
    expect(parsed).toEqual({
      ok: true,
      params: { from: null, to: null, raid: null, rosterOnly: false },
    });
  });

  it("rejects malformed and reversed date ranges", () => {
    expect(parseExportParams(dataset("progress"), search({ from: "2026-1-1", to: "2026-02-01" })).ok).toBe(false);
    expect(parseExportParams(dataset("progress"), search({ to: "2026-02-01" })).ok).toBe(false);
    expect(
      parseExportParams(dataset("progress"), search({ from: "2026-03-01", to: "2026-02-01" })).ok,
    ).toBe(false);
    // A nonexistent calendar day must 400, not normalize: Date.parse reads
    // 2026-02-30 as March 2, which would silently shift the range.
    const overflow = parseExportParams(
      dataset("progress"),
      search({ from: "2026-02-30", to: "2026-03-15" }),
    );
    expect(overflow).toEqual({ ok: false, message: "Dates must be YYYY-MM-DD" });
  });

  it("caps the range span", () => {
    expect(
      parseExportParams(dataset("progress"), search({ from: "2024-01-01", to: "2026-01-01" })).ok,
    ).toBe(false);
  });

  it("rejects unknown raids and passes known ones", () => {
    const base = { from: "2026-07-01", to: "2026-07-31" };
    expect(parseExportParams(dataset("progress"), search({ ...base, raid: "Fake Raid" })).ok).toBe(
      false,
    );
    const parsed = parseExportParams(
      dataset("progress"),
      search({ ...base, raid: "The Nameless Anomaly", rosterOnly: "1" }),
    );
    expect(parsed).toEqual({
      ok: true,
      params: {
        from: "2026-07-01",
        to: "2026-07-31",
        raid: "The Nameless Anomaly",
        rosterOnly: true,
      },
    });
  });
});

describe("buildExport", () => {
  it("joins roster rows with org ranks and branches across uuid formats", async () => {
    mockStats.mockResolvedValue({
      stale: false,
      members: [
        {
          username: "Alice",
          uuid: UUID,
          rank: "strategist",
          contributed: 12,
          joined: "2024-01-01",
          last_join: "2026-07-30",
          playtime: 100,
          wars: 5,
          raids_total: 40,
          dungeons_total: 7,
          quests: 200,
        },
      ],
    } as never);
    mockProfiles({
      catalog: { roles: [], assets: [], awards: [] },
      profiles: [
        {
          minecraft: { uuid: UNDASHED },
          award_keys: [],
          summary: {
            progression_rank: null,
            insignia: [],
            leadership: [],
            war_honours: [],
            branches: [{ key: "branch.treasury", branch: "treasury", level: "member" }],
          },
        },
      ],
    });

    const result = await buildExport(fetch, "roster", {
      from: null,
      to: null,
      raid: null,
      rosterOnly: false,
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.rows[0][0]).toBe("username");
    expect(result.rows[1]).toContain("Alice");
    expect(result.rows[1]).toContain("treasury:member");
  });

  it("refuses to export a stale roster as current members", async () => {
    mockStats.mockResolvedValue({ stale: true, members: [{ uuid: UUID, rank: "recruit" }] } as never);
    mockProfiles({ profiles: [] });
    const result = await buildExport(fetch, "roster", {
      from: null,
      to: null,
      raid: null,
      rosterOnly: false,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(mockStats).toHaveBeenCalledWith(fetch, { allowStale: false });
  });

  it("reports the roster unavailable instead of an empty file", async () => {
    mockStats.mockRejectedValue(new Error("wynn down"));
    mockProfiles({ profiles: [] });
    const result = await buildExport(fetch, "roster", {
      from: null,
      to: null,
      raid: null,
      rosterOnly: false,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("fails the export when the declared rank is not a progression role", async () => {
    mockStats.mockResolvedValue({ stale: false, members: [{ uuid: UUID, rank: "recruit" }] } as never);
    mockProfiles({
      catalog: {
        // Resolvable label, wrong category - must not export as an org rank.
        roles: [{ key: "branch.community", label: "Community", category: "branch", position: 1 }],
        assets: [],
        awards: [],
      },
      profiles: [
        {
          minecraft: { uuid: UNDASHED },
          award_keys: [],
          summary: {
            progression_rank: "branch.community",
            insignia: [],
            leadership: [],
            war_honours: [],
            branches: [],
          },
        },
      ],
    });
    const result = await buildExport(fetch, "roster", {
      from: null,
      to: null,
      raid: null,
      rosterOnly: false,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("rejects branch levels outside the member/trainee enum", async () => {
    mockStats.mockResolvedValue({ stale: false, members: [{ uuid: UUID, rank: "recruit" }] } as never);
    mockProfiles({
      catalog: { roles: [], assets: [], awards: [] },
      profiles: [
        {
          minecraft: { uuid: UNDASHED },
          award_keys: [],
          summary: {
            progression_rank: null,
            insignia: [],
            leadership: [],
            war_honours: [],
            branches: [{ key: "b", branch: "community", level: "owner" }],
          },
        },
      ],
    });
    const result = await buildExport(fetch, "roster", {
      from: null,
      to: null,
      raid: null,
      rosterOnly: false,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("fails the export when a declared org rank cannot resolve to a label", async () => {
    mockStats.mockResolvedValue({ stale: false, members: [{ uuid: UUID, rank: "recruit" }] } as never);
    mockProfiles({
      // The declared rank has no catalog role, so no label can resolve.
      catalog: { roles: [], assets: [], awards: [] },
      profiles: [
        {
          minecraft: { uuid: UNDASHED },
          award_keys: [],
          summary: {
            progression_rank: "rank.dryad",
            insignia: [],
            leadership: [],
            war_honours: [],
            branches: [],
          },
        },
      ],
    });
    const result = await buildExport(fetch, "roster", {
      from: null,
      to: null,
      raid: null,
      rosterOnly: false,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("reads a malformed branch entry as unavailable, not undefined:undefined", async () => {
    mockStats.mockResolvedValue({ stale: false, members: [{ uuid: UUID, rank: "recruit" }] } as never);
    mockProfiles({
      catalog: { roles: [], assets: [], awards: [] },
      profiles: [
        {
          minecraft: { uuid: UNDASHED },
          award_keys: [],
          summary: {
            progression_rank: null,
            insignia: [],
            leadership: [],
            war_honours: [],
            branches: [{}],
          },
        },
      ],
    });
    const result = await buildExport(fetch, "roster", {
      from: null,
      to: null,
      raid: null,
      rosterOnly: false,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("reads a version-skewed rank profile as unavailable, not a crash", async () => {
    mockStats.mockResolvedValue({ stale: false, members: [{ uuid: UUID, rank: "recruit" }] } as never);
    mockProfiles({
      catalog: { roles: [], assets: [], awards: [] },
      // summary.branches missing entirely - the shared validator only checks
      // the shallow response shape.
      profiles: [{ minecraft: { uuid: UNDASHED }, award_keys: [], summary: {} }],
    });
    const result = await buildExport(fetch, "roster", {
      from: null,
      to: null,
      raid: null,
      rosterOnly: false,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("refuses a roster export with silently blank rank columns", async () => {
    mockStats.mockResolvedValue({ stale: false, members: [] } as never);
    mockProfilesResult.mockRejectedValue(new Error("ranks down"));
    const result = await buildExport(fetch, "roster", {
      from: null,
      to: null,
      raid: null,
      rosterOnly: false,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("refuses a stale progress snapshot for the download path", async () => {
    mockProgress({ members: [] }, { stale: true });
    const result = await buildExport(fetch, "progress", {
      from: "2026-07-01",
      to: "2026-07-31",
      raid: null,
      rosterOnly: false,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
    expect(mockProgressResult).toHaveBeenCalledWith(fetch, "2026-07-01", "2026-07-31", {
      allowStale: false,
    });
  });

  it("refuses roster enrichment from a stale Discord snapshot", async () => {
    mockStats.mockResolvedValue({ stale: false, members: [] } as never);
    mockProfiles({ profiles: [] }, { sourceStale: true });
    const result = await buildExport(fetch, "roster", {
      from: null,
      to: null,
      raid: null,
      rosterOnly: false,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("narrows progress columns to the filtered raid and intersects the roster", async () => {
    mockProgress({
      members: [
        {
          player_uuid: UNDASHED,
          player_name: "Alice",
          playtime_hours: 12,
          wars: 3,
          wars_participated: 2,
          war_points: 90,
          raids: 10,
          raids_by_type: { "The Nameless Anomaly": 4 },
        },
        {
          player_uuid: "99999999999999999999999999999999",
          player_name: "Departed",
          playtime_hours: 1,
          wars: 0,
          wars_participated: 0,
          war_points: 0,
          raids: 1,
          raids_by_type: {},
        },
      ],
    } as never);
    mockStats.mockResolvedValue({ stale: false, members: [{ uuid: UUID, rank: "recruit" }] } as never);

    const result = await buildExport(fetch, "progress", {
      from: "2026-07-01",
      to: "2026-07-31",
      raid: "The Nameless Anomaly",
      rosterOnly: true,
    });
    if (!result.ok) throw new Error(result.message);
    expect(result.rows[0]).toEqual([
      "username",
      "uuid",
      "playtime_hours",
      "wars",
      "wars_participated",
      "war_points",
      "raids_total",
      "raids_tna",
    ]);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[1][0]).toBe("Alice");
    expect(result.rows[1][7]).toBe(4);
  });

  it("rejects a progress payload without raid breakdowns at the validator", async () => {
    const { isMemberProgressResponse } = await import("$lib/api/memberProgress");
    const entry = {
      player_uuid: UNDASHED,
      player_name: "Alice",
      playtime_hours: 1,
      wars: 0,
      wars_participated: 0,
      war_points: 0,
      raids: 0,
    };
    const { wars_participated: _dropped, ...withoutParticipation } = {
      ...entry,
      raids_by_type: {},
    };
    // Every exported column must be validated - wars_participated included.
    expect(
      (await import("$lib/api/memberProgress")).isMemberProgressResponse({
        generated_at: "now",
        from: "2026-07-01",
        to: "2026-07-31",
        data_since: { activity: "", raids: "", war_points: "" },
        members: [withoutParticipation],
      }),
    ).toBe(false);
    const base = {
      generated_at: "now",
      from: "2026-07-01",
      to: "2026-07-31",
      data_since: { activity: "", raids: "", war_points: "" },
    };
    expect(isMemberProgressResponse({ ...base, members: [entry] })).toBe(false);
    expect(
      isMemberProgressResponse({ ...base, members: [{ ...entry, raids_by_type: { TNA: 2 } }] }),
    ).toBe(true);
    expect(
      isMemberProgressResponse({ ...base, members: [{ ...entry, raids_by_type: { TNA: "2" } }] }),
    ).toBe(false);
    // Counts are nonnegative integers - corruption must not export as data.
    expect(
      isMemberProgressResponse({ ...base, members: [{ ...entry, raids_by_type: { TNA: -1 } }] }),
    ).toBe(false);
    expect(
      isMemberProgressResponse({ ...base, members: [{ ...entry, raids_by_type: { TNA: 1.5 } }] }),
    ).toBe(false);
    const valid = { ...entry, raids_by_type: {} };
    expect(
      isMemberProgressResponse({ ...base, members: [{ ...valid, wars_participated: -1 }] }),
    ).toBe(false);
    expect(isMemberProgressResponse({ ...base, members: [{ ...valid, wars: 1.5 }] })).toBe(false);
    expect(
      isMemberProgressResponse({ ...base, members: [{ ...valid, playtime_hours: -2 }] }),
    ).toBe(false);
    // Playtime stays fractional - only counts require integers.
    expect(
      isMemberProgressResponse({ ...base, members: [{ ...valid, playtime_hours: 2.5 }] }),
    ).toBe(true);
  });

  it("fails the export when a resolved rank label is not a string", async () => {
    mockStats.mockResolvedValue({ stale: false, members: [{ uuid: UUID, rank: "recruit" }] } as never);
    mockProfiles({
      catalog: {
        roles: [{ key: "rank.dryad", label: 42, category: "progression_rank", position: 1 }],
        assets: [],
        awards: [],
      },
      profiles: [
        {
          minecraft: { uuid: UNDASHED },
          award_keys: [],
          summary: {
            progression_rank: "rank.dryad",
            insignia: [],
            leadership: [],
            war_honours: [],
            branches: [],
          },
        },
      ],
    });
    const result = await buildExport(fetch, "roster", {
      from: null,
      to: null,
      raid: null,
      rosterOnly: false,
    });
    expect(result).toMatchObject({ ok: false, status: 503 });
  });

  it("exports daily runs and surfaces backend absence as 503", async () => {
    mockRuns.mockResolvedValue([{ day: "2026-07-01", value: 9 }]);
    const ok = await buildExport(fetch, "daily-runs", {
      from: "2026-07-01",
      to: "2026-07-31",
      raid: null,
      rosterOnly: false,
    });
    if (!ok.ok) throw new Error(ok.message);
    expect(ok.rows).toEqual([
      ["day", "runs"],
      ["2026-07-01", 9],
    ]);

    mockRuns.mockResolvedValue(null);
    const down = await buildExport(fetch, "daily-runs", {
      from: "2026-07-01",
      to: "2026-07-31",
      raid: null,
      rosterOnly: false,
    });
    expect(down).toMatchObject({ ok: false, status: 503 });
  });
});
