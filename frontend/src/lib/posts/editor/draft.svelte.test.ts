import { describe, expect, it } from "vitest";

import { PostDraft } from "#lib/posts/editor/draft.svelte.js";
import type { GuildPost } from "#lib/posts/types.js";

const POST: GuildPost = {
  slug: "hello",
  feed: "news",
  title: "Hello",
  summary: "Summary.",
  body: "Body.",
  audience: { tier: "everyone" },
  theme: { sky: ["#000000", "#111111"], accent: "#ffffff", accentSecondary: "#eeeeee", star: "#dddddd" },
  publishAt: "2026-09-10T12:34:56.789Z",
  expiresAt: "2026-09-20T08:15:30.500Z",
};

function draft(post: GuildPost = POST): PostDraft {
  return new PostDraft({
    mode: "edit",
    initial: post,
    initialPublished: true,
    initialUpdatedAt: 1,
    initialFeed: post.feed,
  });
}

describe("PostDraft instants", () => {
  it("keeps stored seconds when the minute-level inputs are untouched", () => {
    const edited = draft();
    edited.title = "Renamed";
    expect(edited.post.publishAt).toBe(POST.publishAt);
    expect(edited.post.expiresAt).toBe(POST.expiresAt);
  });

  it("writes whole minutes once an input is changed", () => {
    const edited = draft();
    edited.publishAt = "2026-09-10T12:35";
    expect(edited.post.publishAt).toBe("2026-09-10T12:35:00Z");
    expect(edited.post.expiresAt).toBe(POST.expiresAt);
  });

  it("drops the instant when the input is cleared", () => {
    const edited = draft();
    edited.expiresAt = "";
    expect(edited.post.expiresAt).toBeUndefined();
  });
});
