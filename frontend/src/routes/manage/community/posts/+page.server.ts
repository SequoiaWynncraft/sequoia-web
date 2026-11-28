import type { PageServerLoad } from "./$types";

import type { EventTheme } from "#lib/events/types.js";
import { audienceChip, postStatus } from "#lib/posts/audience.js";
import type { PostFeed, PostStatus } from "#lib/posts/types.js";
import { pageAreaAccess } from "#lib/server/manageCapabilities.js";
import { postStore } from "#lib/server/postStore.js";

export const prerender = false;

export interface ManagePostEntry {
  slug: string;
  title: string;
  feed: PostFeed;
  theme: EventTheme;
  pinned: boolean;
  status: PostStatus;
  audience: string;
  publishAt: string | null;
}

const STATUS_ORDER: Record<PostStatus, number> = { live: 0, scheduled: 1, draft: 2, expired: 3 };

export const load: PageServerLoad = async ({ fetch, parent, url }) => {
  const { viewer } = await parent();
  const access = await pageAreaAccess(fetch, viewer, "community");
  const feedParam = url.searchParams.get("feed");
  const feed: PostFeed | "all" = feedParam === "news" || feedParam === "announcements" ? feedParam : "all";
  const auditWarning = url.searchParams.get("audit") === "unrecorded";
  if (access !== "granted") return { access, feed, entries: null, auditWarning };

  const now = new Date();
  const entries: ManagePostEntry[] = (await postStore.list())
    .filter(({ post }) => feed === "all" || post.feed === feed)
    .map(({ post, published }) => ({
      slug: post.slug,
      title: post.title,
      feed: post.feed,
      theme: post.theme,
      pinned: post.pinned === true,
      status: postStatus(post, published, now),
      audience: audienceChip(post.audience) ?? "Everyone",
      publishAt: post.publishAt ?? null,
    }));
  entries.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return { access, feed, entries, auditWarning };
};
