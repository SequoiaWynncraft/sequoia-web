import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { MANAGE_AREAS } from "$lib/manage/registry";
import type { ManageCapabilities } from "$lib/manage/types";
import { pageAreaAccess } from "$lib/server/manageCapabilities";

export const prerender = false;

/** The console has no landing content: go straight to the first area. */
export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  const capabilities = {} as ManageCapabilities;

  const checks = await Promise.all(
    MANAGE_AREAS.map(async (area) => [area, await pageAreaAccess(fetch, viewer, area.id)] as const),
  );

  for (const [area, access] of checks) {
    capabilities[area.id] = access;
    if (access === "granted") redirect(307, area.href);
  }

  return { capabilities };
};
