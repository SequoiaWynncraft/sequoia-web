import { describe, expect, it } from "vitest";

import type { RankProfilesResponse } from "#lib/api/client.js";
import {
  honoursForMinecraft,
  inGameRankLadder,
  memberRanksByUuid,
} from "#lib/server/rankProfiles.js";

const MEMBER = "11111111-1111-1111-1111-111111111111";
const RETIRED = "33333333-3333-3333-3333-333333333333";

function role(
  key: string,
  label: string,
  category: "progression_rank" | "insignia" | "war_honour" | "leadership" | "branch",
  extra: Record<string, unknown> = {},
): RankProfilesResponse["catalog"]["roles"][number] {
  return {
    key,
    label,
    category,
    source_guild: "main",
    source_guild_id: "1030187086722109570",
    source_role_ids: ["1"],
    legacy: false,
    ...extra,
  };
}

function summary(
  overrides: Partial<RankProfilesResponse["profiles"][number]["summary"]>,
): RankProfilesResponse["profiles"][number]["summary"] {
  return {
    progression_rank: null,
    in_game_rank: null,
    leadership: null,
    insignia: null,
    war_honour: null,
    insignias: [],
    war_honours: [],
    branches: [],
    ...overrides,
  };
}

const response: RankProfilesResponse = {
  schema_version: 1,
  revision: "test-revision",
  generated_at: "2026-07-10T12:00:00Z",
  source: { stale: false, guilds: [] },
  catalog: {
    roles: [
      role("rank.yggdrasil", "Yggdrasil", "progression_rank", { position: 144 }),
      role("rank.treant", "Treant", "progression_rank", {
        position: 105,
        colors: { primary: "#A855F7", secondary: null, tertiary: null },
      }),
      role("rank.spriggan", "Spriggan", "progression_rank", { legacy: true, position: 104 }),
      role("rank.verdant", "Verdant", "progression_rank", { legacy: true }),
      role("rank.dryad", "Dryad", "progression_rank", { position: 94 }),
      role("rank.sprite", "Sprite", "progression_rank", { position: 90 }),
      role("rank.sapling", "Sapling", "progression_rank", { position: 88 }),
      role("rank.leafkin", "Leafkin", "progression_rank", { position: 86 }),
      role("insignia.gold", "Gold Insignia", "insignia", {
        source_guild: "branchmasters",
        tier: "gold",
        asset_key: "insignia-gold",
      }),
      role("war_honour.silver", "Silver Honours", "war_honour", { tier: "silver" }),
      role("war_honour.diamond", "Diamond Honours", "war_honour", { tier: "diamond" }),
      role("leadership.branchmaster", "Branchmaster", "leadership"),
      role("branch.military", "Military Branch", "branch", { branch: "military" }),
      role("branch.moderation", "Moderation Twig", "branch", { branch: "moderation" }),
    ],
    awards: [
      {
        key: "award.wtp.diamond",
        category: "badge",
        series: "WTP",
        tier: "DIAMOND",
        title: "WTP Diamond",
        asset_key: "wtp-diamond",
        display_order: 1,
      },
      {
        key: "award.nol.bronze",
        category: "badge",
        series: "NOL",
        tier: "BRONZE",
        title: "NoL Bronze",
        asset_key: "nol-bronze",
        display_order: 2,
      },
    ],
    assets: [
      {
        key: "insignia-gold",
        url: "https://assets.seqwawa.com/v1/gold/insignia-gold.png",
        content_type: "image/png",
        sha256: "gold",
      },
      {
        key: "wtp-diamond",
        url: "https://assets.seqwawa.com/v1/diamond/wtp-diamond.png",
        content_type: "image/png",
        sha256: "diamond",
      },
      {
        key: "nol-bronze",
        url: "https://assets.seqwawa.com/v1/bronze/nol-bronze.png",
        content_type: "image/png",
        sha256: "bronze",
      },
    ],
  },
  profiles: [
    {
      discord: { id: "1", username: "member" },
      minecraft: { uuid: MEMBER, username: "Member" },
      role_keys: ["rank.treant", "insignia.gold"],
      award_keys: ["award.nol.bronze", "award.wtp.diamond"],
      summary: summary({
        progression_rank: "rank.treant",
        insignia: "insignia.gold",
        insignias: ["insignia.gold"],
        war_honour: "war_honour.diamond",
        war_honours: ["war_honour.silver", "war_honour.diamond"],
        leadership: "leadership.branchmaster",
        branches: [
          { key: "branch.military", branch: "military", level: "member" },
          { key: "branch.moderation", branch: "moderation", level: "trainee" },
        ],
      }),
    },
    {
      discord: { id: "2", username: "retired" },
      minecraft: { uuid: RETIRED, username: "Retired" },
      role_keys: ["rank.spriggan"],
      award_keys: [],
      summary: summary({ progression_rank: "rank.spriggan" }),
    },
  ],
};

describe("honoursForMinecraft", () => {
  it("projects rank, insignia, and tier-sorted event badges from one rank response", () => {
    expect(honoursForMinecraft(response, MEMBER)).toEqual({
      rank: "Treant",
      rankColor: "#A855F7",
      insignia: {
        tier: "GOLD",
        assetUrl: "https://assets.seqwawa.com/v1/gold/insignia-gold.png",
      },
      leadership: "Branchmaster",
      branches: ["Military", "Moderation (trainee)"],
      warHonours: [{ tier: "DIAMOND" }, { tier: "SILVER" }],
      badges: [
        {
          playerUuid: MEMBER,
          type: "WTP",
          tier: "DIAMOND",
          assetUrl: "https://assets.seqwawa.com/v1/diamond/wtp-diamond.png",
        },
        {
          playerUuid: MEMBER,
          type: "NOL",
          tier: "BRONZE",
          assetUrl: "https://assets.seqwawa.com/v1/bronze/nol-bronze.png",
        },
      ],
    });
  });

  it("reads retired ranks as their modern equivalent", () => {
    expect(honoursForMinecraft(response, RETIRED).rank).toBe("Treant");
  });

  it("ignores malformed role colors before they reach CSS", () => {
    const malformed = structuredClone(response);
    const treant = malformed.catalog.roles.find((entry) => entry.key === "rank.treant");
    expect(treant).toBeDefined();
    treant!.colors = {
      primary: "red; display: none",
      secondary: null,
      tertiary: null,
    };

    expect(honoursForMinecraft(malformed, MEMBER).rankColor).toBeNull();
  });

  it("keeps a legacy rank without an equivalent as-is", () => {
    const verdant = structuredClone(response);
    verdant.profiles[1].summary.progression_rank = "rank.verdant";
    expect(honoursForMinecraft(verdant, RETIRED).rank).toBe("Verdant");
  });

  it("indexes rank standing by lowercased UUID for the whole roster", () => {
    expect(memberRanksByUuid(response)).toEqual({
      [MEMBER]: {
        rank: "Treant",
        rankColor: "#A855F7",
        rankOrder: 105,
        insignia: "GOLD",
        insigniaUrl: "https://assets.seqwawa.com/v1/gold/insignia-gold.png",
        honours: 4,
      },
      [RETIRED]: {
        rank: "Treant",
        rankColor: "#A855F7",
        rankOrder: 105,
        insignia: null,
        insigniaUrl: null,
        honours: 0,
      },
    });
  });

  it("sorts in-game ranks just below the lowest org rank they can stand for", () => {
    // Every in-game rank resolves, and the ladder descends owner -> recruit so
    // an unlinked member sorts among the org ranks rather than beneath them.
    expect(inGameRankLadder(response)).toEqual({
      owner: 143.5,
      chief: 104.5,
      strategist: 93.5,
      captain: 89.5,
      recruiter: 87.5,
      recruit: 85.5,
    });
  });

  it("leaves a rank whose org equivalent is missing unplaced, so it sorts last", () => {
    // A null is not a 0: LedgerTable pins nulls to the bottom in *both* sort
    // directions, whereas a placeholder position would float Owner to the top
    // of an ascending sort.
    const withoutOwnerRank: RankProfilesResponse = {
      ...response,
      catalog: {
        ...response.catalog,
        roles: response.catalog.roles.filter((entry) => entry.key !== "rank.yggdrasil"),
      },
    };
    expect(inGameRankLadder(withoutOwnerRank).owner).toBeNull();
    expect(inGameRankLadder(withoutOwnerRank).chief).toBe(104.5);
  });

  it("returns empty honours for an unlinked UUID", () => {
    expect(honoursForMinecraft(response, "22222222-2222-2222-2222-222222222222")).toEqual({
      rank: null,
      rankColor: null,
      insignia: null,
      leadership: null,
      branches: [],
      warHonours: [],
      badges: [],
    });
  });
});
