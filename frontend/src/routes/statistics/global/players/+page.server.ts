import type { PageServerLoad } from "./$types";

import { searchPlayers, type PlayerSearchHit } from "$lib/server/globalPlayer";

export const prerender = false;

const MAX_QUERY = 64;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  let hits: PlayerSearchHit[] | null = null;
  if (query.length >= 3) {
    hits = await searchPlayers(fetch, query).catch(() => null);
  }
  return { query, hits };
};
