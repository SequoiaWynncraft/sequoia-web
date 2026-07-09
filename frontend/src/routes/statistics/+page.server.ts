import type { PageServerLoad } from "./$types";

import { getGuildStats } from "$lib/server/guildStats";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch }) => {
  try {
    return { stats: await getGuildStats(fetch, { allowStale: true }) };
  } catch {
    return { stats: null };
  }
};
