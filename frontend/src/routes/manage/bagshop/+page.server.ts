import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { legacyManageRedirect } from "$lib/manage/redirects";

export const prerender = false;

/** The bag shop re-homed under Treasury; this stub keeps old links alive. */
export const load: PageServerLoad = async ({ url }) => {
  redirect(308, legacyManageRedirect(url.pathname, url.search) ?? "/manage/treasury/bagshop");
};
