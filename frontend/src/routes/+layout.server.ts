import type { LayoutServerLoad } from "./$types";

import { building } from "$app/environment";
import { SEQUOIA_API_BASE_URL } from "$lib/config/public";
import type { Viewer } from "$lib/site/viewer";

export const load: LayoutServerLoad = async ({ cookies, fetch }) => {
  // Prerendered routes are baked without a request, so they render signed-out.
  if (building) return { viewer: null };
  return { viewer: await loadViewer(cookies.get("seq_session"), fetch) };
};

async function loadViewer(
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
      minecraftUuid: me.minecraft_uuid,
      minecraftUsername: typeof me.minecraft_username === "string" ? me.minecraft_username : null,
    };
  } catch {
    return null;
  }
}
