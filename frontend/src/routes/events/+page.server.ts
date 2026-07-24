import type { PageServerLoad } from "./$types";

import { hubGroups, type HubEvent } from "$lib/events/helpers";
import type { EventGoal } from "$lib/events/types";
import { checkEventManager } from "$lib/server/eventManagers";
import { loadGoalProgress } from "$lib/server/goalProgress";
import { eventStore } from "$lib/server/eventStore";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const now = new Date();
  const groups = hubGroups(await eventStore.listPublished(), now);
  const { viewer } = await parent();

  return {
    groups,
    manager: viewer !== null && (await checkEventManager(fetch, viewer)) === "manager",
    // Optional live progress streams after the hub instead of delaying its
    // first response when the activity feed is slow or unavailable.
    progress: loadProgress(fetch, groups.live, now),
  };
};

async function loadProgress(
  fetchImpl: typeof fetch,
  liveEvents: HubEvent[],
  now: Date,
): Promise<Record<string, number | null>> {
  const progress: Record<string, number | null> = {};
  await Promise.all(
    liveEvents
      .filter((event) => event.goal?.feed !== undefined && event.startsAt)
      .map(async (event) => {
        progress[event.slug] = await loadGoalProgress(fetchImpl, event.goal as EventGoal, {
          from: event.startsAt as string,
          to: now.toISOString(),
        });
      }),
  );
  return progress;
}
