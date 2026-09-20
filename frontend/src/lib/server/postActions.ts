import { fail, redirect, type RequestEvent } from "@sveltejs/kit";

import type { GuildPost } from "$lib/posts/types";
import { parseGuildPost } from "$lib/posts/validate";
import type { Viewer } from "$lib/site/viewer";

import { recordAudit } from "./auditLog";
import { requireBranchArea } from "./branchAccess";
import { postStore } from "./postStore";
import { requestError } from "./requestError";

const POSTS_CONSOLE = "/manage/community/posts";

const DENIED = "Posts are managed by the Community branch and guild leadership";

function requirePostManager(event: RequestEvent): Promise<Viewer> {
  return requireBranchArea(event, "community", DENIED);
}

/** The editor's JSON payload: the post plus whether it is published. */
function parsePostPayload(form: FormData): { post: GuildPost; published: boolean } | { error: string } {
  const raw = form.get("payload");
  if (typeof raw !== "string" || raw.length > 65536) return { error: "Malformed submission." };
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return { error: "Malformed submission." };
  }
  if (typeof json !== "object" || json === null) return { error: "Malformed submission." };
  const record = json as { post?: unknown; published?: unknown };
  const parsed = parseGuildPost(record.post);
  if (!parsed.ok) return { error: parsed.error };
  return { post: parsed.post, published: record.published === true };
}

/** Number(null) and Number("") are 0, so a missing token must be NaN to read as malformed. */
function baseUpdatedAt(form: FormData): number {
  const raw = form.get("baseUpdatedAt");
  return typeof raw === "string" && raw.trim() !== "" ? Number(raw) : Number.NaN;
}

/**
 * Server-owned fields, applied before the final validation:
 * - the author stays whoever created the post;
 * - a published post without a date is dated now, so the feed order is stable.
 *   A cleared date that had already passed is kept, but a cleared *future*
 *   date publishes now instead of silently staying scheduled.
 */
export function withServerFields(
  post: GuildPost,
  published: boolean,
  actor: Viewer,
  prior: GuildPost | null,
  now: Date,
): GuildPost {
  const next: GuildPost = { ...post };
  const author = prior ? prior.author : (actor.minecraftUsername ?? actor.discordUsername ?? undefined);
  if (author) next.author = author;
  else delete next.author;
  if (!next.publishAt && published) {
    const passed = prior?.publishAt && Date.parse(prior.publishAt) <= now.getTime();
    next.publishAt = passed ? prior.publishAt : now.toISOString();
  }
  return next;
}

function auditDetail(post: GuildPost, published: boolean): string {
  return `${post.feed} · ${published ? "published" : "draft"} · ${post.audience.tier}`;
}

export async function createPostAction(event: RequestEvent) {
  const manager = await requirePostManager(event);
  const payload = parsePostPayload(await event.request.formData());
  if ("error" in payload) return fail(400, { error: payload.error });
  const parsed = parseGuildPost(withServerFields(payload.post, payload.published, manager, null, new Date()));
  if (!parsed.ok) return fail(400, { error: parsed.error });
  const post = parsed.post;
  if (!(await postStore.insert(post, { published: payload.published }))) {
    return fail(400, { error: `a post already uses the slug "${post.slug}"` });
  }
  const audited = await recordAudit(manager, "post.create", post.slug, auditDetail(post, payload.published));
  // The post exists either way; an unrecorded creation must not pass silently.
  redirect(303, `${POSTS_CONSOLE}/${post.slug}${audited ? "" : "?audit=unrecorded"}`);
}

export async function updatePostAction(event: RequestEvent) {
  const manager = await requirePostManager(event);
  const slug = event.params.slug ?? "";
  const form = await event.request.formData();
  const payload = parsePostPayload(form);
  if ("error" in payload) return fail(400, { error: payload.error });
  if (payload.post.slug !== slug) return fail(400, { error: "the slug cannot be changed" });

  const stored = await postStore.get(slug);
  if (!stored) requestError(event.locals, 404, "No such post");
  // Optimistic concurrency against the version the form loaded from, as for
  // events: another manager's save must not be silently clobbered.
  if (baseUpdatedAt(form) !== stored.updatedAt) {
    return fail(409, { error: "Someone else changed this post. Reload, then save again." });
  }
  const parsed = parseGuildPost(
    withServerFields(payload.post, payload.published, manager, stored.post, new Date()),
  );
  if (!parsed.ok) return fail(400, { error: parsed.error });
  const newUpdatedAt = await postStore.update(parsed.post, {
    published: payload.published,
    ifUpdatedAt: stored.updatedAt,
  });
  if (newUpdatedAt === null) {
    return fail(409, { error: "Someone else changed this post. Reload, then save again." });
  }
  const audited = await recordAudit(manager, "post.update", slug, auditDetail(parsed.post, payload.published));
  // The editor adopts the stamped publish date so the next save doesn't re-stamp it.
  return { saved: true, newUpdatedAt, publishAt: parsed.post.publishAt ?? null, auditWarning: !audited };
}

export async function deletePostAction(event: RequestEvent) {
  const manager = await requirePostManager(event);
  const slug = event.params.slug ?? "";
  const base = baseUpdatedAt(await event.request.formData());
  if (!Number.isSafeInteger(base)) return fail(400, { error: "Reload the page before deleting." });
  // Guarded on the version the manager reviewed; an already-gone post is done, not a conflict.
  if (!(await postStore.remove(slug, { ifUpdatedAt: base }))) {
    if (!(await postStore.get(slug))) redirect(303, POSTS_CONSOLE);
    return fail(409, { error: "Someone else changed this post. Reload before deleting." });
  }
  const audited = await recordAudit(manager, "post.delete", slug);
  redirect(303, `${POSTS_CONSOLE}${audited ? "" : "?audit=unrecorded"}`);
}
