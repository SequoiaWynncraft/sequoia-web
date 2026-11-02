import type { PageServerLoad } from "./$types";

import { eventStatus } from "#lib/events/helpers.js";
import { canSeeEvent, resolveEventAudience } from "#lib/server/eventVisibility.js";
import { eventStore, type StoredEvent } from "#lib/server/eventStore.js";
import { raffleRollStore, toStageRoll } from "#lib/server/raffleRolls.js";
import { requestError } from "#lib/server/requestError.js";

export const prerender = false;

const MAX_ACCESS_RETRIES = 3;

/**
 * The live raffle stage. Access mirrors the event page exactly, through the
 * same `canSeeEvent` rule: a viewer who may not know the event exists must not
 * reach its rolls by way of the stage either, so every rejection here is the
 * event page's 404 rather than a message that would confirm the slug.
 */
export const load: PageServerLoad = async ({ fetch, locals, params, parent }) => {
  // The audience depends on the viewer, not on the event, so it is resolved
  // once; only the event side of the decision is re-judged below.
  const { viewer } = await parent();
  const { audience } = await resolveEventAudience(fetch, viewer);

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
    if (!canSeeEvent(stored.event, stored.published, audience, new Date())) {
      requestError(locals, 404, "No such event");
    }
    // A hidden wheel keeps its stage to managers - winners still land on the
    // event page without the spin. Same 404 as above: the stage's existence
    // is not the viewer's business either.
    if (stored.event.raffleHideWheel === true && audience !== "manager") {
      requestError(locals, 404, "No such event");
    }
    // Projected: the persisted rows carry manager identifiers the wire must not.
    rolls = (await raffleRollStore.latestForEvent(params.slug))
      // A pending row's winner has not committed yet - not stage material.
      .filter((roll) => !roll.pending)
      .map(toStageRoll);
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
