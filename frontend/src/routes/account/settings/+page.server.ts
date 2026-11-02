import { fail, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import {
  getLinkedAccounts,
  parseAccountUuid,
  redirectToSessionRefresh,
  removeAccount,
  setPrimaryAccount,
  type AccountChange,
} from "#lib/server/linkedAccounts.js";
import {
  getPartyFinderDmLevel,
  parsePartyFinderDmLevel,
  setPartyFinderDmLevel,
} from "#lib/server/partyFinderPreferences.js";
import {
  NAV_PREFERENCE_COOKIE,
  NAV_PREFERENCE_MAX_AGE,
  navToggleIds,
  serializeHiddenNav,
} from "#lib/site/navPreferences.js";
import { parseThemeId, THEME_COOKIE, THEME_MAX_AGE } from "#lib/site/themePreferences.js";

export const prerender = false;

export const load: PageServerLoad = async ({ parent, cookies, fetch }) => {
  const { viewer } = await parent();
  const token = cookies.get("seq_session");
  if (!viewer || !token) return { access: "signin" as const, preference: null, accounts: null };

  const [result, accounts] = await Promise.all([getPartyFinderDmLevel(token, fetch), getLinkedAccounts(token, fetch)]);
  const linked = accounts.status === "ok" ? accounts.accounts : null;
  if (result.status === "ok") return { access: "ready" as const, preference: result.level, accounts: linked };
  return {
    access: result.status === "unauthorized" ? ("signin" as const) : ("unavailable" as const),
    preference: null,
    accounts: linked,
  };
};

async function changeAccount(
  request: Request,
  token: string | undefined,
  url: URL,
  change: (token: string, uuid: string) => Promise<AccountChange>,
) {
  if (!token) return fail(401, { section: "accounts", error: "signin" as const });
  const uuid = parseAccountUuid((await request.formData()).get("uuid"));
  if (!uuid) return fail(400, { section: "accounts", error: "not_owned" as const });

  const result = await change(token, uuid);
  if (result === "saved") redirectToSessionRefresh(`${url.origin}${url.pathname}`);
  if (result === "unauthorized") return fail(401, { section: "accounts", error: "signin" as const });
  return fail(result === "unavailable" ? 503 : 409, { section: "accounts", error: result });
}

export const actions: Actions = {
  primary: ({ request, cookies, url, fetch }) =>
    changeAccount(request, cookies.get("seq_session"), url, (token, uuid) => setPrimaryAccount(token, uuid, fetch)),

  remove: ({ request, cookies, url, fetch }) =>
    changeAccount(request, cookies.get("seq_session"), url, (token, uuid) => removeAccount(token, uuid, fetch)),

  notifications: async ({ request, cookies, fetch }) => {
    const token = cookies.get("seq_session");
    if (!token) return fail(401, { section: "notifications", error: "signin", dmLevel: null });

    const formData = await request.formData();
    const dmLevel = parsePartyFinderDmLevel(formData.get("dm_level"));
    if (!dmLevel) return fail(400, { section: "notifications", error: "invalid", dmLevel: null });

    const result = await setPartyFinderDmLevel(token, dmLevel, fetch);
    if (result === "unauthorized") {
      return fail(401, { section: "notifications", error: "signin", dmLevel });
    }
    if (result === "unavailable") {
      return fail(503, { section: "notifications", error: "unavailable", dmLevel });
    }
    return { section: "notifications", saved: true, dmLevel };
  },

  /**
   * Store this browser's theme. Like the navbar choice it is a display
   * preference with no backend record, so it works signed out. An unknown id
   * lands on the default rather than failing - there is nothing for the viewer
   * to correct, and a bad value would otherwise stick in the cookie.
   */
  theme: async ({ request, cookies }) => {
    const formData = await request.formData();
    const theme = parseThemeId(String(formData.get("theme") ?? ""));
    cookies.set(THEME_COOKIE, theme, {
      path: "/",
      maxAge: THEME_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
    });
    return { section: "theme", saved: true, theme };
  },

  /**
   * Store which navbar entries this browser shows. The form submits the entries
   * to keep, because unchecked boxes send nothing - hiding is therefore the
   * absence of a value, which works with JavaScript off. Deleting the cookie
   * restores the trimmed default menu.
   */
  navigation: async ({ request, cookies }) => {
    const formData = await request.formData();
    if (formData.has("reset")) {
      cookies.delete(NAV_PREFERENCE_COOKIE, { path: "/" });
      return { section: "navigation", saved: true, reset: true };
    }

    const visible = new Set(formData.getAll("visible").map(String));
    const hidden = navToggleIds().filter((id) => !visible.has(id));
    cookies.set(NAV_PREFERENCE_COOKIE, serializeHiddenNav(hidden), {
      path: "/",
      maxAge: NAV_PREFERENCE_MAX_AGE,
      httpOnly: true,
      sameSite: "lax",
    });
    return { section: "navigation", saved: true, reset: false };
  },
};
