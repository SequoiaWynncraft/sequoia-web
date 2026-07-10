import type { PageServerLoad } from "./$types";

import { getGuildStats } from "$lib/server/guildStats";
import {
  getLinkedRankProfiles,
  memberRanksByUuid,
  type MemberRankEntry,
} from "$lib/server/rankProfiles";

export const prerender = false;

/** How long the optional rank lookup may keep ready stats waiting. */
const RANKS_GRACE_MS = 1500;

const EMPTY_RANKS: Record<string, MemberRankEntry> = {};

export const load: PageServerLoad = async ({ fetch }) => {
  const ranksPromise = getLinkedRankProfiles(fetch)
    .then(memberRanksByUuid)
    .catch(() => EMPTY_RANKS);
  try {
    const stats = await getGuildStats(fetch, { allowStale: true });
    // Ranks are enrichment — a cold cache or slow rank API forfeits them
    // after a short grace instead of holding back the ledger.
    const ranks = await Promise.race([
      ranksPromise,
      new Promise<Record<string, MemberRankEntry>>((resolve) => {
        setTimeout(resolve, RANKS_GRACE_MS, EMPTY_RANKS);
      }),
    ]);
    return { stats, ranks };
  } catch {
    return { stats: null, ranks: EMPTY_RANKS };
  }
};
