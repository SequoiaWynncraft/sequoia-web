import type { PageServerLoad } from "./$types";

import { getGuildStatsByName, loadGuildRaidActivity } from "$lib/server/globalGuild";
import { getGuildStats } from "$lib/server/guildStats";
import { requestError } from "$lib/server/requestError";
import {
  getLinkedRankProfiles,
  inGameRankLadder,
  memberRanksByUuid,
  type InGameRankLadder,
  type MemberRankEntry,
} from "$lib/server/rankProfiles";

export const prerender = false;

const ACTIVITY_WINDOW_DAYS = 14;

/** How long the optional org rank lookup may keep a ready roster waiting. */
const RANKS_GRACE_MS = 1500;

/** Org ranks, as the roster consumes them; both null when they are unavailable. */
interface OrgRanks {
  ranks: Record<string, MemberRankEntry> | null;
  rankLadder: InGameRankLadder | null;
}

const NO_ORG_RANKS: OrgRanks = { ranks: null, rankLadder: null };

export const load: PageServerLoad = async ({ fetch, locals, params }) => {
  // Org ranks only mean something for our own guild. Kicked off before the stats
  // fetch so the two overlap.
  const wantsOrgRanks = params.name.toLowerCase() === "sequoia";
  const orgRanksPromise = wantsOrgRanks
    ? getLinkedRankProfiles(fetch)
        .then((response) => ({
          ranks: memberRanksByUuid(response),
          rankLadder: inGameRankLadder(response),
        }))
        .catch(() => NO_ORG_RANKS)
    : Promise.resolve(NO_ORG_RANKS);

  let stats;
  try {
    stats = await getGuildStatsByName(fetch, params.name);
  } catch {
    requestError(locals, 503, "Guild statistics are temporarily unavailable.");
  }
  if (stats === null) requestError(locals, 404, "No such guild.");

  // The globally live season comes from Sequoia's own (cached) stats - the
  // viewed guild's last recorded season may just be its last active one.
  // Bounded like the layout shell: this is cosmetic and must not hold the
  // page while a cold cache refreshes.
  const liveSeason = await Promise.race([
    getGuildStats(fetch, { allowStale: true })
      .then((own) => own.season_ranks.at(-1)?.season ?? null)
      .catch(() => null),
    new Promise<null>((resolve) => {
      setTimeout(resolve, 800);
    }),
  ]);

  // Ranks are enrichment - a cold cache or slow rank API forfeits them after a
  // short grace instead of holding back the roster, which then falls back to
  // the in-game ranks on its own.
  const { ranks, rankLadder } = await Promise.race([
    orgRanksPromise,
    new Promise<OrgRanks>((resolve) => {
      setTimeout(resolve, RANKS_GRACE_MS, NO_ORG_RANKS);
    }),
  ]);

  // Streamed: the activity feed must never hold the page back.
  const activity = loadGuildRaidActivity(fetch, stats.guild.name, ACTIVITY_WINDOW_DAYS).catch(
    () => null,
  );

  return { stats, liveSeason, activity, ranks, rankLadder };
};
