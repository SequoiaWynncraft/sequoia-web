import type { PageServerLoad } from "./$types";

import { homepageEvents } from "#lib/events/helpers.js";
import type { HomepageEvent } from "#lib/events/viewerEvent.js";
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
  // Streamed: the roster needs the rank profiles too, so it never holds up the first paint.
  const branchmasters = getGuildOverview(fetch, { allowStale: true })
    .then((overview) => ({ members: overview.branchmasters, stale: overview.stale }))
    .catch(() => ({ members: [], stale: true }));
  try {
    const overview = await getGuildOverview(fetch, {
      allowStale: true,
      includeBranchmasters: false,
    });
    return { homepageStats: overview.stats, statsStale: overview.stale, latest, branchmasters };
  } catch {
    return { homepageStats: null, statsStale: true, latest, branchmasters };
  }
};

async function loadHomepageEvents(fetchImpl: typeof fetch, viewer: Viewer | null): Promise<HomepageEvent[]> {
  const now = new Date();
  const { audience } = await resolveEventAudience(fetchImpl, viewer);
  if (audience === "anonymous") return [];
  const visible = (await eventStore.list()).filter((entry) =>
    canSeeEvent(entry.event, entry.published, audience, now),
  );
  return homepageEvents(visible, now);
}
