import type { PageServerLoad } from "./$types";

import { loadPostPage } from "$lib/server/postPages";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, locals, params, parent }) => {
  const { viewer } = await parent();
  return loadPostPage(fetch, locals, viewer, "news", params.slug);
};
