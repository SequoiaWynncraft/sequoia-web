import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { legacyManageRedirect } from "$lib/manage/redirects";

export const prerender = false;

/**
 * Event management moved to the console. 308 keeps the method, so a stale
 * tab's form POST survives the move instead of degrading to a GET.
 */
export const load: PageServerLoad = ({ url }) => {
  redirect(308, legacyManageRedirect(url.pathname, url.search) ?? "/manage/events");
};
