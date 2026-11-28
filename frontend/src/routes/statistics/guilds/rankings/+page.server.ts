import { redirect } from "@sveltejs/kit";

import type { PageServerLoad } from "./$types";

export const prerender = false;

export const load: PageServerLoad = ({ url }) => {
  const season = url.searchParams.get("season");
  const query = season ? `?season=${encodeURIComponent(season)}` : "";
  redirect(308, `/statistics/global/rankings${query}`);
};
