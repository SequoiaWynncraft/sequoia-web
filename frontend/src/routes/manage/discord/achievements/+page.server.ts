import type { PageServerLoad } from "./$types";
import { parseCatalogResponse } from "#lib/achievements/catalog.js";
import { discordManagement } from "#lib/server/discordManagement.js";

export const prerender = false;
export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const response = await discordManagement(fetch, cookies.get("seq_session"), "achievements/catalog");
  if (!response.ok) {
    return { access: response.status === 401 ? "signin" as const : response.status === 403 ? "denied" as const : "unverified" as const, catalog: null };
  }
  const catalog = parseCatalogResponse(await response.json().catch(() => null));
  if (!catalog) return { access: "unverified" as const, catalog: null };
  return { access: "granted" as const, catalog };
};
