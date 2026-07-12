import { error } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { getGuildStatsByName, loadGuildRaidActivity } from "$lib/server/globalGuild";

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

  // Streamed: the activity feed must never hold the page back.
  const activity = loadGuildRaidActivity(fetch, stats.guild.name, ACTIVITY_WINDOW_DAYS).catch(
    () => null,
  );

  return { stats, activity };
};
