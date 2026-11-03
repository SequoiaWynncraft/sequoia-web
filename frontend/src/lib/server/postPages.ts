import { redirect } from "@sveltejs/kit";

import type { EventTheme } from "#lib/events/types.js";
import { audienceAdmits, audienceChip, canSeePost, postStatus } from "#lib/posts/audience.js";
import { postHref, type PostFeed, type PostStatus } from "#lib/posts/types.js";
import type { Viewer } from "#lib/site/viewer.js";

import { postStore, type StoredPost } from "./postStore";
import { resolvePostViewer } from "./postVisibility";
import { requestError } from "./requestError";

export interface PostCard {
  slug: string;
  feed: PostFeed;
  title: string;
  summary: string;
  theme: EventTheme;
  pinned: boolean;
  status: PostStatus;
  date: string;
  author: string | null;
  audience: string | null;
}

export interface PostView extends PostCard {
  body: string;
}

export interface PostHub {
  pinned: PostCard[];
  latest: PostCard[];
  upcoming: PostCard[];
  expired: PostCard[];
  manager: boolean;
  signedIn: boolean;
}

function postCard({ post, published, updatedAt }: StoredPost, now: Date, manager: boolean): PostCard {
  return {
    slug: post.slug,
    feed: post.feed,
    title: post.title,
    summary: post.summary,
    theme: post.theme,
    pinned: post.pinned === true,
    status: postStatus(post, published, now),
    date: post.publishAt ?? new Date(updatedAt).toISOString(),
    author: post.author ?? null,
    audience: manager ? audienceChip(post.audience) : null,
  };
}

const newestFirst = (a: PostCard, b: PostCard) => Date.parse(b.date) - Date.parse(a.date);

const HOMEPAGE_POST_MAX_AGE_MS = 3 * 24 * 60 * 60 * 1000;

export async function loadPostHub(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
  feed: PostFeed,
  now = new Date(),
): Promise<PostHub> {
  const [postViewer, stored] = await Promise.all([
    resolvePostViewer(fetchImpl, viewer),
    postStore.list(),
  ]);
  const manager = postViewer.tier === "manager";
  const hub: PostHub = { pinned: [], latest: [], upcoming: [], expired: [], manager, signedIn: viewer !== null };
  const cards = stored
    .filter((entry) => entry.post.feed === feed && canSeePost(entry.post, entry.published, postViewer, now))
    .map((entry) => postCard(entry, now, manager))
    .sort(newestFirst);
  for (const card of cards) {
    if (card.status === "draft" || card.status === "scheduled") hub.upcoming.push(card);
    else if (card.status === "expired") hub.expired.push(card);
    else (card.pinned ? hub.pinned : hub.latest).push(card);
  }
  return hub;
}

export async function loadLatestPosts(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
  limit = 1,
  now = new Date(),
): Promise<PostCard[]> {
  const [postViewer, stored] = await Promise.all([
    resolvePostViewer(fetchImpl, viewer),
    postStore.list(),
  ]);
  return stored
    .filter(
      (entry) =>
        postStatus(entry.post, entry.published, now) === "live" &&
        audienceAdmits(entry.post.audience, postViewer),
    )
    .map((entry) => postCard(entry, now, false))
    .filter((card) => now.getTime() - Date.parse(card.date) <= HOMEPAGE_POST_MAX_AGE_MS)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || newestFirst(a, b))
    .slice(0, limit);
}

export async function loadPostPage(
  fetchImpl: typeof fetch,
  locals: App.Locals,
  viewer: Viewer | null,
  feed: PostFeed,
  slug: string,
  now = new Date(),
): Promise<{ post: PostView; manager: boolean }> {
  const [postViewer, stored] = await Promise.all([
    resolvePostViewer(fetchImpl, viewer),
    postStore.get(slug),
  ]);
  if (!stored || !canSeePost(stored.post, stored.published, postViewer, now)) {
    requestError(locals, 404, "No such post");
  }
  // 307, not 308: a manager can move a post between feeds, and a cached
  // permanent redirect would loop once it moves back.
  if (stored.post.feed !== feed) redirect(307, postHref(stored.post));
  const manager = postViewer.tier === "manager";
  return { post: { ...postCard(stored, now, manager), body: stored.post.body }, manager };
}
