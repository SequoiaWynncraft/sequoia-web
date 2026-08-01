import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { legacyManageRedirect } from "$lib/manage/redirects";

export const prerender = false;

/** The bag shop staff panel moved to the console; 308 preserves the method. */
export const load: PageServerLoad = ({ url }) => {
  redirect(308, legacyManageRedirect(url.pathname, url.search) ?? "/manage/treasury/bagshop");
};
