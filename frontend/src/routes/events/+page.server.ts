import type { PageServerLoad } from "./$types";

import { hubGroups, type HubEvent } from "$lib/events/helpers";
import type { EventGoal } from "$lib/events/types";
import { canSeeEvent, eventAudience } from "$lib/server/eventVisibility";
import { getGuildStats } from "$lib/server/guildStats";
import { loadGoalProgress } from "$lib/server/goalProgress";
import { eventStore } from "$lib/server/eventStore";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const now = new Date();
  const { viewer } = await parent();

  // Membership decides which events may even be listed, so it is authorized
  // against a fresh roster and fails closed - a stale one outlives the
  // departure that should have closed access. Anonymous viewers are turned away
  // before the roster costs anything, since they see no events either way.
  const stats = viewer
    ? await getGuildStats(fetch, { allowStale: false }).catch(() => null)
    : null;
  const audience = eventAudience(viewer, stats !== null && !stats.stale ? stats.members : null);

  const stored = audience === "anonymous" ? [] : await eventStore.list();
  const visible = stored
    .filter((entry) => canSeeEvent(entry.event, entry.published, audience, now))
    .map((entry) => entry.event);
  const groups = hubGroups(visible, now);

  return {
    groups,
    manager: audience === "manager",
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
