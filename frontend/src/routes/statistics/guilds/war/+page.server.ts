import type { PageServerLoad } from "./$types";

import { getGuildStats } from "$lib/server/guildStats";
import { getHeldTerritories } from "$lib/server/territories";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch }) => {
  const [stats, territories] = await Promise.all([
    getGuildStats(fetch, { allowStale: true }).catch(() => null),
    getHeldTerritories(fetch, { allowStale: true }).catch(() => null),
  ]);
  return { stats, territories };
};
