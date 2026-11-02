import { createClient } from "@libsql/client";
import { describe, expect, it } from "vitest";

import type { GuildPost } from "#lib/posts/types.js";

import { createPostStore } from "./postStore";

function memoryStore() {
  const client = createClient({ url: ":memory:" });
  return { client, store: createPostStore(() => Promise.resolve(client)) };
}

function post(slug: string, extra: Partial<GuildPost> = {}): GuildPost {
  return {
    slug,
    feed: "news",
    title: `Post ${slug}`,
    summary: "Summary.",
    body: "Body.",
    audience: { tier: "everyone" },
    theme: { sky: ["#000000", "#111111"], accent: "#ffffff", accentSecondary: "#eeeeee", star: "#dddddd" },
    ...extra,
  };
}

describe("post store", () => {
  it("starts empty and round-trips posts newest first", async () => {
    const { store } = memoryStore();
    expect(await store.list()).toEqual([]);
    expect(await store.insert(post("first"), { published: true })).toBe(true);
    expect(await store.insert(post("second", { feed: "announcements" }), { published: false })).toBe(true);

    const listed = await store.list();
    expect(listed.map((entry) => [entry.post.slug, entry.published])).toEqual([
      ["second", false],
      ["first", true],
    ]);
    expect((await store.get("second"))?.post.feed).toBe("announcements");
    expect(await store.get("missing")).toBeNull();
  });

  it("refuses a slug already used by either feed", async () => {
    const { store } = memoryStore();
    await store.insert(post("shared"), { published: true });
    expect(await store.insert(post("shared", { feed: "announcements" }), { published: true })).toBe(false);
  });

  it("guards updates and deletes on the version that was read", async () => {
    const { store } = memoryStore();
    await store.insert(post("guarded"), { published: false });
    const stored = await store.get("guarded");
    if (!stored) throw new Error("missing");

    const next = await store.update(post("guarded", { title: "Renamed" }), {
      published: true,
      ifUpdatedAt: stored.updatedAt,
    });
    expect(next).toBeGreaterThan(stored.updatedAt);
    // The old token lost: a stale tab can neither save nor delete.
    expect(await store.update(post("guarded"), { published: true, ifUpdatedAt: stored.updatedAt })).toBeNull();
    expect(await store.remove("guarded", { ifUpdatedAt: stored.updatedAt })).toBe(false);

    expect((await store.get("guarded"))?.post.title).toBe("Renamed");
    expect(await store.remove("guarded", { ifUpdatedAt: next as number })).toBe(true);
    expect(await store.get("guarded")).toBeNull();
  });

  it("drops rows that no longer validate", async () => {
    const { client, store } = memoryStore();
    await store.insert(post("good"), { published: true });
    await client.execute(
      "INSERT INTO guild_posts (slug, feed, data, published, created_at, updated_at) VALUES ('bad', 'news', '{\"slug\":1}', 1, 0, 0)",
    );
    expect((await store.list()).map((entry) => entry.post.slug)).toEqual(["good"]);
  });
});
