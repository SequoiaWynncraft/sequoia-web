import { describe, expect, it } from "vitest";

import { parseSeasonLeaderboard } from "#lib/server/seasonRankings.js";

describe("parseSeasonLeaderboard", () => {
  it("parses rank-keyed leaderboard entries into an ordered list", () => {
    const result = parseSeasonLeaderboard({
      "2": { name: "Aequitas", prefix: "Aeq", score: 9_093_817, metaScore: 1, banner: {} },
      "1": { name: "Sequoia", prefix: "SEQ", score: 10_564_771.9, restricted: false },
      "3": { name: "Nameless", prefix: null, score: 5 },
      bogus: { name: "Nope", score: 1 },
      "4": "not-an-entry",
    });

    expect(result).toEqual([
      { position: 1, name: "Sequoia", prefix: "SEQ", rating: 10_564_772 },
      { position: 2, name: "Aequitas", prefix: "Aeq", rating: 9_093_817 },
      { position: 3, name: "Nameless", prefix: "", rating: 5 },
    ]);
  });

  it("rejects non-object payloads", () => {
    expect(() => parseSeasonLeaderboard(null)).toThrow("Unexpected Wynncraft leaderboard response.");
  });
});
