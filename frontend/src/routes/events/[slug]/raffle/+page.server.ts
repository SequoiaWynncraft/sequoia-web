import type { PageServerLoad } from "./$types";

import { eventStatus } from "#lib/events/helpers.js";
import { canSeeEvent, resolveEventAudience } from "#lib/server/eventVisibility.js";
import { eventStore, type StoredEvent } from "#lib/server/eventStore.js";
import { raffleRollStore, toStageRoll } from "#lib/server/raffleRolls.js";
import { requestError } from "#lib/server/requestError.js";

export const prerender = false;

const MAX_ACCESS_RETRIES = 3;

export const load: PageServerLoad = async ({ fetch, locals, params, parent }) => {
  const { viewer } = await parent();
  const { audience } = await resolveEventAudience(fetch, viewer);

  let stored: StoredEvent | null = null;
  let rolls: ReturnType<typeof toStageRoll>[] = [];
  for (let attempt = 0; attempt < MAX_ACCESS_RETRIES; attempt++) {
    stored = await eventStore.get(params.slug);
    if (!stored) requestError(locals, 404, "No such event");
    if (!canSeeEvent(stored.event, stored.published, audience, new Date())) {
      requestError(locals, 404, "No such event");
    }
    if (stored.event.raffleHideWheel === true && audience !== "manager") {
      requestError(locals, 404, "No such event");
    }
    rolls = (await raffleRollStore.latestForEvent(params.slug))
      .filter((roll) => !roll.pending)
      .map(toStageRoll);
    const check = await eventStore.get(params.slug);
    if (check && check.updatedAt === stored.updatedAt) break;
    stored = null;
  }
  if (!stored) {
    requestError(locals, 503, "The event is being updated - reload in a moment.");
  }
  return {
    event: stored.event,
    status: eventStatus(stored.event, new Date()),
    rolls,
  };
};
