import type { PageServerLoad } from "./$types";

import { getGuildStats } from "$lib/server/guildStats";
import { getSeasonRankings } from "$lib/server/seasonRankings";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const stats = await getGuildStats(fetch, { allowStale: true }).catch(() => null);
  const latest = stats?.season_ranks.at(-1)?.season ?? null;
  const requested = parseSeason(url.searchParams.get("season"));
  const season = requested ?? latest;

  const rankings =
    season === null
      ? null
      : await getSeasonRankings(fetch, season, { allowStale: true }).catch(() => null);

  return { stats, season, rankings };
};

function parseSeason(value: string | null): number | null {
  if (!value) return null;
  const season = Number.parseInt(value, 10);
  return Number.isSafeInteger(season) && season >= 0 && season <= 999 ? season : null;
}
