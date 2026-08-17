import { describe, expect, it } from "vitest";

import type { RankProfilesResponse } from "$lib/api/client";
import { parseWynncraftGuildOverview } from "$lib/server/guildOverview";

const BRANCHMASTER = "11111111-1111-1111-1111-111111111111";
const NOVICE = "22222222-2222-2222-2222-222222222222";
const OUTSIDE_GUILD = "33333333-3333-3333-3333-333333333333";

describe("parseWynncraftGuildOverview", () => {
  it("uses Discord branch leadership for membership and synced rank styling", () => {
    const result = parseWynncraftGuildOverview(
      {
        level: 240,
        territories: 60,
        wars: 149_330,
        raids: 142_884,
        online: 19,
        members: {
          total: 3,
          chief: {
            SeniorBranchmaster: member("44444444-4444-4444-4444-444444444444", 500, 1),
          },
          captain: {
            CurrentBranchmasterName: member(BRANCHMASTER, 300, 2, {
              online: true,
              joined: "2024-01-01T00:00:00Z",
              globalData: { wars: 10, raids: { total: 5 } },
            }),
          },
          recruiter: {
            NoviceName: member(NOVICE, 200, 3),
          },
        },
      },
      undefined,
      rankProfiles(),
    );

    expect(result).toEqual({
      generated_at: expect.any(String),
      stale: false,
      stats: {
        members: 3,
        guild_level: 240,
        territories: 60,
        total_wars: 149_330,
        raids: 142_884,
        online_now: 19,
      },
      branchmasters: [
        {
          username: "SeniorBranchmaster",
          rank: "branchmaster",
          rank_label: "Branchmaster",
          rank_color: "#DBD1C7",
          progression_rank_label: "Druid",
          progression_rank_color: "#D7BCEA",
          online: false,
          contributed: 500,
          contribution_rank: 1,
          wars: null,
          raids: null,
          joined: null,
        },
        {
          username: "CurrentBranchmasterName",
          rank: "branchmaster",
          rank_label: "Branchmaster",
          rank_color: "#DBD1C7",
          progression_rank_label: "Treant",
          progression_rank_color: "#1B9056",
          online: true,
          contributed: 300,
          contribution_rank: 2,
          wars: 10,
          raids: 5,
          joined: "2024-01-01T00:00:00Z",
        },
        {
          username: "OutsideGuild",
          rank: "branchmaster",
          rank_label: "Branchmaster",
          rank_color: "#DBD1C7",
          progression_rank_label: "Dryad",
          progression_rank_color: "#CDECE4",
          online: null,
          contributed: null,
          contribution_rank: null,
          wars: null,
          raids: null,
          joined: null,
        },
        {
          username: "NoviceName",
          rank: "branch_novice",
          rank_label: "Branch Novice",
          rank_color: "#5E68DB",
          progression_rank_label: "Dryad",
          progression_rank_color: "#CDECE4",
          online: false,
          contributed: 200,
          contribution_rank: 3,
          wars: null,
          raids: null,
          joined: null,
        },
      ],
    });
  });

  it("keeps restricted presence and unavailable member stats unknown", () => {
    const result = parseWynncraftGuildOverview(
      {
        level: 1,
        territories: 0,
        wars: 0,
        raids: 0,
        online: 0,
        members: {
          total: 1,
          chief: {
            PrivateMember: member(BRANCHMASTER, 0, 1, {
              restrictions: { online_status: true, main_access: true },
              globalData: null,
            }),
          },
        },
      },
      undefined,
      rankProfiles(),
    );

    expect(result.branchmasters[0]).toMatchObject({
      username: "PrivateMember",
      online: null,
      wars: null,
      raids: null,
      joined: null,
    });
  });

  it("does not fall back to Wynncraft ranks when role profiles are unavailable", () => {
    const result = parseWynncraftGuildOverview({
      level: 1,
      territories: 0,
      wars: 0,
      raids: 0,
      online: 0,
      members: {
        total: 1,
        owner: { OwnerName: member(BRANCHMASTER, 0, 1) },
      },
    });

    expect(result.branchmasters).toEqual([]);
  });

  it("keeps the guild stats when a version-skewed profile snapshot cannot be read", () => {
    // The shared validator checks only that `catalog.roles` and `profiles` are
    // arrays, so a skewed snapshot reaches the parser and throws on the first
    // dereference. The stats do not depend on profiles at all and must survive.
    const guild = {
      level: 240,
      territories: 60,
      wars: 149_330,
      raids: 142_884,
      online: 19,
      members: { total: 1, chief: { SomeName: member(BRANCHMASTER, 500, 1) } },
    };
    const stats = {
      members: 1,
      guild_level: 240,
      territories: 60,
      total_wars: 149_330,
      raids: 142_884,
      online_now: 19,
    };

    const nullRole = rankProfiles();
    (nullRole.catalog.roles as unknown[])[0] = null;
    const withNullRole = parseWynncraftGuildOverview(guild, undefined, nullRole);
    expect(withNullRole.stats).toEqual(stats);
    expect(withNullRole.branchmasters).toEqual([]);

    const noRoleKeys = rankProfiles();
    delete (noRoleKeys.profiles[0] as Partial<RankProfilesResponse["profiles"][number]>).role_keys;
    const withoutRoleKeys = parseWynncraftGuildOverview(guild, undefined, noRoleKeys);
    expect(withoutRoleKeys.stats).toEqual(stats);
    expect(withoutRoleKeys.branchmasters).toEqual([]);
  });
});

function member(
  uuid: string,
  contributed: number,
  contributionRank: number,
  overrides: Record<string, unknown> = {},
) {
  return {
    uuid,
    online: false,
    contributed,
    contributionRank,
    joined: null,
    globalData: {},
    ...overrides,
  };
}

function rankProfiles(): RankProfilesResponse {
  return {
    schema_version: 1,
    revision: "test-revision",
    generated_at: "2026-08-01T12:00:00Z",
    source: { stale: false, guilds: [] },
    catalog: {
      roles: [
        role("leadership.branchmaster", "Branchmaster", "#DBD1C7"),
        role("leadership.branch_novice", "Branch Novice", "#5E68DB"),
        role("leadership.root", "Root", "#F5C542"),
        role("rank.spriggan", "Spriggan", "#A855F7", "progression_rank"),
        role("rank.treant", "Treant", "#1B9056", "progression_rank"),
        role("rank.druid", "Druid", "#D7BCEA", "progression_rank"),
        role("rank.dryad", "Dryad", "#CDECE4", "progression_rank"),
      ],
      awards: [],
      assets: [],
    },
    profiles: [
      profile(
        BRANCHMASTER,
        "StaleBranchmasterName",
        "leadership.branchmaster",
        undefined,
        "rank.spriggan",
      ),
      profile(OUTSIDE_GUILD, "OutsideGuild", "leadership.branchmaster", undefined, "rank.dryad"),
      profile(NOVICE, "NoviceName", "leadership.branch_novice", undefined, "rank.dryad"),
      profile(
        "44444444-4444-4444-4444-444444444444",
        "RootMember",
        "leadership.root",
        ["leadership.root", "leadership.branchmaster"],
        "rank.druid",
      ),
      profile(
        "55555555-5555-5555-5555-555555555555",
        "RootOnly",
        "leadership.root",
      ),
    ],
  };
}

function role(
  key: string,
  label: string,
  color: string,
  category: "leadership" | "progression_rank" = "leadership",
): RankProfilesResponse["catalog"]["roles"][number] {
  return {
    key,
    label,
    category,
    source_guild: "branchmasters",
    source_guild_id: "722171700960477254",
    source_role_ids: ["1"],
    legacy: false,
    colors: { primary: color, secondary: null, tertiary: null },
  };
}

function profile(
  uuid: string,
  username: string,
  leadership: string,
  roleKeys: string[] = [leadership],
  progressionRank: string | null = null,
): RankProfilesResponse["profiles"][number] {
  return {
    discord: null,
    minecraft: { uuid, username },
    role_keys: roleKeys,
    award_keys: [],
    summary: {
      progression_rank: progressionRank,
      in_game_rank: null,
      leadership,
      insignia: null,
      war_honour: null,
      insignias: [],
      war_honours: [],
      branches: [],
    },
  };
}
