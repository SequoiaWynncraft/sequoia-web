import type { PageServerLoad } from "./$types";

import { getGuildStats } from "#lib/server/guildStats.js";
import { getMemberProgress } from "#lib/server/memberProgress.js";
import {
  getLinkedRankProfiles,
  memberRanksByUuid,
  type MemberRankEntry,
} from "#lib/server/rankProfiles.js";
import { loadWeeklyRaidAnnouncement } from "#lib/server/weeklyRaidAnnouncement.js";

import { resolveRange, resolveScope } from "./range";

export const prerender = false;

const RANKS_GRACE_MS = 1500;

const EMPTY_RANKS: Record<string, MemberRankEntry> = {};

export const load: PageServerLoad = async ({ fetch, url, parent }) => {
  const requested = url.searchParams.get("range") ?? "now";
  const range = resolveScope(requested);

  const raidAnnouncement = parent()
    .then(({ viewer }) => loadWeeklyRaidAnnouncement(fetch, viewer))
    .catch(() => null);

  if (range === "now") {
    return { view: "now" as const, range, raidAnnouncement, ...(await loadRoster(fetch)) };
  }

  const { from, to } = resolveRange(range);
  return {
    view: "gains" as const,
    range,
    from,
    to,
    raidAnnouncement,
    progress: await getMemberProgress(fetch, from, to).catch((error) => {
      console.warn(`member progress load failed (${from}..${to}):`, error);
      return null;
    }),
  };
};

async function loadRoster(fetch: typeof globalThis.fetch) {
  const ranksPromise = getLinkedRankProfiles(fetch)
    .then(memberRanksByUuid)
    .catch(() => EMPTY_RANKS);
  try {
    const stats = await getGuildStats(fetch, { allowStale: true });
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
}
