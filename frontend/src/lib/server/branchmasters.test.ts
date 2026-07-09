import { describe, expect, it } from "vitest";

import { parseWynncraftBranchmasters } from "$lib/server/branchmasters";

describe("parseWynncraftBranchmasters", () => {
  it("flattens owner, chief, and strategist members from Wynncraft guild payloads", () => {
    const result = parseWynncraftBranchmasters({
      members: {
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

    expect(result.members).toEqual([
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
        wars: 0,
        raids: 0,
        joined: "2024-03-01T00:00:00Z",
      },
    ]);
  });
});
