import type { PageServerLoad } from "./$types";
import type { WelcomeResponse } from "#lib/discord/welcome.js";
import type { DiscordContext } from "#lib/discord/types.js";
import { discordManagement } from "#lib/server/discordManagement.js";

export const prerender = false;
export const load: PageServerLoad = async ({ fetch, cookies }) => {
  // The console's cached capabilities are display hints, never authorization.
  const token = cookies.get("seq_session");
  const response = await discordManagement(fetch, token, "welcome");
  if (!response.ok) {
    return {
      access: response.status === 401 ? "signin" as const : response.status === 403 ? "denied" as const : "unverified" as const,
      welcome: null,
      channels: [] as DiscordContext["channels"],
    };
  }
  // Older servers omit night; the manager fills defaults and never sends night back to them.
  const welcome: WelcomeResponse = await response.json();
  const contextResponse = await discordManagement(fetch, token, `context?guild_id=${encodeURIComponent(welcome.settings.guild_id)}`);
  const context: DiscordContext | null = contextResponse.ok ? await contextResponse.json() : null;
  return { access: "granted" as const, welcome, channels: context?.channels ?? [] };
};
