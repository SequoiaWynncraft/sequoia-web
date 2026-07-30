import type { PageServerLoad } from "./$types";

import { eventStatus } from "$lib/events/helpers";
import { checkEventManager } from "$lib/server/eventManagers";
import { checkEventMembership } from "$lib/server/eventMembership";
import { eventStore } from "$lib/server/eventStore";
import { raffleRollStore } from "$lib/server/raffleRolls";
import { requestError } from "$lib/server/requestError";

export const prerender = false;

/** The live raffle stage. Access mirrors the event page and its stream. */
export const load: PageServerLoad = async ({ fetch, locals, params, parent }) => {
  const stored = await eventStore.get(params.slug);
  if (!stored) requestError(locals, 404, "No such event");
  const event = stored.event;
  const { viewer } = await parent();
  if (!stored.published && (await checkEventManager(fetch, viewer)) !== "manager") {
    requestError(locals, 404, "No such event");
  }
  if (event.access === "members") {
    const { membership } = await checkEventMembership(fetch, viewer);
    if (membership !== "member") {
      requestError(locals, 403, "This event's raffles are for guild members.");
    }
  }
  return {
    event,
    status: eventStatus(event, new Date()),
    rolls: await raffleRollStore.latestForEvent(params.slug),
  };
};
