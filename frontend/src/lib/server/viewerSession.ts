import { SEQUOIA_API_BASE_URL } from "#lib/config/public.js";
import type { Viewer } from "#lib/site/viewer.js";

export async function loadViewer(
  token: string | undefined,
  fetchImpl: typeof fetch,
): Promise<Viewer | null> {
  if (!token) return null;
  try {
    const response = await fetchImpl(`${SEQUOIA_API_BASE_URL}/auth/web/me`, {
      headers: { authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const me = await response.json();
    if (typeof me?.discord_id !== "string" || typeof me?.minecraft_uuid !== "string") return null;
    return {
      discordId: me.discord_id,
      discordUsername: typeof me.discord_username === "string" ? me.discord_username : null,
      minecraftUuid: me.minecraft_uuid,
      minecraftUsername: typeof me.minecraft_username === "string" ? me.minecraft_username : null,
      websiteAdmin: me.website_admin === true,
    };
  } catch {
    return null;
  }
}
