import { describe, expect, it } from "vitest";

import { parseGuildStats } from "#lib/server/guildStats.js";

const guildPayload = {
  name: "Sequoia",
  prefix: "SEQ",
  level: 240,
  xpPercent: 81,
  territories: 55,
  wars: 149_345,
  raids: 142_909,
  created: "2022-10-14T22:10:52.761000Z",
  online: 22,
  seasonRanks: {
    "30": { rating: 17_805_406, finalTerritories: 71 },
    "31": { rating: 10_564_772, finalTerritories: 0 },
    "8": { rating: 12_345, finalTerritories: 3 },
  },
  ranking: {
    guildSeason31: 1,
    guildTotalRaids: 1,
    ignoredBadValue: "first",
  },
  members: {
    total: 2,
    owner: {
      OwnerName: {
        uuid: "66efb975-31b4-499e-9b46-a34980edd8ee",
        legacyName: "OwnerName",
        online: true,
        server: "EU37",
        lastJoin: "2026-07-09T20:06:01.631000Z",
        contributed: 31_138_043_316_738,
        contributionRank: 5,
        joined: "2023-03-14T19:21:11.556000Z",
        globalData: {
          wars: 11_397,
          totalLevel: 5328,
          completedQuests: 262,
          playtime: 11_363.75,
          dungeons: { total: 843, list: { "Decrepit Sewers": 20 } },
          raids: {
            total: 19_690,
            list: { "The Canyon Colossus": 5580, "The Nameless Anomaly": 10_733 },
          },
        },
      },
    },
    recruit: {
      QuietMember: {
        uuid: "3fd99054-e0ac-4b45-90fb-fa194b9fae8f",
        online: false,
        server: null,
        lastJoin: null,
        contributed: 0,
        contributionRank: 1,
        joined: null,
        restrictions: { online_status: true },
        globalData: null,
      },
    },
  },
};

describe("parseGuildStats", () => {
  it("parses guild meta, season history, rankings, and the full roster", () => {
    const result = parseGuildStats(guildPayload, "2026-07-09T20:00:00.000Z");

    expect(result.generated_at).toBe("2026-07-09T20:00:00.000Z");
    expect(result.guild).toEqual({
      name: "Sequoia",
      prefix: "SEQ",
      level: 240,
      xp_percent: 81,
      territories: 55,
      wars: 149_345,
      raids: 142_909,
      created: "2022-10-14T22:10:52.761000Z",
      online_now: 22,
      members_total: 2,
    });
    expect(result.season_ranks).toEqual([
      { season: 8, rating: 12_345, final_territories: 3 },
      { season: 30, rating: 17_805_406, final_territories: 71 },
      { season: 31, rating: 10_564_772, final_territories: 0 },
    ]);
    expect(result.rankings).toEqual({ guildSeason31: 1, guildTotalRaids: 1 });

    expect(result.members).toHaveLength(2);
    const [quiet, owner] = result.members;
    expect(owner).toMatchObject({
      username: "OwnerName",
      rank: "owner",
      online: true,
      server: "EU37",
      playtime: 11_363.75,
      wars: 11_397,
      raids_total: 19_690,
      raids: { "The Canyon Colossus": 5580, "The Nameless Anomaly": 10_733 },
      dungeons_total: 843,
      total_level: 5328,
      quests: 262,
    });
    expect(quiet).toMatchObject({
      username: "QuietMember",
      rank: "recruit",
      online: null,
      server: null,
      playtime: null,
      wars: null,
      raids_total: null,
      raids: {},
      joined: null,
      last_join: null,
    });
  });

  it("rejects payloads without a member map", () => {
    expect(() => parseGuildStats({ level: 1 })).toThrow("Unexpected Wynncraft guild response.");
  });
});
