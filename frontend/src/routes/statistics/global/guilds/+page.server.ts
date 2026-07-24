import type { PageServerLoad } from "./$types";

import { isDirectorySort, type DirectorySort } from "$lib/api/globalDirectory";
import { getGlobalGuildDirectory } from "$lib/server/globalDirectory";
import { searchGuilds } from "$lib/server/globalGuild";

export const prerender = false;

const MAX_QUERY = 64;
const MAX_PAGE = 500;

export const load: PageServerLoad = async ({ fetch, url }) => {
  const query = (url.searchParams.get("q") ?? "").trim().slice(0, MAX_QUERY);
  const sortParam = url.searchParams.get("sort");
  const sort: DirectorySort = isDirectorySort(sortParam) ? sortParam : "members";
  const pageParam = Number.parseInt(url.searchParams.get("page") ?? "0", 10);
  const page = Number.isFinite(pageParam) ? Math.min(Math.max(pageParam, 0), MAX_PAGE) : 0;

  const [hits, directory] = await Promise.all([
    query.length >= 3 ? searchGuilds(fetch, query).catch(() => null) : Promise.resolve(null),
    getGlobalGuildDirectory(fetch, { query, sort, page }).catch(() => null),
  ]);
  return { query, hits, sort, page, directory };
};
