import type { PageServerLoad } from "./$types";

import { hubGroups, type HubEvent } from "$lib/events/helpers";
import { checkEventManager } from "$lib/server/eventManagers";
import { loadEventRaidCounts, sumCounts } from "$lib/server/eventActivity";
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
      .filter((event) => event.goal?.feed === "raids" && event.startsAt)
      .map(async (event) => {
        const days = await loadEventRaidCounts(fetchImpl, {
          from: event.startsAt as string,
          to: now.toISOString(),
          countRaid: event.goal?.countRaid,
        }).catch(() => null);
        progress[event.slug] = days === null ? null : sumCounts(days);
      }),
  );
  return progress;
}
