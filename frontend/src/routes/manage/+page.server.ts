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

  const checks = MANAGE_AREAS.map(
    async (area) => [area, await pageAreaAccess(fetch, viewer, area.id)] as const,
  );

  let grantedArea: (typeof MANAGE_AREAS)[number] | undefined;
  try {
    // Registry order is a preference, not a guarantee: immediate entry beats
    // waiting for a preferred area's slower authority when several grant.
    grantedArea = await Promise.any(
      checks.map(async (check) => {
        const [area, access] = await check;
        if (access !== "granted") throw access;
        return area;
      }),
    );
  } catch {
    // Every area denied, failed closed, or requires sign-in. Build the full
    // capability result below so the landing gate can show the best action.
  }

  if (grantedArea) redirect(307, grantedArea.href);

  for (const [area, access] of await Promise.all(checks)) {
    capabilities[area.id] = access;
  }

  return { capabilities };
};
