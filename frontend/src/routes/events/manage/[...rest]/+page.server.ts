import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { legacyManageRedirect } from "#lib/manage/redirects.js";

export const prerender = false;

/** Event management moved to the console. Form POSTs are replayed there by `hooks.server.ts`. */
export const load: PageServerLoad = ({ url }) => {
  redirect(308, legacyManageRedirect(url.pathname, url.search) ?? "/manage/events");
};
