import type { LayoutServerLoad } from "./$types";

import { peekManageCapabilities } from "#lib/server/manageCapabilities.js";

export const prerender = false;

export const load: LayoutServerLoad = async ({ fetch, parent }) => {
  const { viewer } = await parent();
  return { capabilities: await peekManageCapabilities(fetch, viewer) };
};
