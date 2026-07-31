import type { RequestHandler } from "./$types";

import type { StageMessage } from "$lib/events/stageProtocol";
import { checkEventManager } from "$lib/server/eventManagers";
import { checkEventMembership } from "$lib/server/eventMembership";
import { eventStore } from "$lib/server/eventStore";
import { roomEpoch, subscribe } from "$lib/server/liveRolls";
import { raffleRollStore, toStageRoll } from "$lib/server/raffleRolls";
import { requestError } from "$lib/server/requestError";
import { loadViewer } from "$lib/server/viewerSession";

export const prerender = false;

const HEARTBEAT_MS = 25_000;
/**
 * Streams are closed and reopened on a cadence: authorization is judged at
 * connect time, and event-driven teardowns can't see external changes like
 * a member leaving the roster. A bounded lifetime turns those into "at most
 * ten more minutes" instead of "until the tab closes" - the browser's
 * reconnect repeats the membership check, and a mid-spin cut only costs the
 * animation (the reconnect snapshot restores the roll).
 */
const MAX_STREAM_MS = 10 * 60_000;

/**
 * The stage's live feed. Access mirrors the event page: unpublished events
 * 404 for non-managers, member events 403 non-members - a non-member never
 * receives entrant names. Reconnect catch-up is the snapshot: EventSource
 * reconnects on its own, every connect starts with the latest roll per slot,
 * and a mid-spin joiner animates the remainder from `startedAt`.
 */
export const GET: RequestHandler = async ({ params, cookies, fetch, locals }) => {
  // Captured before any await: a teardown landing while the checks below
  // run (deletion, visibility tightening) advances the epoch, and the
  // subscription is then refused - this request's authorization predates it.
  const epoch = roomEpoch(params.slug);
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

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (message: StageMessage) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(message)}\n\n`));
      };
      // Subscribe BEFORE reading the snapshot: a roll landing between the
      // two would otherwise be in neither (published with no listener yet,
      // committed after the read), and this viewer would miss the whole
      // draw. Messages arriving during the read are buffered and flushed
      // after the snapshot; the client's apply is idempotent per rollId, so
      // a roll that made both is harmless.
      let buffered: StageMessage[] | null = [];
      unsubscribe = subscribe(
        params.slug,
        (message) => {
          if (buffered) buffered.push(message);
          else send(message);
        },
        // Room teardown (event deleted): end the stream. The browser's
        // EventSource reconnects into the connect-time access check, which
        // judges whatever now lives at this slug afresh.
        () => {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
            // Already closed by the client.
          }
        },
        epoch,
      );
      if (unsubscribe === null) {
        // The room was torn down while access was being checked. Close
        // without data; the reconnect re-runs the checks from scratch.
        controller.close();
        return;
      }
      try {
        send({
          type: "snapshot",
          rolls: (await raffleRollStore.latestForEvent(params.slug)).map(toStageRoll),
        });
      } catch (error) {
        // A failed snapshot must not leave a dead subscriber behind - the
        // browser's reconnects would pile them up for the process lifetime.
        unsubscribe?.();
        controller.error(error);
        return;
      }
      const backlog = buffered;
      buffered = null;
      for (const message of backlog) send(message);
      // Comment frames keep proxies from idling the connection out.
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(":hb\n\n")), HEARTBEAT_MS);
      if (typeof heartbeat === "object" && "unref" in heartbeat) heartbeat.unref();
      lifetime = setTimeout(() => {
        unsubscribe?.();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // Already closed by the client.
        }
      }, MAX_STREAM_MS);
      if (typeof lifetime === "object" && "unref" in lifetime) lifetime.unref();
    },
    cancel() {
      unsubscribe?.();
      clearInterval(heartbeat);
      clearTimeout(lifetime);
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
