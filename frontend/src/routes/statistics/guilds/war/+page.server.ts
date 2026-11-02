import type { PageServerLoad } from "./$types";

import { getGuildStats } from "#lib/server/guildStats.js";
import { getHeldTerritories } from "#lib/server/territories.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch }) => {
  return {
    stats: await getGuildStats(fetch, { allowStale: true }).catch(() => null),
    // Streamed: the optional territory ledger must never hold the page back.
    territories: getHeldTerritories(fetch, { allowStale: true }).catch(() => null),
  };
};
