import type { PageServerLoad } from "./$types";

import { hubGroups } from "$lib/events/registry";
import { loadEventRaidCounts, sumCounts } from "$lib/server/eventActivity";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch }) => {
  const now = new Date();
  const groups = hubGroups(now);

  // Live goal meters on the hub read the same activity feed as the event
  // pages; a dead feed degrades to "-", never blocks the hub.
  const progress: Record<string, number | null> = {};
  await Promise.all(
    groups.live
      .filter((event) => event.goal?.feed === "raids" && event.startsAt)
      .map(async (event) => {
        const days = await loadEventRaidCounts(fetch, {
          from: event.startsAt as string,
          to: now.toISOString(),
          countRaid: event.goal?.countRaid,
        }).catch(() => null);
        progress[event.slug] = days === null ? null : sumCounts(days);
      }),
  );

  return { groups, progress };
};
