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

export type RequestsAccess = "signin" | "unverified" | "notMember" | "member";

function toViewerQueue(entries: RewardQueueSourceEntry[], viewerDiscordId: string): RewardQueueEntry[] {
  return entries.map(({ discordId, ...entry }) => ({ ...entry, isViewer: discordId === viewerDiscordId }));
}

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
  aspect: (event) => submitRequest("aspect", event),
  tome: (event) => submitRequest("tome", event),
};
