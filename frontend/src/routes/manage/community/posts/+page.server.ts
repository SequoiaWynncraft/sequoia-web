import type { PageServerLoad } from "./$types";

import type { EventTheme } from "$lib/events/types";
import { audienceChip, postStatus } from "$lib/posts/audience";
import type { PostFeed, PostStatus } from "$lib/posts/types";
import { pageAreaAccess } from "$lib/server/manageCapabilities";
import { postStore } from "$lib/server/postStore";

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
  // Re-resolved per page load: the console layout's capabilities are cached
  // across child navigations, so they must not gate protected data here.
  const access = await pageAreaAccess(fetch, viewer, "community");
  const feedParam = url.searchParams.get("feed");
  const feed: PostFeed | "all" = feedParam === "news" || feedParam === "announcements" ? feedParam : "all";
  // Set by the delete redirect when the audit row for it did not land.
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
  // Stable sort: newest first within each status, as the store returns them.
  entries.sort((a, b) => STATUS_ORDER[a.status] - STATUS_ORDER[b.status]);
  return { access, feed, entries, auditWarning };
};
