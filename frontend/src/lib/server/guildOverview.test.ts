import { describe, expect, it } from "vitest";

import { parseWynncraftGuildOverview } from "$lib/server/guildOverview";

describe("parseWynncraftGuildOverview", () => {
  it("parses homepage counters and flattens the Branchmasters ranks", () => {
    const result = parseWynncraftGuildOverview({
      level: 240,
      territories: 60,
      wars: 149_330,
      raids: 142_884,
      online: 19,
      members: {
        total: 149,
        owner: {
          OwnerName: {
            legacyName: "OwnerName",
            online: true,
            contributed: 300,
            contributionRank: 2,
            joined: "2024-01-01T00:00:00Z",
            globalData: { wars: 10, raids: { total: 5 } },
          },
        },
        chief: {
          ChiefName: {
            legacyName: "ChiefName",
            online: false,
            contributed: 500,
            contributionRank: 1,
            joined: "2024-02-01T00:00:00Z",
            globalData: { wars: 12, raids: { total: 8 } },
          },
        },
        strategist: {
          StrategistName: {
            legacyName: "StrategistName",
            online: false,
            contributed: 200,
            contributionRank: 3,
            joined: "2024-03-01T00:00:00Z",
            globalData: {},
          },
        },
      },
    });

    expect(result).toEqual({
      generated_at: expect.any(String),
      stale: false,
      stats: {
        members: 149,
        guild_level: 240,
        territories: 60,
        total_wars: 149_330,
        raids: 142_884,
        online_now: 19,
      },
      branchmasters: [
        {
          username: "OwnerName",
          rank: "owner",
          online: true,
          contributed: 300,
          contribution_rank: 2,
          wars: 10,
          raids: 5,
          joined: "2024-01-01T00:00:00Z",
        },
        {
          username: "ChiefName",
          rank: "chief",
          online: false,
          contributed: 500,
          contribution_rank: 1,
          wars: 12,
          raids: 8,
          joined: "2024-02-01T00:00:00Z",
        },
        {
          username: "StrategistName",
          rank: "strategist",
          online: false,
          contributed: 200,
          contribution_rank: 3,
          wars: null,
          raids: null,
          joined: "2024-03-01T00:00:00Z",
        },
      ],
    });
  });

  it("keeps restricted presence and unavailable member stats unknown", () => {
    const result = parseWynncraftGuildOverview({
      level: 1,
      territories: 0,
      wars: 0,
      raids: 0,
      online: 0,
      members: {
        total: 1,
        chief: {
          PrivateMember: {
            online: false,
            restrictions: { online_status: true, main_access: true },
            contributed: 0,
            contributionRank: 1,
            joined: null,
            globalData: null,
          },
        },
      },
    });

    expect(result.branchmasters[0]).toMatchObject({
      username: "PrivateMember",
      online: null,
      wars: null,
      raids: null,
      joined: null,
    });
  });
});
