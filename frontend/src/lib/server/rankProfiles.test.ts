import { describe, expect, it } from "vitest";

import type { RankProfilesResponse } from "$lib/api/client";
import { badgesForMinecraft } from "$lib/server/rankProfiles";

const response: RankProfilesResponse = {
  schema_version: 1,
  revision: "test-revision",
  generated_at: "2026-07-10T12:00:00Z",
  source: { stale: false, guilds: [] },
  catalog: {
    roles: [
      {
        key: "insignia.gold",
        label: "Gold Insignia",
        category: "insignia",
        source_guild: "branchmasters",
        source_guild_id: "1104432054717927544",
        source_role_ids: ["1141395234232750100"],
        legacy: false,
        tier: "gold",
        asset_key: "insignia-gold",
      },
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
    ],
  },
  profiles: [
    {
      discord: { id: "1", username: "member" },
      minecraft: {
        uuid: "11111111-1111-1111-1111-111111111111",
        username: "Member",
      },
      role_keys: ["insignia.gold"],
      award_keys: ["award.wtp.diamond"],
      summary: {
        progression_rank: null,
        in_game_rank: null,
        leadership: null,
        insignia: "insignia.gold",
        war_honour: null,
        insignias: ["insignia.gold"],
        war_honours: [],
        branches: [],
      },
    },
  ],
};

describe("badgesForMinecraft", () => {
  it("projects Discord insignia and manual awards from one rank response", () => {
    expect(
      badgesForMinecraft(response, "11111111-1111-1111-1111-111111111111"),
    ).toEqual([
      {
        player_uuid: "11111111-1111-1111-1111-111111111111",
        type: "INSIGNIA",
        tier: "GOLD",
        asset_url: "https://assets.seqwawa.com/v1/gold/insignia-gold.png",
      },
      {
        player_uuid: "11111111-1111-1111-1111-111111111111",
        type: "WTP",
        tier: "DIAMOND",
        asset_url: "https://assets.seqwawa.com/v1/diamond/wtp-diamond.png",
      },
    ]);
  });

  it("returns no badges for an unlinked UUID", () => {
    expect(
      badgesForMinecraft(response, "22222222-2222-2222-2222-222222222222"),
    ).toEqual([]);
  });
});
