import type { RequestHandler } from "./$types";

import type { StageMessage } from "$lib/events/stageProtocol";
import { canSeeEvent, resolveEventAudience } from "$lib/server/eventVisibility";
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
 * The stage's live feed. Access mirrors the event page through the same
 * `canSeeEvent` rule: whoever may not know the event exists - anonymous
 * viewers, non-members of a member event, anyone but a manager for a draft or
 * an unannounced event - is refused here too, so entrant names never leave by
 * a route the page itself would have closed. Reconnect catch-up is the
 * snapshot: EventSource reconnects on its own, every connect starts with the
 * latest roll per slot, and a mid-spin joiner animates the remainder from
 * `startedAt`.
 */
export const GET: RequestHandler = async ({ params, cookies, fetch, locals }) => {
  // Captured before any await: a teardown landing while the checks below
  // run (deletion, visibility tightening) advances the epoch, and the
  // subscription is then refused - this request's authorization predates it.
  const epoch = roomEpoch(params.slug);
  const stored = await eventStore.get(params.slug);
  if (!stored) requestError(locals, 404, "No such event");
  const viewer = await loadViewer(cookies.get("seq_session"), fetch);
  const { audience } = await resolveEventAudience(fetch, viewer);
  if (!canSeeEvent(stored.event, stored.published, audience, new Date())) {
    requestError(locals, 404, "No such event");
  }
  // The stage page's hidden-wheel rule, enforced on the feed itself: rolls
  // and entrant lists must not leave by a route the page would have closed.
  if (stored.event.raffleHideWheel === true && audience !== "manager") {
    requestError(locals, 404, "No such event");
  }

  const encoder = new TextEncoder();
  let unsubscribe: (() => void) | null | undefined;
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  let lifetime: ReturnType<typeof setTimeout> | undefined;

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (message: StageMessage) => {
        // Stamp at the actual enqueue, not just publication: a roll buffered
        // behind the initial snapshot must not make queue time look like
        // client clock skew.
        const outgoing =
          message.type === "snapshot" || message.type === "roll"
            ? { ...message, now: Date.now() }
            : message;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(outgoing)}\n\n`));
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
        const rolls = (await raffleRollStore.latestForEvent(params.slug))
          // A pending row's winner has not committed yet - not stage material.
          .filter((roll) => !roll.pending)
          .map(toStageRoll);
        send({
          type: "snapshot",
          now: Date.now(),
          rolls,
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
