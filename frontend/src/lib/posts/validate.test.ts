import { describe, expect, it } from "vitest";

import { parseGuildPost } from "./validate";

const VALID = {
  slug: "season-kickoff",
  feed: "news",
  title: "  Season kickoff  ",
  summary: "Everything starting this week.",
  body: "**Welcome** back.",
  audience: { tier: "everyone", guildRanks: [], seqRanks: [], branches: [] },
  theme: { sky: ["#000000", "#111111"], accent: "#FFFFFF", accentSecondary: "#eeeeee", star: "#dddddd" },
  pinned: true,
  publishAt: "2026-09-10T12:00:00Z",
  unknownField: "dropped",
};

function parse(overrides: Record<string, unknown>) {
  return parseGuildPost({ ...VALID, ...overrides });
}

describe("parseGuildPost", () => {
  it("normalizes a valid post", () => {
    const result = parseGuildPost(VALID);
    expect(result).toEqual({
      ok: true,
      post: {
        slug: "season-kickoff",
        feed: "news",
        title: "Season kickoff",
        summary: "Everything starting this week.",
        body: "**Welcome** back.",
        audience: { tier: "everyone" },
        theme: { sky: ["#000000", "#111111"], accent: "#ffffff", accentSecondary: "#eeeeee", star: "#dddddd" },
        pinned: true,
        publishAt: "2026-09-10T12:00:00.000Z",
      },
    });
  });

  it("keeps and dedupes member narrowing", () => {
    const result = parse({
      audience: { tier: "members", guildRanks: ["captain", "captain"], seqRanks: [" Druid "], branches: ["events"] },
    });
    expect(result.ok && result.post.audience).toEqual({
      tier: "members",
      guildRanks: ["captain"],
      seqRanks: ["Druid"],
      branches: ["events"],
    });
  });

  it("rejects invalid posts with a readable reason", () => {
    const cases: [Record<string, unknown>, string][] = [
      [{ title: "  " }, "title is required"],
      [{ slug: "new" }, "reserved"],
      [{ slug: "Bad Slug" }, "slug must be"],
      [{ feed: "blog" }, "pick a feed"],
      [{ audience: { tier: "public" } }, "pick who"],
      [{ audience: { tier: "signedIn", branches: ["events"] } }, "only applies to guild members"],
      [{ audience: { tier: "members", guildRanks: ["emperor"] } }, "unknown value"],
      [{ audience: { tier: "members", branches: ["marketing"] } }, "unknown value"],
      [{ expiresAt: "2026-09-10T11:00:00Z" }, "expire after"],
      [{ publishAt: "2026-09-10T12:00" }, "timezone"],
      [{ theme: { sky: ["#000000"] } }, "two sky colors"],
    ];
    for (const [overrides, message] of cases) {
      const result = parse(overrides);
      expect(result.ok, JSON.stringify(overrides)).toBe(false);
      if (!result.ok) expect(result.error).toContain(message);
    }
  });
});
