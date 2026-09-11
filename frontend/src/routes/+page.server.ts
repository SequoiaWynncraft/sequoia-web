import type { PageServerLoad } from "./$types";

import { getGuildOverview } from "$lib/server/guildOverview";
import { loadLatestPosts } from "$lib/server/postPages";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  // Streamed: the strip fills in after first paint, so a slow roster or rank
  // read never holds the hero back. A failure just leaves the strip out.
  const latestPosts = loadLatestPosts(fetch, viewer).catch(() => []);
  try {
    const overview = await getGuildOverview(fetch, {
      allowStale: true,
      includeBranchmasters: false,
    });
    return { homepageStats: overview.stats, latestPosts };
  } catch {
    return { homepageStats: null, latestPosts };
  }
};
