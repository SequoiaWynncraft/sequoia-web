import type { PageServerLoad } from "./$types";
import { parseAchievementProgress } from "#lib/achievements/progress.js";
import { discordManagement } from "#lib/server/discordManagement.js";

export const prerender = false;

export const load: PageServerLoad = async ({ fetch, cookies }) => {
  const token = cookies.get("seq_session");
  if (!token) return { access: "signin" as const, progress: null };
  const response = await discordManagement(fetch, token, "achievements/me");
  if (response.status === 401) return { access: "signin" as const, progress: null };
  if (response.status === 403) return { access: "denied" as const, progress: null };
  if (!response.ok) return { access: "unavailable" as const, progress: null };
  const progress = parseAchievementProgress(await response.json().catch(() => null));
  if (!progress) return { access: "unavailable" as const, progress: null };
  return { access: "granted" as const, progress };
};
