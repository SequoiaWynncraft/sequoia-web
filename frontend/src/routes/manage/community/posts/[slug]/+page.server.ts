import type { Actions, PageServerLoad } from "./$types";

import { pageAreaAccess } from "#lib/server/manageCapabilities.js";
import { deletePostAction, updatePostAction } from "#lib/server/postActions.js";
import { postFormContext } from "#lib/server/postFormContext.js";
import { postStore } from "#lib/server/postStore.js";
import { requestError } from "#lib/server/requestError.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, locals, params, parent, url }) => {
  const { viewer } = await parent();
  const access = await pageAreaAccess(fetch, viewer, "community");
  if (access !== "granted") return { access, stored: null, context: null, auditWarning: false };

  const [stored, context] = await Promise.all([postStore.get(params.slug), postFormContext(fetch)]);
  if (!stored) requestError(locals, 404, "No such post");
  return { access, stored, context, auditWarning: url.searchParams.get("audit") === "unrecorded" };
};

export const actions: Actions = {
  save: updatePostAction,
  delete: deletePostAction,
};
