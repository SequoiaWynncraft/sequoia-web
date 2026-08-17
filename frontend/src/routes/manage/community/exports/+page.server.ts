import type { PageServerLoad } from "./$types";

import { EXPORT_DATASETS } from "$lib/server/communityExports";
import { pageAreaAccess } from "$lib/server/manageCapabilities";
import { KNOWN_RAIDS } from "$lib/site/raids";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  // Re-resolved per page load: the console layout's capabilities are cached
  // across child navigations, so they must not gate protected data here.
  const access = await pageAreaAccess(fetch, viewer, "community");
  if (access !== "granted") {
    return { access, datasets: null, raids: null, defaultFrom: null, defaultTo: null };
  }

  const today = new Date();
  const monthAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
  return {
    access,
    datasets: EXPORT_DATASETS,
    raids: KNOWN_RAIDS.map((raid) => ({ key: raid.key, short: raid.short })),
    defaultFrom: monthAgo.toISOString().slice(0, 10),
    defaultTo: today.toISOString().slice(0, 10),
  };
};
