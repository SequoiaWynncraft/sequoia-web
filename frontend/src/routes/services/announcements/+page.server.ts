import type { PageServerLoad } from "./$types";

import { loadPostHub } from "#lib/server/postPages.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  return { hub: await loadPostHub(fetch, viewer, "announcements") };
};
