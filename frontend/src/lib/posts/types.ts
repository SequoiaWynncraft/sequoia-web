import type { GuildRankName } from "$lib/api/guildStats";
import type { EventTheme } from "$lib/events/types";
import type { ManageBranchKey } from "$lib/manage/types";

/** Which public feed a post belongs to; both share one store and one editor. */
export type PostFeed = "news" | "announcements";

/**
 * The broadest group a post is shown to. Narrowing (see `PostAudience`) only
 * applies to "members" - every other tier is already a single rule.
 */
export type PostTier = "everyone" | "signedIn" | "members" | "managers";

export interface PostAudience {
  tier: PostTier;
  /**
   * The narrowing lists. Absent or empty means every member; otherwise a member
   * matching ANY entry of ANY list qualifies ("Captains, or the Events branch").
   */
  guildRanks?: GuildRankName[];
  /** Sequoia progression rank labels, as they appear on the org ladder. */
  seqRanks?: string[];
  /** Org branches whose full members (trainees excluded) qualify. */
  branches?: ManageBranchKey[];
}

export interface GuildPost {
  slug: string;
  feed: PostFeed;
  title: string;
  /** One-line teaser for the feed band and the homepage strip. */
  summary: string;
  /** Light markdown - see `parseMarkdown`. */
  body: string;
  audience: PostAudience;
  /** The event sky vocabulary, so posts and events share one look. */
  theme: EventTheme;
  pinned?: boolean;
  /** RFC3339 instant; hidden before it. Stamped on the first published save when empty. */
  publishAt?: string;
  /** RFC3339 instant; hidden from it on. */
  expiresAt?: string;
  /** Display name of the manager who created the post; server-owned. */
  author?: string;
}

/** Where a post stands right now. Only "live" posts reach non-managers. */
export type PostStatus = "draft" | "scheduled" | "live" | "expired";

export const POST_FEEDS: Record<PostFeed, { label: string; href: string }> = {
  news: { label: "News", href: "/news" },
  announcements: { label: "Announcements", href: "/services/announcements" },
};

export function postHref(post: Pick<GuildPost, "feed" | "slug">): string {
  return `${POST_FEEDS[post.feed].href}/${post.slug}`;
}
