import { GUILD_RANK_LABELS, type GuildRankName } from "#lib/api/guildStats.js";
import { MANAGE_AREAS } from "#lib/manage/registry.js";
import type { ManageBranchKey } from "#lib/manage/types.js";

import type { GuildPost, PostAudience, PostStatus, PostTier } from "./types";

export const POST_TIER_LABELS: Record<PostTier, string> = {
  everyone: "Everyone",
  signedIn: "Signed-in visitors",
  members: "Guild members",
  managers: "Post managers",
};

/** Branch keys with their console labels, in sidebar order. */
export const POST_BRANCHES: readonly { key: ManageBranchKey; label: string }[] = MANAGE_AREAS.flatMap(
  (area) => (area.branch === null ? [] : [{ key: area.branch, label: area.label }]),
);

export type PostViewerTier = "anonymous" | "signedIn" | "member" | "manager";

/**
 * Everything post visibility is decided on, resolved once per request by
 * `resolvePostViewer`. Unverifiable facts are absent rather than guessed: a
 * viewer whose rank profile could not be read freshly carries no Sequoia rank
 * and no branches, so a post narrowed to those stays hidden from them.
 */
export interface PostViewer {
  tier: PostViewerTier;
  /** In-game rank from the fresh roster; null off-roster. */
  guildRank: GuildRankName | null;
  /** Sequoia rank label; null when unlinked or unverifiable. */
  seqRank: string | null;
  /** Branches held as a full member; empty when unlinked or unverifiable. */
  branches: string[];
}

export const ANONYMOUS_VIEWER: PostViewer = {
  tier: "anonymous",
  guildRank: null,
  seqRank: null,
  branches: [],
};

export function postStatus(
  post: Pick<GuildPost, "publishAt" | "expiresAt">,
  published: boolean,
  now: Date,
): PostStatus {
  if (!published) return "draft";
  if (post.publishAt && Date.parse(post.publishAt) > now.getTime()) return "scheduled";
  if (post.expiresAt && Date.parse(post.expiresAt) <= now.getTime()) return "expired";
  return "live";
}

function isNarrowed(audience: PostAudience): boolean {
  return (
    (audience.guildRanks?.length ?? 0) +
      (audience.seqRanks?.length ?? 0) +
      (audience.branches?.length ?? 0) >
    0
  );
}

/** Whether the audience rules alone admit this viewer, ignoring status. */
export function audienceAdmits(audience: PostAudience, viewer: PostViewer): boolean {
  if (viewer.tier === "manager") return true;
  switch (audience.tier) {
    case "everyone":
      return true;
    case "signedIn":
      return viewer.tier !== "anonymous";
    case "managers":
      return false;
    case "members": {
      if (viewer.tier !== "member") return false;
      if (!isNarrowed(audience)) return true;
      const seqRank = viewer.seqRank?.toLowerCase();
      return (
        (viewer.guildRank !== null && (audience.guildRanks ?? []).includes(viewer.guildRank)) ||
        (seqRank !== undefined &&
          (audience.seqRanks ?? []).some((rank) => rank.toLowerCase() === seqRank)) ||
        (audience.branches ?? []).some((branch) => viewer.branches.includes(branch))
      );
    }
  }
}

/**
 * The one visibility rule for every post surface - feeds, post pages, and the
 * homepage strip. Managers see everything, including drafts, scheduled, and
 * expired posts; everyone else sees only live posts their audience admits.
 */
export function canSeePost(
  post: GuildPost,
  published: boolean,
  viewer: PostViewer,
  now: Date,
): boolean {
  if (viewer.tier === "manager") return true;
  return postStatus(post, published, now) === "live" && audienceAdmits(post.audience, viewer);
}

/** Short badge for managers; null for a post everyone can read. */
export function audienceChip(audience: PostAudience): string | null {
  switch (audience.tier) {
    case "everyone":
      return null;
    case "signedIn":
      return "Signed in";
    case "managers":
      return "Managers";
    case "members":
      return isNarrowed(audience) ? "Some members" : "Members";
  }
}

/** Plain-language answer to "who sees this", for the editor. */
export function describeAudience(audience: PostAudience): string {
  switch (audience.tier) {
    case "everyone":
      return "Everyone, including signed-out visitors.";
    case "signedIn":
      return "Anyone signed in to the website.";
    case "managers":
      return "Only post managers: the Community branch, guild leadership, and website admins.";
    case "members": {
      const parts: string[] = [];
      if (audience.guildRanks?.length) {
        parts.push(`guild rank ${orList(audience.guildRanks.map((rank) => GUILD_RANK_LABELS[rank]))}`);
      }
      if (audience.seqRanks?.length) parts.push(`Sequoia rank ${orList(audience.seqRanks)}`);
      if (audience.branches?.length) {
        const labels = audience.branches.map(branchLabel);
        parts.push(`${orList(labels)} ${labels.length === 1 ? "branch" : "branches"}`);
      }
      return parts.length === 0
        ? "Every guild member."
        : `Guild members with any of: ${parts.join("; ")}.`;
    }
  }
}

function branchLabel(key: string): string {
  return POST_BRANCHES.find((branch) => branch.key === key)?.label ?? key;
}

function orList(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} or ${items.at(-1)}`;
}
