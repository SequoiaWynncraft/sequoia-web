import type { PageServerLoad } from "./$types";

import { pageAreaAccess } from "$lib/server/manageCapabilities";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  const access = await pageAreaAccess(fetch, viewer, "community");
  return { access };
};
