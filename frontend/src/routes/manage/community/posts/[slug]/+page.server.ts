import type { Actions, PageServerLoad } from "./$types";

import { pageAreaAccess } from "$lib/server/manageCapabilities";
import { deletePostAction, updatePostAction } from "$lib/server/postActions";
import { postFormContext } from "$lib/server/postFormContext";
import { postStore } from "$lib/server/postStore";
import { requestError } from "$lib/server/requestError";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, locals, params, parent, url }) => {
  const { viewer } = await parent();
  // Re-resolved per page load: the console layout's capabilities are cached
  // across child navigations, so they must not gate protected data here.
  const access = await pageAreaAccess(fetch, viewer, "community");
  if (access !== "granted") return { access, stored: null, context: null, auditWarning: false };

  const [stored, context] = await Promise.all([postStore.get(params.slug), postFormContext(fetch)]);
  if (!stored) requestError(locals, 404, "No such post");
  // Set by the create redirect when the audit row for it did not land.
  return { access, stored, context, auditWarning: url.searchParams.get("audit") === "unrecorded" };
};

export const actions: Actions = {
  save: updatePostAction,
  delete: deletePostAction,
};
