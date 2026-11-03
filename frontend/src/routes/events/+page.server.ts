import type { PageServerLoad } from "./$types";

import { hubGroups, type HubEvent } from "#lib/events/helpers.js";
import type { EventGoal } from "#lib/events/types.js";
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
    progress: loadProgress(
      fetch,
      groups.live.filter((event) => !event.draft),
      now,
    ),
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
