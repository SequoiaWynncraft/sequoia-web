import type { LayoutServerLoad } from "./$types";

import { building } from "$app/env";
import { navManageVisible } from "#lib/server/manageCapabilities.js";
import { loadViewer } from "#lib/server/viewerSession.js";
import { DEFAULT_HIDDEN_NAV, NAV_PREFERENCE_COOKIE, parseHiddenNav } from "#lib/site/navPreferences.js";
import { DEFAULT_THEME_ID, parseThemeId, THEME_COOKIE } from "#lib/site/themePreferences.js";

export const load: LayoutServerLoad = async ({ cookies, fetch }) => {
  if (building) {
    return {
      viewer: null,
      manageVisible: false,
      navHidden: [...DEFAULT_HIDDEN_NAV],
      theme: DEFAULT_THEME_ID,
    };
  }
  const viewer = await loadViewer(cookies.get("seq_session"), fetch);
  return {
    viewer,
    manageVisible: await navManageVisible(fetch, viewer),
    navHidden: parseHiddenNav(cookies.get(NAV_PREFERENCE_COOKIE)),
    theme: parseThemeId(cookies.get(THEME_COOKIE)),
  };
};
