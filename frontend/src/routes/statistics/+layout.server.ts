import type { LayoutServerLoad } from "./$types";

import { getGuildStats } from "$lib/server/guildStats";

export const prerender = false;

export const load: LayoutServerLoad = async ({ fetch }) => {
  try {
    const stats = await getGuildStats(fetch, { allowStale: true });
    return {
      shell: {
        online_now: stats.guild.online_now,
        members_total: stats.guild.members_total,
      },
    };
  } catch {
    return { shell: null };
  }
};
