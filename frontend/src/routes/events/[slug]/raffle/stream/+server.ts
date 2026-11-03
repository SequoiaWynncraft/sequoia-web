import type { RequestHandler } from "./$types";

import type { StageMessage } from "#lib/events/stageProtocol.js";
import { canSeeEvent, resolveEventAudience } from "#lib/server/eventVisibility.js";
import { eventStore } from "#lib/server/eventStore.js";
import { roomEpoch, subscribe } from "#lib/server/liveRolls.js";
import { raffleRollStore, toStageRoll } from "#lib/server/raffleRolls.js";
import { requestError } from "#lib/server/requestError.js";
import { loadViewer } from "#lib/server/viewerSession.js";

export const prerender = false;

const HEARTBEAT_MS = 25_000;
const MAX_STREAM_MS = 10 * 60_000;

export const GET: RequestHandler = async ({ params, cookies, fetch, locals }) => {
  const epoch = roomEpoch(params.slug);
  const stored = await eventStore.get(params.slug);
  if (!stored) requestError(locals, 404, "No such event");
  const viewer = await loadViewer(cookies.get("seq_session"), fetch);
  const { audience } = await resolveEventAudience(fetch, viewer);
  if (!canSeeEvent(stored.event, stored.published, audience, new Date())) {
    requestError(locals, 404, "No such event");
  }
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
        const outgoing =
          message.type === "snapshot" || message.type === "roll"
            ? { ...message, now: Date.now() }
            : message;
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(outgoing)}\n\n`));
      };
      let buffered: StageMessage[] | null = [];
      unsubscribe = subscribe(
        params.slug,
        (message) => {
          if (buffered) buffered.push(message);
          else send(message);
        },
        () => {
          clearInterval(heartbeat);
          try {
            controller.close();
          } catch {
          }
        },
        epoch,
      );
      if (unsubscribe === null) {
        controller.close();
        return;
      }
      try {
        const rolls = (await raffleRollStore.latestForEvent(params.slug))
          .filter((roll) => !roll.pending)
          .map(toStageRoll);
        send({
          type: "snapshot",
          now: Date.now(),
          rolls,
        });
      } catch (error) {
        unsubscribe?.();
        controller.error(error);
        return;
      }
      const backlog = buffered;
      buffered = null;
      for (const message of backlog) send(message);
      heartbeat = setInterval(() => controller.enqueue(encoder.encode(":hb\n\n")), HEARTBEAT_MS);
      if (typeof heartbeat === "object" && "unref" in heartbeat) heartbeat.unref();
      lifetime = setTimeout(() => {
        unsubscribe?.();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
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
      "x-accel-buffering": "no",
    },
  });
};
