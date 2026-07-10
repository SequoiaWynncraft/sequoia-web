import { describe, expect, it } from "vitest";

import type { RankProfilesResponse } from "$lib/api/client";
import { honoursForMinecraft } from "$lib/server/rankProfiles";

const MEMBER = "11111111-1111-1111-1111-111111111111";
const RETIRED = "33333333-3333-3333-3333-333333333333";

function role(
  key: string,
  label: string,
  category: "progression_rank" | "insignia",
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
      role("rank.treant", "Treant", "progression_rank"),
      role("rank.spriggan", "Spriggan", "progression_rank", { legacy: true }),
      role("rank.verdant", "Verdant", "progression_rank", { legacy: true }),
      role("insignia.gold", "Gold Insignia", "insignia", {
        source_guild: "branchmasters",
        tier: "gold",
        asset_key: "insignia-gold",
      }),
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
      insignia: {
        tier: "GOLD",
        assetUrl: "https://assets.seqwawa.com/v1/gold/insignia-gold.png",
      },
      badges: [
        {
          player_uuid: MEMBER,
          type: "WTP",
          tier: "DIAMOND",
          asset_url: "https://assets.seqwawa.com/v1/diamond/wtp-diamond.png",
        },
        {
          player_uuid: MEMBER,
          type: "NOL",
          tier: "BRONZE",
          asset_url: "https://assets.seqwawa.com/v1/bronze/nol-bronze.png",
        },
      ],
    });
  });

  it("reads retired ranks as their modern equivalent", () => {
    expect(honoursForMinecraft(response, RETIRED).rank).toBe("Treant");
  });

  it("keeps a legacy rank without an equivalent as-is", () => {
    const verdant = structuredClone(response);
    verdant.profiles[1].summary.progression_rank = "rank.verdant";
    expect(honoursForMinecraft(verdant, RETIRED).rank).toBe("Verdant");
  });

  it("returns empty honours for an unlinked UUID", () => {
    expect(honoursForMinecraft(response, "22222222-2222-2222-2222-222222222222")).toEqual({
      rank: null,
      insignia: null,
      badges: [],
    });
  });
});
