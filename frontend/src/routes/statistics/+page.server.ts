import type { PageServerLoad } from "./$types";

import { getGuildStats } from "#lib/server/guildStats.js";
import { loadGuildLevelTracker } from "#lib/server/guildLevelTracker.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const levelTracker = parent()
    .then(({ viewer }) => loadGuildLevelTracker(fetch, viewer))
    .catch(() => null);

  try {
    return { stats: await getGuildStats(fetch, { allowStale: true }), levelTracker };
  } catch {
    return { stats: null, levelTracker };
  }
};
