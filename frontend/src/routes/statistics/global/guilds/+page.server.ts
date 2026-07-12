import type { PageServerLoad } from "./$types";

import { searchGuilds, type GuildSearchHit } from "$lib/server/globalGuild";

export const prerender = false;

const MAX_QUERY = 64;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  let hits: GuildSearchHit[] | null = null;
  if (query.length >= 3) {
    hits = await searchGuilds(fetch, query).catch(() => null);
  }
  return { query, hits };
};
