import type { PageServerLoad } from "./$types";

import { eventStatus, hubGroups, type HubEntry } from "#lib/events/helpers.js";
import { hubGoal } from "#lib/events/viewerEvent.js";
import { canSeeEvent, resolveEventAudience } from "#lib/server/eventVisibility.js";
import { loadGoalProgress } from "#lib/server/goalProgress.js";
import { eventStore } from "#lib/server/eventStore.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const now = new Date();
  const { viewer } = await parent();

  const { audience } = await resolveEventAudience(fetch, viewer);

  const stored = audience === "anonymous" ? [] : await eventStore.list();
  const visible = stored.filter((entry) =>
    canSeeEvent(entry.event, entry.published, audience, now),
  );
  const groups = hubGroups(visible, now);

  return {
    groups,
    manager: audience === "manager",
    progress: loadProgress(fetch, visible, now),
  };
};

/** Band progress for live, listed events, read from the stored goal's feed settings. */
async function loadProgress(
  fetchImpl: typeof fetch,
  entries: HubEntry[],
  now: Date,
): Promise<Record<string, number | null>> {
  const progress: Record<string, number | null> = {};
  await Promise.all(
    entries.flatMap(({ event, published }) => {
      const goal = hubGoal(event);
      if (!published || eventStatus(event, now) !== "live" || !goal?.feed || !event.startsAt) return [];
      const window = { from: event.startsAt, to: now.toISOString() };
      return [
        loadGoalProgress(fetchImpl, goal, window).then((value) => {
          progress[event.slug] = value;
        }),
      ];
    }),
  );
  return progress;
}
