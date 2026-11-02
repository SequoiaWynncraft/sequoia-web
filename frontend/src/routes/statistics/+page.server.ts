import type { PageServerLoad } from "./$types";

import { getGuildStats } from "#lib/server/guildStats.js";
import { loadGuildLevelTracker } from "#lib/server/guildLevelTracker.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  // The Level Tracker is for full Development/Community members only. Streamed,
  // never awaited: its gate reads the rank API, and the stats this page is
  // actually about should not wait behind it. Ineligible viewers resolve to
  // null, so nothing about the tracker reaches the client.
  const levelTracker = parent()
    .then(({ viewer }) => loadGuildLevelTracker(fetch, viewer))
    .catch(() => null);

  try {
    return { stats: await getGuildStats(fetch, { allowStale: true }), levelTracker };
  } catch {
    return { stats: null, levelTracker };
  }
};
