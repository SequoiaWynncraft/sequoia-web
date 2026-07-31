import type { PageServerLoad } from "./$types";

import { eventStatus } from "$lib/events/helpers";
import { checkEventManager } from "$lib/server/eventManagers";
import { checkEventMembership } from "$lib/server/eventMembership";
import { eventStore, type StoredEvent } from "$lib/server/eventStore";
import { raffleRollStore, toStageRoll } from "$lib/server/raffleRolls";
import { requestError } from "$lib/server/requestError";

export const prerender = false;

const MAX_ACCESS_RETRIES = 3;

/** The live raffle stage. Access mirrors the event page and its stream. */
export const load: PageServerLoad = async ({ fetch, locals, params, parent }) => {
  // The access checks await network; a manager can tighten visibility and
  // roll again in that window, and the snapshot read below must never serve
  // entrant names under the older, looser decision. Authorization is
  // therefore bound to the event version: if the event changed while
  // checking or reading, re-judge against the fresh version.
  let stored: StoredEvent | null = null;
  let rolls: ReturnType<typeof toStageRoll>[] = [];
  for (let attempt = 0; attempt < MAX_ACCESS_RETRIES; attempt++) {
    stored = await eventStore.get(params.slug);
    if (!stored) requestError(locals, 404, "No such event");
    const { viewer } = await parent();
    if (!stored.published && (await checkEventManager(fetch, viewer)) !== "manager") {
      requestError(locals, 404, "No such event");
    }
    if (stored.event.access === "members") {
      const { membership } = await checkEventMembership(fetch, viewer);
      if (membership !== "member") {
        requestError(locals, 403, "This event's raffles are for guild members.");
      }
    }
    // Projected: the persisted rows carry manager identifiers the wire must not.
    rolls = (await raffleRollStore.latestForEvent(params.slug)).map(toStageRoll);
    const check = await eventStore.get(params.slug);
    if (check && check.updatedAt === stored.updatedAt) break;
    // Version moved mid-check; loop re-authorizes against the new state.
    stored = null;
  }
  if (!stored) {
    // The event kept changing under us - tell the viewer to try again
    // rather than serve data authorized against an unknown version.
    requestError(locals, 503, "The event is being updated - reload in a moment.");
  }
  return {
    event: stored.event,
    status: eventStatus(stored.event, new Date()),
    rolls,
  };
};
