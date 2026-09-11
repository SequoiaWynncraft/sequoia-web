import type { SubmitFunction } from "@sveltejs/kit";

import type { GuildRankName } from "$lib/api/guildStats";
import { keepInstant, toInput } from "$lib/events/editor/draft.svelte";
import type { EventTheme } from "$lib/events/types";
import type { ManageBranchKey } from "$lib/manage/types";

import { describeAudience } from "../audience";
import type { GuildPost, PostAudience, PostFeed, PostTier } from "../types";
import { parseGuildPost } from "../validate";

export const SKY_PRESETS: readonly { name: string; theme: EventTheme }[] = [
  {
    name: "Gold",
    theme: { sky: ["#15110a", "#2a2012"], accent: "#e8a33d", accentSecondary: "#f3d18a", star: "#f0c878" },
  },
  {
    name: "Violet",
    theme: { sky: ["#171120", "#251b38"], accent: "#a78bfa", accentSecondary: "#8fb2f0", star: "#c4b5fd" },
  },
  {
    name: "Forest",
    theme: { sky: ["#0c1610", "#15271b"], accent: "#57cc82", accentSecondary: "#a8e063", star: "#9fdcb4" },
  },
  {
    name: "Ocean",
    theme: { sky: ["#0b1420", "#13263a"], accent: "#5ab4f0", accentSecondary: "#8fe3e0", star: "#a9d4f5" },
  },
  {
    name: "Ember",
    theme: { sky: ["#1a0e0c", "#2e1712"], accent: "#f07a5a", accentSecondary: "#f5b25a", star: "#f5b8a0" },
  },
];

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9]+/g, "-")
    .slice(0, 64)
    .replace(/^-+|-+$/g, "");
}

function toggled<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((entry) => entry !== value) : [...list, value];
}

/**
 * Editor state for one post. Seeded once from the stored post; the parent
 * remounts the editor via {#key} when the slug changes.
 */
export class PostDraft {
  readonly mode: "create" | "edit";

  slug = $state("");
  slugEdited = $state(false);
  title = $state("");
  feed = $state<PostFeed>("news");
  summary = $state("");
  body = $state("");
  published = $state(false);
  pinned = $state(false);

  tier = $state<PostTier>("everyone");
  // Kept while the tier is switched away, so flipping back restores the picks.
  guildRanks = $state<GuildRankName[]>([]);
  seqRanks = $state<string[]>([]);
  branches = $state<ManageBranchKey[]>([]);

  publishAt = $state("");
  expiresAt = $state("");
  // The stored instants, so an untouched minute-level input keeps its seconds.
  seedPublishAt = $state("");
  seedExpiresAt = $state("");

  skyTop = $state(SKY_PRESETS[0].theme.sky[0]);
  skyBottom = $state(SKY_PRESETS[0].theme.sky[1]);
  accent = $state(SKY_PRESETS[0].theme.accent);
  accentSecondary = $state(SKY_PRESETS[0].theme.accentSecondary);
  star = $state(SKY_PRESETS[0].theme.star);

  /** The stored version this draft is based on; sent back so a stale save is rejected. */
  knownUpdatedAt = $state<number | null>(null);
  saving = $state(false);
  showValidation = $state(false);

  constructor(seed: {
    mode: "create" | "edit";
    initial: GuildPost | null;
    initialPublished: boolean;
    initialUpdatedAt: number | null;
    initialFeed: PostFeed;
  }) {
    this.mode = seed.mode;
    this.knownUpdatedAt = seed.initialUpdatedAt;
    const post = seed.initial;
    if (!post) {
      this.feed = seed.initialFeed;
      // Announcements are guild business more often than not.
      this.tier = seed.initialFeed === "announcements" ? "members" : "everyone";
      return;
    }
    this.slug = post.slug;
    this.slugEdited = true;
    this.title = post.title;
    this.feed = post.feed;
    this.summary = post.summary;
    this.body = post.body;
    this.published = seed.initialPublished;
    this.pinned = post.pinned === true;
    this.tier = post.audience.tier;
    this.guildRanks = [...(post.audience.guildRanks ?? [])];
    this.seqRanks = [...(post.audience.seqRanks ?? [])];
    this.branches = [...(post.audience.branches ?? [])];
    this.seedPublishAt = post.publishAt ?? "";
    this.seedExpiresAt = post.expiresAt ?? "";
    this.publishAt = toInput(post.publishAt);
    this.expiresAt = toInput(post.expiresAt);
    this.applyTheme(post.theme);
  }

  readonly theme: EventTheme = $derived({
    sky: [this.skyTop, this.skyBottom],
    accent: this.accent,
    accentSecondary: this.accentSecondary,
    star: this.star,
  });

  readonly post: GuildPost = $derived.by(() => {
    const audience: PostAudience = { tier: this.tier };
    if (this.tier === "members") {
      if (this.guildRanks.length > 0) audience.guildRanks = [...this.guildRanks];
      if (this.seqRanks.length > 0) audience.seqRanks = [...this.seqRanks];
      if (this.branches.length > 0) audience.branches = [...this.branches];
    }
    const post: GuildPost = {
      slug: this.slug,
      feed: this.feed,
      title: this.title,
      summary: this.summary,
      body: this.body,
      audience,
      theme: this.theme,
    };
    if (this.pinned) post.pinned = true;
    if (this.publishAt) post.publishAt = keepInstant(this.publishAt, this.seedPublishAt);
    if (this.expiresAt) post.expiresAt = keepInstant(this.expiresAt, this.seedExpiresAt);
    return post;
  });

  readonly payload = $derived(JSON.stringify({ post: this.post, published: this.published }));

  /** The same validator the server runs, so problems surface before submitting. */
  readonly liveError = $derived.by(() => {
    const parsed = parseGuildPost(this.post);
    return parsed.ok ? null : parsed.error;
  });

  readonly audienceText = $derived(describeAudience(this.post.audience));

  syncSlug() {
    if (this.mode === "create" && !this.slugEdited) this.slug = slugify(this.title);
  }

  applyTheme(theme: EventTheme) {
    [this.skyTop, this.skyBottom] = theme.sky;
    this.accent = theme.accent;
    this.accentSecondary = theme.accentSecondary;
    this.star = theme.star;
  }

  toggleGuildRank(rank: GuildRankName) {
    this.guildRanks = toggled(this.guildRanks, rank);
  }

  toggleSeqRank(rank: string) {
    this.seqRanks = toggled(this.seqRanks, rank);
  }

  toggleBranch(branch: ManageBranchKey) {
    this.branches = toggled(this.branches, branch);
  }

  readonly submit: SubmitFunction = ({ cancel }) => {
    this.showValidation = true;
    if (this.liveError) {
      cancel();
      return;
    }
    this.saving = true;
    return async ({ result, update }) => {
      this.saving = false;
      if (result.type === "success") {
        const data = result.data as { newUpdatedAt?: number; publishAt?: string | null } | undefined;
        // Adopt exactly the version this save wrote - not the reloaded page
        // data, which may already contain someone else's later save.
        this.knownUpdatedAt = data?.newUpdatedAt ?? this.knownUpdatedAt;
        // Show the date the server stamped, so the next save keeps it.
        if (data?.publishAt && !this.publishAt) {
          this.seedPublishAt = data.publishAt;
          this.publishAt = toInput(data.publishAt);
        }
      }
      await update({ reset: false });
    };
  };
}
