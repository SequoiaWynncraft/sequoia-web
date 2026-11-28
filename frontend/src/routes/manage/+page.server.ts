import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { contentAreas } from "#lib/manage/registry.js";
import type { ManageCapabilities } from "#lib/manage/types.js";
import { pageAreaAccess } from "#lib/server/manageCapabilities.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  const capabilities = {} as ManageCapabilities;

  const areas = contentAreas();
  const checks = areas.map(
    async (area) => [area, await pageAreaAccess(fetch, viewer, area.id)] as const,
  );

  let grantedArea: (typeof areas)[number] | undefined;
  try {
    grantedArea = await Promise.any(
      checks.map(async (check) => {
        const [area, access] = await check;
        if (access !== "granted") throw access;
        return area;
      }),
    );
  } catch {
  }

  if (grantedArea) redirect(307, grantedArea.href);

  for (const [area, access] of await Promise.all(checks)) {
    capabilities[area.id] = access;
  }

  return { capabilities };
};
