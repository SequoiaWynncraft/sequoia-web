import type { Actions, PageServerLoad } from "./$types";

import type { PostFeed } from "$lib/posts/types";
import { pageAreaAccess } from "$lib/server/manageCapabilities";
import { createPostAction } from "$lib/server/postActions";
import { postFormContext } from "$lib/server/postFormContext";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, parent, url }) => {
  const { viewer } = await parent();
  // Re-resolved per page load: the console layout's capabilities are cached
  // across child navigations, so they must not gate protected data here.
  const access = await pageAreaAccess(fetch, viewer, "community");
  const feed: PostFeed = url.searchParams.get("feed") === "announcements" ? "announcements" : "news";
  if (access !== "granted") return { access, feed, context: null };
  return { access, feed, context: await postFormContext(fetch) };
};

export const actions: Actions = {
  save: createPostAction,
};
