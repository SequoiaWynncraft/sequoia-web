import type { LayoutServerLoad } from "./$types";

import { building } from "$app/environment";
import { navManageVisible } from "$lib/server/manageCapabilities";
import { loadViewer } from "$lib/server/viewerSession";
import { DEFAULT_HIDDEN_NAV, NAV_PREFERENCE_COOKIE, parseHiddenNav } from "$lib/site/navPreferences";

export const load: LayoutServerLoad = async ({ cookies, fetch }) => {
  // Prerendered routes are baked without a request, so they render signed-out.
  if (building) {
    return { viewer: null, manageVisible: false, navHidden: [...DEFAULT_HIDDEN_NAV] };
  }
  const viewer = await loadViewer(cookies.get("seq_session"), fetch);
  return {
    viewer,
    // Display-only: gates the navbar's Manage entry; /manage re-checks strictly.
    manageVisible: await navManageVisible(fetch, viewer),
    // Which navbar entries this browser hid; resolved here so the first paint
    // already shows the chosen menu.
    navHidden: parseHiddenNav(cookies.get(NAV_PREFERENCE_COOKIE)),
  };
};
