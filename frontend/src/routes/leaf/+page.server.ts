import type { PageServerLoad } from "./$types";

import { loadLeafGuide } from "#lib/server/leafGuide.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch }) => loadLeafGuide(fetch);
