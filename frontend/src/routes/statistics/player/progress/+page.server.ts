import { redirect } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const prerender = false;

export const load: PageServerLoad = ({ url }) => {
  const range = url.searchParams.get("range") ?? "1m";
  redirect(308, `/statistics/player/activity?range=${encodeURIComponent(range)}`);
};
