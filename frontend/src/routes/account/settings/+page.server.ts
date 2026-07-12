import { fail, type Actions } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

import {
  getPartyFinderDmLevel,
  parsePartyFinderDmLevel,
  setPartyFinderDmLevel,
} from "$lib/server/partyFinderPreferences";

export const prerender = false;

export const load: PageServerLoad = async ({ parent, cookies, fetch }) => {
  const { viewer } = await parent();
  const token = cookies.get("seq_session");
  if (!viewer || !token) return { access: "signin" as const, preference: null };

  const preference = await getPartyFinderDmLevel(token, fetch);
  return preference
    ? { access: "ready" as const, preference }
    : { access: "unavailable" as const, preference: null };
};

export const actions: Actions = {
  default: async ({ request, cookies, fetch }) => {
    const token = cookies.get("seq_session");
    if (!token) return fail(401, { error: "signin", dmLevel: null });

    const formData = await request.formData();
    const dmLevel = parsePartyFinderDmLevel(formData.get("dm_level"));
    if (!dmLevel) return fail(400, { error: "invalid", dmLevel: null });

    const result = await setPartyFinderDmLevel(token, dmLevel, fetch);
    if (result === "unauthorized") return fail(401, { error: "signin", dmLevel });
    if (result === "unavailable") return fail(503, { error: "unavailable", dmLevel });
    return { saved: true, dmLevel };
  },
};
