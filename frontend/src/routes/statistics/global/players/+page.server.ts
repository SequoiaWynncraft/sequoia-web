import type { PageServerLoad } from "./$types";

import { isPlayerMetric, isPlayerWindow, type PlayerMetric, type PlayerWindow } from "#lib/api/globalPlayers.js";
import { searchPlayers } from "#lib/server/globalPlayer.js";
import { getGlobalPlayerRankings } from "#lib/server/globalPlayerRankings.js";

export const prerender = false;

const MAX_QUERY = 64;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  const metricParam = url.searchParams.get("metric");
  const windowParam = url.searchParams.get("window");
  const metric: PlayerMetric = isPlayerMetric(metricParam) ? metricParam : "playtime";
  const window: PlayerWindow = isPlayerWindow(windowParam) ? windowParam : "7d";

  const [hits, rankings] = await Promise.all([
    query.length >= 3 ? searchPlayers(fetch, query).catch(() => null) : Promise.resolve(null),
    getGlobalPlayerRankings(fetch, metric, window).catch(() => null),
  ]);
  return { query, hits, metric, window, rankings };
};
