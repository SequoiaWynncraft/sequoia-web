import type { PageServerLoad } from "./$types";

import { homepageEvents, type HubEvent } from "#lib/events/helpers.js";
import type { Viewer } from "#lib/site/viewer.js";
import { eventStore } from "#lib/server/eventStore.js";
import { canSeeEvent, resolveEventAudience } from "#lib/server/eventVisibility.js";
import { getGuildOverview } from "#lib/server/guildOverview.js";
import { loadLatestPosts } from "#lib/server/postPages.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  const latest = Promise.all([
    loadLatestPosts(fetch, viewer).catch(() => []),
    loadHomepageEvents(fetch, viewer).catch(() => []),
  ]).then(([posts, events]) => ({ posts, events }));
  try {
    const overview = await getGuildOverview(fetch, {
      allowStale: true,
      includeBranchmasters: false,
    });
    return { homepageStats: overview.stats, latest };
  } catch {
    return { homepageStats: null, latest };
  }
};

async function loadHomepageEvents(fetchImpl: typeof fetch, viewer: Viewer | null): Promise<HubEvent[]> {
  const now = new Date();
  const { audience } = await resolveEventAudience(fetchImpl, viewer);
  if (audience === "anonymous") return [];
  const visible = (await eventStore.list()).filter((entry) =>
    canSeeEvent(entry.event, entry.published, audience, now),
  );
  return homepageEvents(visible, now);
}
