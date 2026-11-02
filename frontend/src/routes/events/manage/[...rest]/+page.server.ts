import { redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

import { legacyManageRedirect } from "#lib/manage/redirects.js";

export const prerender = false;

/**
 * Event management moved to the console. 308 keeps the method, so a stale
 * tab's form POST survives the move instead of degrading to a GET.
 */
export const load: PageServerLoad = ({ url }) => {
  redirect(308, legacyManageRedirect(url.pathname, url.search) ?? "/manage/events");
};

/**
 * Named form actions dispatch before `load` runs, so a stale tab's POST to
 * e.g. `?/save` would 405 without these: every legacy action re-issues the
 * 308 to its console counterpart (`url.search` carries the `?/action`
 * target), where the real action handles it.
 */
const redirectAction = ({ url }: { url: URL }): never => {
  redirect(308, legacyManageRedirect(url.pathname, url.search) ?? "/manage/events");
};

export const actions: Actions = {
  save: redirectAction,
  delete: redirectAction,
  rollRaffle: redirectAction,
  createTracker: redirectAction,
  updateTracker: redirectAction,
  savePreset: redirectAction,
  deletePreset: redirectAction,
};
