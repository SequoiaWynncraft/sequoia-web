import type { PageServerLoad } from "./$types";

import { getGuildStatsByName, loadGuildRaidActivity } from "#lib/server/globalGuild.js";
import { getGuildStats } from "#lib/server/guildStats.js";
import { requestError } from "#lib/server/requestError.js";
import {
  getLinkedRankProfiles,
  inGameRankLadder,
  memberRanksByUuid,
  type InGameRankLadder,
  type MemberRankEntry,
} from "#lib/server/rankProfiles.js";

export const prerender = false;

const ACTIVITY_WINDOW_DAYS = 14;

const RANKS_GRACE_MS = 1500;

const SEASON_GRACE_MS = 800;

function withDeadline<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<T>((resolve) => {
    timer = setTimeout(resolve, ms, fallback);
  });
  return Promise.race([promise, deadline]).finally(() => {
    clearTimeout(timer);
  });
}

interface OrgRanks {
  ranks: Record<string, MemberRankEntry> | null;
  rankLadder: InGameRankLadder | null;
}

const NO_ORG_RANKS: OrgRanks = { ranks: null, rankLadder: null };

export const load: PageServerLoad = async ({ fetch, locals, params }) => {
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

  const [liveSeason, { ranks, rankLadder }] = await Promise.all([
    withDeadline(
      getGuildStats(fetch, { allowStale: true })
        .then((own) => own.season_ranks.at(-1)?.season ?? null)
        .catch(() => null),
      SEASON_GRACE_MS,
      null,
    ),
    withDeadline(orgRanksPromise, RANKS_GRACE_MS, NO_ORG_RANKS),
  ]);

  const activity = loadGuildRaidActivity(fetch, stats.guild.name, ACTIVITY_WINDOW_DAYS).catch(
    () => null,
  );

  return { stats, liveSeason, activity, ranks, rankLadder };
};
