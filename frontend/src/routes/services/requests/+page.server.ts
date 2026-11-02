import { fail, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { getGuildStats } from "#lib/server/guildStats.js";
import { sameUuid } from "#lib/server/raidEventBoards.js";
import { loadViewer } from "#lib/server/viewerSession.js";
import {
  createRewardQueueRequest,
  fetchRewardQueueEligibility,
  fetchRewardQueues,
  type CreateRewardQueueResult,
  type RewardQueueSourceEntry,
  type RewardQueuesResult,
  type RewardRequestType,
} from "#lib/server/rewardQueue.js";
import { MAX_TOME_REASON_LENGTH, type RewardQueueEntry } from "#lib/rewardQueue.js";

export const prerender = false;

/** UI gate state. Membership is only ever trusted against a fresh roster; the backend re-checks. */
export type RequestsAccess = "signin" | "unverified" | "notMember" | "member";

/**
 * Drops every requester's Discord id on the way to the browser, keeping only the one bit the
 * page actually renders from it: whether a given row is the viewer's own. The match happens
 * here, on the id, so it survives an in-game rename without the id itself being serialized
 * into the page for every other member to read.
 */
function toViewerQueue(entries: RewardQueueSourceEntry[], viewerDiscordId: string): RewardQueueEntry[] {
  return entries.map(({ discordId, ...entry }) => ({ ...entry, isViewer: discordId === viewerDiscordId }));
}

/** Applies {@link toViewerQueue} to both queues, passing a failed read through untouched. */
function toViewerQueues(result: RewardQueuesResult, viewerDiscordId: string) {
  if (result.status !== "ok") return { status: "unavailable" as const };
  return {
    status: "ok" as const,
    queues: {
      aspect: toViewerQueue(result.queues.aspect, viewerDiscordId),
      tome: toViewerQueue(result.queues.tome, viewerDiscordId),
    },
  };
}

/**
 * Resolves the viewer's UI access to the requests page. Mirrors the raid/event pages' trust
 * rules: a signed-out viewer gets "signin", a stale or unreachable roster fails closed to
 * "unverified", and only a fresh-roster match is treated as a "member".
 *
 * A member additionally gets the live queues, which are awaited because they are what the
 * page is for, and their eligibility as an *unawaited* promise. Eligibility can cost the
 * backend a Discord role lookup, so it streams in beside the rendered page rather than
 * holding it up. The page renders complete without it: the request forms are server-rendered
 * either way, and a slow or failed check leaves them enabled with the submission as the
 * authority.
 */
export const load: PageServerLoad = async ({ fetch, parent, cookies, depends }) => {
  const { viewer } = await parent();
  if (!viewer) return { access: "signin" as const };

  if (!viewer.websiteAdmin) {
    const stats = await getGuildStats(fetch, { allowStale: false }).catch(() => null);
    const freshRoster = stats !== null && !stats.stale ? stats.members : null;
    if (freshRoster === null) return { access: "unverified" as const };

    const isMember = freshRoster.some(
      (member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid),
    );
    if (!isMember) return { access: "notMember" as const };
  }

  // Lets the page refresh the queues without invalidating every load on the route tree.
  // It does re-run this whole function - `depends` scopes which loads re-run, never which
  // parts of one - so a refresh repeats the membership check and the eligibility read too.
  // The roster comes back off a two-minute server cache, so that part is nearly free; the
  // eligibility call is the one that costs the backend a Discord lookup, and paying it per
  // refresh is accepted rather than accidental.
  depends("app:reward-queue");

  const token = cookies.get("seq_session");
  const queues = token ? await fetchRewardQueues(token, fetch) : ({ status: "unavailable" } as const);
  return {
    access: "member" as const,
    queues: toViewerQueues(queues, viewer.discordId),
    eligibility: token
      ? fetchRewardQueueEligibility(token, fetch)
      : Promise.resolve({ status: "unavailable" } as const),
  };
};

/** Turns a forwarder result into a SvelteKit action return, attributed to the request `type`. */
function toActionResult(type: RewardRequestType, result: CreateRewardQueueResult) {
  switch (result.status) {
    case "created":
      return { submitted: true as const, type, position: result.position };
    case "duplicate":
      return fail(409, { type, error: "duplicate" as const });
    case "forbidden":
      return fail(403, { type, error: "forbidden" as const, message: result.message });
    case "invalid":
      return fail(400, { type, error: "invalid" as const, message: result.message });
    case "signin":
      return fail(401, { type, error: "signin" as const });
    case "unavailable":
      return fail(503, { type, error: "unavailable" as const });
  }
}

/**
 * Submits a reward queue request for the given `type`, reading the reason from the form for
 * tomes. Form actions can't reuse the layout's viewer, so the session token is resolved here.
 */
async function submitRequest(
  type: RewardRequestType,
  { request, cookies, fetch }: Parameters<Actions[string]>[0],
) {
  const token = cookies.get("seq_session");
  if (!token || !(await loadViewer(token, fetch))) return fail(401, { type, error: "signin" as const });

  if (type === "aspect") {
    return toActionResult(type, await createRewardQueueRequest(token, { type: "aspect" }, fetch));
  }

  const raw = (await request.formData()).get("reason");
  const reason = typeof raw === "string" ? raw.trim() : "";
  if (reason.length === 0) return fail(400, { type, error: "reason_required" as const });
  if (reason.length > MAX_TOME_REASON_LENGTH) return fail(400, { type, error: "reason_too_long" as const });

  return toActionResult(type, await createRewardQueueRequest(token, { type: "tome", reason }, fetch));
}

export const actions: Actions = {
  /** Requests an aspect from the guild reward queue (no reason required). */
  aspect: (event) => submitRequest("aspect", event),
  /** Requests a tome from the guild reward queue, with a required reason. */
  tome: (event) => submitRequest("tome", event),
};
