import { describe, expect, it } from "vitest";

import { parsePlayerCard } from "#lib/server/playerCard.js";

const playerPayload = {
  username: "GaztheCat",
  uuid: "66efb975-31b4-499e-9b46-a34980edd8ee",
  online: true,
  server: "EU36",
  supportRank: "champion",
  veteran: null,
  firstJoin: "2022-07-16T18:48:19.913000Z",
  lastJoin: "2026-07-09T20:35:49.324000Z",
  playtime: 11_363.75,
  guild: { name: "Sequoia", prefix: "SEQ", rank: "OWNER", rankStars: "★★★★★" },
  globalData: {
    wars: 11_397,
    totalLevel: 5328,
    mobsKilled: 2_676_479,
    chestsFound: 86_064,
    contentCompletion: 6519,
    completedQuests: 262,
    dungeons: { total: 843, list: { "Decrepit Sewers": 20 } },
    raids: { total: 19_694, list: { "The Canyon Colossus": 5580 } },
    pvp: { kills: 0, deaths: 0 },
  },
  ranking: { colossusSrGPlayers: 1, ignored: "text" },
  characters: {
    "char-1": {
      type: "WARRIOR",
      reskin: null,
      nickname: "Rallying Fervor",
      level: 106,
      totalLevel: 327,
      gamemode: ["ironman"],
    },
    "char-2": {
      type: "MAGE",
      nickname: null,
      level: 120,
      totalLevel: 290,
      gamemode: [],
    },
  },
};

describe("parsePlayerCard", () => {
  it("parses the profile, aggregates, and characters sorted by level", () => {
    const result = parsePlayerCard(playerPayload, "2026-07-09T20:00:00.000Z");

    expect(result).toMatchObject({
      generated_at: "2026-07-09T20:00:00.000Z",
      username: "GaztheCat",
      online: true,
      server: "EU36",
      support_rank: "champion",
      veteran: false,
      playtime: 11_363.75,
      guild_rank: "OWNER",
      guild_rank_stars: "★★★★★",
      wars: 11_397,
      total_level: 5328,
      raids_total: 19_694,
      raids: { "The Canyon Colossus": 5580 },
      // The player endpoint never reports the in-guild counter; the roster supplies it.
      current_guild_raids: null,
      pvp_kills: 0,
      pvp_deaths: 0,
      rankings: { colossusSrGPlayers: 1 },
    });
    expect(result.characters.map((character) => character.type)).toEqual(["MAGE", "WARRIOR"]);
  });

  it("hides presence when the profile restricts online status", () => {
    const result = parsePlayerCard({
      ...playerPayload,
      restrictions: { online_status: true },
    });

    expect(result.online).toBeNull();
    expect(result.server).toBeNull();
  });

  it("carries the roster's in-guild raid count and join date when the caller supplies them", () => {
    const result = parsePlayerCard(playerPayload, "2026-07-09T20:00:00.000Z", {
      currentGuildRaids: 17_041,
      guildJoined: "2023-03-14T19:21:11.556000Z",
    });

    expect(result.current_guild_raids).toBe(17_041);
    expect(result.guild_joined).toBe("2023-03-14T19:21:11.556000Z");
  });

  it("leaves the guild join date null without roster extras", () => {
    const result = parsePlayerCard(playerPayload, "2026-07-09T20:00:00.000Z");

    expect(result.guild_joined).toBeNull();
  });

  it("rejects payloads without identity fields", () => {
    expect(() => parsePlayerCard({ username: "x" })).toThrow("Unexpected Wynncraft player response.");
  });
});
