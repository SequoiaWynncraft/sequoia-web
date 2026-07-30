import type { RequestHandler } from "./$types";

import type { StageMessage } from "$lib/events/stageProtocol";
import { checkEventManager } from "$lib/server/eventManagers";
import { checkEventMembership } from "$lib/server/eventMembership";
import { eventStore } from "$lib/server/eventStore";
import { subscribe } from "$lib/server/liveRolls";
import { raffleRollStore } from "$lib/server/raffleRolls";
import { requestError } from "$lib/server/requestError";
import { loadViewer } from "$lib/server/viewerSession";

export const prerender = false;

const HEARTBEAT_MS = 25_000;

/**
 * The stage's live feed. Access mirrors the event page: unpublished events
 * 404 for non-managers, member events 403 non-members - a non-member never
 * receives entrant names. Reconnect catch-up is the snapshot: EventSource
 * reconnects on its own, every connect starts with the latest roll per slot,
 * and a mid-spin joiner animates the remainder from `startedAt`.
 */
export const GET: RequestHandler = async ({ params, cookies, fetch, locals }) => {
  const stored = await eventStore.get(params.slug);
  if (!stored) requestError(locals, 404, "No such event");
  const viewer = await loadViewer(cookies.get("seq_session"), fetch);
  if (!stored.published && (await checkEventManager(fetch, viewer)) !== "manager") {
    requestError(locals, 404, "No such event");
  }
  if (stored.event.access === "members") {
    const { membership } = await checkEventMembership(fetch, viewer);
    if (membership !== "member") {
      requestError(locals, 403, "This event's raffles are for guild members.");
    }
  }

  const snapshot = await raffleRollStore.latestForEvent(params.slug);
  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (message: StageMessage) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
      };
      send({ type: "snapshot", rolls: snapshot });
      unsubscribe = subscribe(params.slug, send);
      // Comment frames keep proxies from idling the connection out.
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(":hb\n\n")), HEARTBEAT_MS);
      if (typeof heartbeat === "object" && "unref" in heartbeat) heartbeat.unref();
    },
    cancel() {
      unsubscribe?.();
      clearInterval(heartbeat);
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-store",
      // Tells buffering proxies to pass frames through immediately.
      "x-accel-buffering": "no",
    },
  });
};
