import type { PageServerLoad } from "./$types";

import { getGuildOverview } from "$lib/server/guildOverview";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch }) => {
  try {
    const overview = await getGuildOverview(fetch, {
      allowStale: true,
      includeBranchmasters: false,
    });
    return { homepageStats: overview.stats };
  } catch {
    return { homepageStats: null };
  }
};
