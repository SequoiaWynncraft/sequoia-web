import { redirect } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const prerender = false;

// The gains view lives on the Activity page now; old links land on the same range.
export const load: PageServerLoad = ({ url }) => {
  const range = url.searchParams.get("range") ?? "1m";
  redirect(308, `/statistics/player/activity?range=${encodeURIComponent(range)}`);
};
