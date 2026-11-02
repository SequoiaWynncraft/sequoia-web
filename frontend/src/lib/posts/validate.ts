import { GUILD_RANKS, type GuildRankName } from "#lib/api/guildStats.js";
import { parseEventTheme } from "#lib/events/validate.js";
import type { ManageBranchKey } from "#lib/manage/types.js";

import { POST_BRANCHES } from "./audience";
import type { GuildPost, PostAudience, PostFeed, PostTier } from "./types";

export type PostParseResult = { ok: true; post: GuildPost } | { ok: false; error: string };

/** Route segments under the feeds and the console a post slug must never shadow. */
const RESERVED_SLUGS = new Set(["new"]);
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const ZONED_PATTERN = /(?:z|[+-]\d\d:\d\d)$/i;
const FEEDS: readonly PostFeed[] = ["news", "announcements"];
const TIERS: readonly PostTier[] = ["everyone", "signedIn", "members", "managers"];
const BRANCH_KEYS: readonly string[] = POST_BRANCHES.map((branch) => branch.key);

export const MAX_POST_BODY = 20_000;
const MAX_SEQ_RANKS = 40;

/**
 * Strict parser for post data crossing a trust boundary: management form
 * submissions and database rows. Mirrors `parseGuildEvent` - unknown fields are
 * dropped, strings trimmed, instants normalized, empty narrowing omitted.
 */
export function parseGuildPost(value: unknown): PostParseResult {
  try {
    return { ok: true, post: parsePost(value) };
  } catch (error) {
    if (error instanceof Invalid) return { ok: false, error: error.message };
    throw error;
  }
}

class Invalid extends Error {}

function fail(message: string): never {
  throw new Invalid(message);
}

function parsePost(value: unknown): GuildPost {
  const raw = asRecord(value, "post");
  const theme = parseEventTheme(raw.theme);
  if (!theme.ok) fail(theme.error);
  const post: GuildPost = {
    slug: parseSlug(raw.slug),
    feed: parseFeed(raw.feed),
    title: requiredText(raw.title, "title", 120),
    summary: requiredText(raw.summary, "summary", 240),
    body: requiredText(raw.body, "body", MAX_POST_BODY),
    audience: parseAudience(raw.audience),
    theme: theme.theme,
  };
  if (raw.pinned === true) post.pinned = true;

  const publishAt = present(raw.publishAt) ? parseInstant(raw.publishAt, "publish date") : undefined;
  const expiresAt = present(raw.expiresAt) ? parseInstant(raw.expiresAt, "expiry date") : undefined;
  if (publishAt && expiresAt && Date.parse(expiresAt) <= Date.parse(publishAt)) {
    fail("the post must expire after it is published");
  }
  if (publishAt) post.publishAt = publishAt;
  if (expiresAt) post.expiresAt = expiresAt;

  const author = optionalText(raw.author, "author", 64);
  if (author) post.author = author;
  return post;
}

function parseSlug(value: unknown): string {
  const slug = requiredText(value, "slug", 64);
  if (!SLUG_PATTERN.test(slug)) fail("slug must be lowercase words separated by hyphens");
  if (RESERVED_SLUGS.has(slug)) fail(`"${slug}" is a reserved slug`);
  return slug;
}

function parseFeed(value: unknown): PostFeed {
  if (!FEEDS.includes(value as PostFeed)) fail("pick a feed: news or announcements");
  return value as PostFeed;
}

function parseAudience(value: unknown): PostAudience {
  const raw = asRecord(value, "audience");
  if (!TIERS.includes(raw.tier as PostTier)) fail("pick who the post is for");
  const audience: PostAudience = { tier: raw.tier as PostTier };

  const guildRanks = parseChoices(raw.guildRanks, "guild ranks", GUILD_RANKS.length, (rank) =>
    (GUILD_RANKS as readonly string[]).includes(rank),
  );
  const seqRanks = parseChoices(raw.seqRanks, "Sequoia ranks", MAX_SEQ_RANKS, (rank) => rank.length <= 40);
  const branches = parseChoices(raw.branches, "branches", BRANCH_KEYS.length, (branch) =>
    BRANCH_KEYS.includes(branch),
  );
  if (guildRanks.length + seqRanks.length + branches.length > 0 && audience.tier !== "members") {
    fail("rank and branch narrowing only applies to guild members");
  }
  if (guildRanks.length > 0) audience.guildRanks = guildRanks as GuildRankName[];
  if (seqRanks.length > 0) audience.seqRanks = seqRanks;
  if (branches.length > 0) audience.branches = branches as ManageBranchKey[];
  return audience;
}

function parseChoices(
  value: unknown,
  label: string,
  max: number,
  valid: (entry: string) => boolean,
): string[] {
  if (!present(value)) return [];
  if (!Array.isArray(value)) fail(`${label} must be a list`);
  if (value.length > max) fail(`too many ${label} (max ${max})`);
  const choices: string[] = [];
  for (const entry of value) {
    const text = typeof entry === "string" ? entry.trim() : "";
    if (!text || !valid(text)) fail(`${label} contain an unknown value`);
    if (!choices.includes(text)) choices.push(text);
  }
  return choices;
}

function parseInstant(value: unknown, label: string): string {
  if (typeof value !== "string" || !ZONED_PATTERN.test(value.trim()) || Number.isNaN(Date.parse(value))) {
    fail(`${label} must be an ISO instant with a timezone`);
  }
  return new Date(Date.parse(value)).toISOString();
}

function requiredText(value: unknown, label: string, maxLength: number): string {
  if (typeof value !== "string") fail(`${label} is required`);
  const text = value.trim();
  if (text.length === 0) fail(`${label} is required`);
  if (text.length > maxLength) fail(`${label} is too long (max ${maxLength} characters)`);
  return text;
}

function optionalText(value: unknown, label: string, maxLength: number): string | undefined {
  if (!present(value)) return undefined;
  if (typeof value !== "string") fail(`${label} must be text`);
  const text = value.trim();
  if (text.length > maxLength) fail(`${label} is too long (max ${maxLength} characters)`);
  return text.length > 0 ? text : undefined;
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) fail(`${label} is malformed`);
  return value as Record<string, unknown>;
}

function present(value: unknown): boolean {
  return value !== undefined && value !== null && value !== "";
}
