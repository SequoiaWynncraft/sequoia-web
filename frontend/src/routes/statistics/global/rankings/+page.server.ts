import type { PageServerLoad } from "./$types";

import { isRankingWindow, type RankingWindow } from "$lib/api/globalRankings";
import { getGlobalRaidRankings } from "$lib/server/globalRankings";
import { getGuildStats } from "$lib/server/guildStats";
import { getSeasonRankings } from "$lib/server/seasonRankings";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const stats = await getGuildStats(fetch, { allowStale: true }).catch(() => null);
  const latest = stats?.season_ranks.at(-1)?.season ?? null;
  const requested = parseSeason(url.searchParams.get("season"));
  const season = requested ?? latest;
  const window = parseWindow(url.searchParams.get("window"));

  const [rankings, raidRace] = await Promise.all([
    season === null
      ? Promise.resolve(null)
      : getSeasonRankings(fetch, season, { allowStale: true }).catch(() => null),
    getGlobalRaidRankings(fetch, window).catch(() => null),
  ]);

  return { stats, season, rankings, window, raidRace };
};

function parseSeason(value: string | null): number | null {
  if (!value) return null;
  const season = Number.parseInt(value, 10);
  return Number.isSafeInteger(season) && season >= 0 && season <= 999 ? season : null;
}

function parseWindow(value: string | null): RankingWindow {
  return isRankingWindow(value) ? value : "7d";
}
