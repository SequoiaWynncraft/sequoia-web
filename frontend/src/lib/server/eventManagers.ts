import type { Cookies } from "@sveltejs/kit";

import type { GuildRankName } from "$lib/api/guildStats";
import type { Viewer } from "$lib/site/viewer";

import { getGuildStats } from "./guildStats";
import { sameUuid } from "./raidEventBoards";
import { requestError } from "./requestError";
import { loadViewer } from "./viewerSession";

/** Ranks allowed to create, edit, and delete events. */
export const MANAGER_RANKS: readonly GuildRankName[] = ["owner", "chief", "strategist"];

export type ManagerAccess = "manager" | "signin" | "unverified" | "denied";

/**
 * Website administrators are authorized by the backend. Guild leadership is
 * only authorized against a fresh roster, and a stale or missing roster fails closed.
 */
export async function checkEventManager(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<ManagerAccess> {
  if (!viewer) return "signin";
  if (viewer.websiteAdmin) return "manager";
  const stats = await getGuildStats(fetchImpl, { allowStale: false }).catch(() => null);
  if (stats === null || stats.stale) return "unverified";
  const member = stats.members.find(
    (entry) => entry.uuid !== null && sameUuid(entry.uuid, viewer.minecraftUuid),
  );
  return member && MANAGER_RANKS.includes(member.rank) ? "manager" : "denied";
}

/**
 * Guard for form actions, which cannot reuse the layout's viewer: resolves
 * the session cookie itself and throws 403 unless the caller is a manager.
 * Returns the acting manager so actions can attribute their audit entries.
 */
export async function requireEventManager(request: {
  cookies: Pick<Cookies, "get">;
  fetch: typeof fetch;
  locals: App.Locals;
}): Promise<Viewer> {
  const viewer = await loadViewer(request.cookies.get("seq_session"), request.fetch);
  if (!viewer || (await checkEventManager(request.fetch, viewer)) !== "manager") {
    requestError(request.locals, 403, "Event management is restricted to guild leadership");
  }
  return viewer;
}
