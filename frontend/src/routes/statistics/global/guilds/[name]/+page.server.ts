import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { getGuildStatsByName, loadGuildRaidActivity } from "$lib/server/globalGuild";
import { getGuildStats } from "$lib/server/guildStats";

export const prerender = false;

const ACTIVITY_WINDOW_DAYS = 14;

export const load: PageServerLoad = async ({ fetch, params }) => {
  let stats;
  try {
    stats = await getGuildStatsByName(fetch, params.name);
  } catch {
    error(503, "Guild statistics are temporarily unavailable.");
  }
  if (stats === null) error(404, "No such guild.");

  // The globally live season comes from Sequoia's own (cached) stats - the
  // viewed guild's last recorded season may just be its last active one.
  const liveSeason = await getGuildStats(fetch, { allowStale: true })
    .then((own) => own.season_ranks.at(-1)?.season ?? null)
    .catch(() => null);

  // Streamed: the activity feed must never hold the page back.
  const activity = loadGuildRaidActivity(fetch, stats.guild.name, ACTIVITY_WINDOW_DAYS).catch(
    () => null,
  );

  return { stats, liveSeason, activity };
};
