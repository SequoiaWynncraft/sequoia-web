import type { LayoutServerLoad } from "./$types";

import { getGuildStats } from "#lib/server/guildStats.js";

export const prerender = false;

export interface ShellStats {
  online_now: number;
  members_total: number;
}

const SHELL_GRACE_MS = 800;

export const load: LayoutServerLoad = async ({ fetch }) => {
  return {
    shell: await loadShellStats(fetch),
  };
};

async function loadShellStats(fetchImpl: typeof fetch): Promise<ShellStats | null> {
  try {
    const stats = await Promise.race([
      getGuildStats(fetchImpl, { allowStale: true }),
      new Promise<null>((resolve) => {
        setTimeout(resolve, SHELL_GRACE_MS);
      }),
    ]);
    if (!stats) return null;
    return {
      online_now: stats.guild.online_now,
      members_total: stats.guild.members_total,
    };
  } catch {
    return null;
  }
}
