import type { PageServerLoad } from "./$types";
import type { DiscordContext, ManagedMessage } from "#lib/discord/types.js";
import { discordManagement } from "#lib/server/discordManagement.js";

export const prerender = false;
export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const token = cookies.get("seq_session");
  const response = await discordManagement(fetch, token, "context");
  if (!response.ok) {
    // Rust re-authorizes fresh here; a missing or unreachable authority fails closed.
    return { access: response.status === 401 ? "signin" as const : response.status === 403 ? "denied" as const : "unverified" as const, context: null, messages: [] as ManagedMessage[], problem: null };
  }
  const context: DiscordContext = await response.json();
  const listing = await discordManagement(fetch, token, "messages");
  return { access: "granted" as const, context, messages: listing.ok ? await listing.json() as ManagedMessage[] : [], problem: listing.ok ? null : "Messages could not be loaded. Reload to try again." };
};
