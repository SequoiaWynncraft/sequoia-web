import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { firstAccessible } from "$lib/manage/registry";

export const prerender = false;

/** The console has no landing content: go straight to the first area. */
export const load: PageServerLoad = async ({ parent }) => {
  const { capabilities } = await parent();
  const area = firstAccessible(capabilities);
  if (area) redirect(307, area.href);
  return { capabilities };
};
