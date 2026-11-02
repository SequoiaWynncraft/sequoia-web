import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import { legacyManageRedirect } from "#lib/manage/redirects.js";

export const prerender = false;

/** The audit log re-homed under Development; this stub keeps old links alive. */
export const load: PageServerLoad = async ({ url }) => {
  redirect(308, legacyManageRedirect(url.pathname, url.search) ?? "/manage/development/audit");
};
