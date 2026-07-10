import type { PageServerLoad } from "./$types";

import { getGuildStats } from "$lib/server/guildStats";
import {
  getLinkedRankProfiles,
  memberRanksByUuid,
  type MemberRankEntry,
} from "$lib/server/rankProfiles";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch }) => {
  const ranksPromise = getLinkedRankProfiles(fetch)
    .then(memberRanksByUuid)
    .catch((): Record<string, MemberRankEntry> => ({}));
  try {
    const stats = await getGuildStats(fetch, { allowStale: true });
    return { stats, ranks: await ranksPromise };
  } catch {
    return { stats: null, ranks: await ranksPromise };
  }
};
