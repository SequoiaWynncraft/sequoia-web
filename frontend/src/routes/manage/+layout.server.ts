import type { LayoutServerLoad } from "./$types";

import { peekManageCapabilities } from "$lib/server/manageCapabilities";

export const prerender = false;

/**
 * Bounded, stale-tolerant capability peeks for sidebar display. Protected
 * pages resolve their own area's authority strictly before consuming data.
 */
export const load: LayoutServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  return { capabilities: await peekManageCapabilities(fetch, viewer) };
};
