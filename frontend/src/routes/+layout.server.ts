import type { LayoutServerLoad } from "./$types";

import { building } from "$app/environment";
import { loadViewer } from "$lib/server/viewerSession";

export const load: LayoutServerLoad = async ({ cookies, fetch }) => {
  // Prerendered routes are baked without a request, so they render signed-out.
  if (building) return { viewer: null };
  return { viewer: await loadViewer(cookies.get("seq_session"), fetch) };
};
