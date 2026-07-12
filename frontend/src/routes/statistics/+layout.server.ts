import type { LayoutServerLoad } from "./$types";

import { getGuildStats } from "$lib/server/guildStats";

export const prerender = false;

export interface ShellStats {
  online_now: number;
  members_total: number;
}

export const load: LayoutServerLoad = async ({ fetch }) => {
  return {
    // Awaited: a streamed layout promise commits the response as 200 before a
    // child route can 404, and the stale-tolerant cache answers this without
    // blocking in practice.
    shell: await loadShellStats(fetch),
  };
};

async function loadShellStats(fetchImpl: typeof fetch): Promise<ShellStats | null> {
  try {
    const stats = await getGuildStats(fetchImpl, { allowStale: true });
    return {
      online_now: stats.guild.online_now,
      members_total: stats.guild.members_total,
    };
  } catch {
    return null;
  }
}
