import type { LayoutServerLoad } from "./$types";

import { resolveManageCapabilities } from "$lib/server/manageCapabilities";

export const prerender = false;

/**
 * One strict, fail-closed access resolution for the whole console: pages
 * consume `capabilities` from `parent()` instead of re-checking. Form
 * actions still guard themselves - layout loads do not run for actions.
 */
export const load: LayoutServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  return { capabilities: await resolveManageCapabilities(fetch, viewer) };
};
