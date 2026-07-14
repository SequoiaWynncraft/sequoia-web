import { fail, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { getGuildStats } from "$lib/server/guildStats";
import { sameUuid } from "$lib/server/raidEventBoards";
import { loadViewer } from "$lib/server/viewerSession";
import {
  createRewardQueueRequest,
  MAX_TOME_REASON_LENGTH,
  type CreateRewardQueueResult,
  type RewardRequestType,
} from "$lib/server/rewardQueue";

export const prerender = false;

/** UI gate state. Membership is only ever trusted against a fresh roster; the backend re-checks. */
export type RequestsAccess = "signin" | "unverified" | "notMember" | "member";

/**
 * Resolves the viewer's UI access to the requests page. Mirrors the raid/event pages' trust
 * rules: a signed-out viewer gets "signin", a stale or unreachable roster fails closed to
 * "unverified", and only a fresh-roster match is treated as a "member".
 */
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  if (!viewer) return { access: "signin" as const };

  const stats = await getGuildStats(fetch, { allowStale: false }).catch(() => null);
  const freshRoster = stats !== null && !stats.stale ? stats.members : null;
  if (freshRoster === null) return { access: "unverified" as const };

  const isMember = freshRoster.some(
    (member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid),
  );
  return { access: (isMember ? "member" : "notMember") as RequestsAccess };
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

  let reason: string | null = null;
  if (type === "tome") {
    const raw = (await request.formData()).get("reason");
    reason = typeof raw === "string" ? raw.trim() : "";
    if (reason.length === 0) return fail(400, { type, error: "reason_required" as const });
    if (reason.length > MAX_TOME_REASON_LENGTH) return fail(400, { type, error: "reason_too_long" as const });
  }

  return toActionResult(type, await createRewardQueueRequest(token, type, reason, fetch));
}

export const actions: Actions = {
  /** Requests an aspect from the guild reward queue (no reason required). */
  aspect: (event) => submitRequest("aspect", event),
  /** Requests a tome from the guild reward queue, with a required reason. */
  tome: (event) => submitRequest("tome", event),
};
