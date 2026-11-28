import type { PageServerLoad } from "./$types";

import { loadLeafGuide } from "#lib/server/leafGuide.js";

export const prerender = false;

// The plain fetch, not SvelteKit's: its fetch passes the visitor's cookies on to seqwawa.com's
// subdomains, and these public answers are shared by every visitor.
export const load: PageServerLoad = async () => loadLeafGuide(globalThis.fetch);
