import type { LayoutServerLoad } from "./$types";

import { building } from "$app/environment";
import { navManageVisible } from "$lib/server/manageCapabilities";
import { loadViewer } from "$lib/server/viewerSession";

export const load: LayoutServerLoad = async ({ cookies, fetch }) => {
  // Prerendered routes are baked without a request, so they render signed-out.
  if (building) return { viewer: null, manageVisible: false };
  const viewer = await loadViewer(cookies.get("seq_session"), fetch);
  // Display-only: gates the navbar's Manage entry; /manage re-checks strictly.
  return { viewer, manageVisible: await navManageVisible(fetch, viewer) };
};
