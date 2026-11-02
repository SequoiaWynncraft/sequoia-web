import type { PageServerLoad } from "./$types";
import type { CeremonyResponse } from "#lib/discord/ceremony.js";
import type { DiscordContext } from "#lib/discord/types.js";
import { discordManagement } from "#lib/server/discordManagement.js";

export const prerender = false;
export const load: PageServerLoad = async ({ fetch, cookies }) => {
  // The console's cached capabilities are display hints, never authorization.
  const token = cookies.get("seq_session");
  const response = await discordManagement(fetch, token, "ceremonies");
  if (!response.ok) {
    return {
      access: response.status === 401 ? "signin" as const : response.status === 403 ? "denied" as const : "unverified" as const,
      ceremonies: null,
      channels: [] as DiscordContext["channels"],
    };
  }
  const ceremonies: CeremonyResponse = await response.json();
  const contextResponse = await discordManagement(fetch, token, `context?guild_id=${encodeURIComponent(ceremonies.settings.guild_id)}`);
  const context: DiscordContext | null = contextResponse.ok ? await contextResponse.json() : null;
  return { access: "granted" as const, ceremonies, channels: context?.channels ?? [] };
};
