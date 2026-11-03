import { describe, expect, it } from "vitest";

import {
  ANONYMOUS_VIEWER,
  audienceChip,
  canSeePost,
  describeAudience,
  postStatus,
  type PostViewer,
} from "./audience";
import type { GuildPost, PostAudience } from "./types";

const NOW = new Date("2026-09-10T12:00:00Z");

function post(audience: PostAudience, extra: Partial<GuildPost> = {}): GuildPost {
  return {
    slug: "hello",
    feed: "news",
    title: "Hello",
    summary: "A post.",
    body: "Body.",
    audience,
    theme: { sky: ["#000000", "#111111"], accent: "#ffffff", accentSecondary: "#eeeeee", star: "#dddddd" },
    ...extra,
  };
}

const SIGNED_IN: PostViewer = { ...ANONYMOUS_VIEWER, tier: "signedIn" };
const MEMBER: PostViewer = { tier: "member", guildRank: "captain", seqRank: "Druid", branches: ["events"] };
const MANAGER: PostViewer = { ...ANONYMOUS_VIEWER, tier: "manager" };

describe("post status", () => {
  it("orders draft, scheduled, expired, live", () => {
    expect(postStatus({}, false, NOW)).toBe("draft");
    expect(postStatus({ publishAt: "2026-09-11T00:00:00.000Z" }, true, NOW)).toBe("scheduled");
    expect(postStatus({ expiresAt: NOW.toISOString() }, true, NOW)).toBe("expired");
    expect(postStatus({ publishAt: NOW.toISOString(), expiresAt: "2026-09-11T00:00:00.000Z" }, true, NOW)).toBe(
      "live",
    );
  });
});

describe("canSeePost", () => {
  it("applies each tier to each viewer", () => {
    const cases: [PostAudience["tier"], boolean[]][] = [
      ["everyone", [true, true, true, true]],
      ["signedIn", [false, true, true, true]],
      ["members", [false, false, true, true]],
      ["managers", [false, false, false, true]],
    ];
    for (const [tier, expected] of cases) {
      const seen = [ANONYMOUS_VIEWER, SIGNED_IN, MEMBER, MANAGER].map((viewer) =>
        canSeePost(post({ tier }), true, viewer, NOW),
      );
      expect(seen, tier).toEqual(expected);
    }
  });

  it("hides drafts, scheduled, and expired posts from everyone but managers", () => {
    const hidden = [
      [post({ tier: "everyone" }), false],
      [post({ tier: "everyone" }, { publishAt: "2026-09-11T00:00:00.000Z" }), true],
      [post({ tier: "everyone" }, { expiresAt: "2026-09-01T00:00:00.000Z" }), true],
    ] as const;
    for (const [entry, published] of hidden) {
      expect(canSeePost(entry, published, MEMBER, NOW)).toBe(false);
      expect(canSeePost(entry, published, MANAGER, NOW)).toBe(true);
    }
  });

  it("narrows members with ANY-of matching across ranks and branches", () => {
    const admits = (audience: Omit<PostAudience, "tier">, viewer: PostViewer = MEMBER) =>
      canSeePost(post({ tier: "members", ...audience }), true, viewer, NOW);
    expect(admits({ guildRanks: ["chief", "captain"] })).toBe(true);
    expect(admits({ seqRanks: ["druid"] })).toBe(true);
    expect(admits({ branches: ["events"] })).toBe(true);
    expect(admits({ guildRanks: ["owner"], branches: ["events"] })).toBe(true);
    expect(admits({ guildRanks: ["owner"], seqRanks: ["Treant"], branches: ["treasury"] })).toBe(false);
    expect(admits({ guildRanks: ["owner"] }, MANAGER)).toBe(true);
  });

  it("fails closed when the rank profile could not be verified", () => {
    const unverified: PostViewer = { ...MEMBER, seqRank: null, branches: [] };
    expect(canSeePost(post({ tier: "members", seqRanks: ["Druid"] }), true, unverified, NOW)).toBe(false);
    expect(canSeePost(post({ tier: "members", branches: ["events"] }), true, unverified, NOW)).toBe(false);
    expect(canSeePost(post({ tier: "members", guildRanks: ["captain"] }), true, unverified, NOW)).toBe(true);
  });
});

describe("audience copy", () => {
  it("describes narrowed audiences in plain language", () => {
    expect(
      describeAudience({ tier: "members", guildRanks: ["captain", "chief"], branches: ["events"] }),
    ).toBe("Guild members with any of: guild rank Captain or Chief; Events branch.");
    expect(describeAudience({ tier: "members" })).toBe("Every guild member.");
    expect(audienceChip({ tier: "everyone" })).toBeNull();
    expect(audienceChip({ tier: "members", seqRanks: ["Druid"] })).toBe("Some members");
  });
});
