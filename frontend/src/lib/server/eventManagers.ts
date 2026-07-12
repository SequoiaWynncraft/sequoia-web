import { error } from "@sveltejs/kit";
import type { Cookies } from "@sveltejs/kit";

import type { GuildRankName } from "$lib/api/guildStats";
import type { Viewer } from "$lib/site/viewer";

import { getGuildStats } from "./guildStats";
import { sameUuid } from "./raidEventBoards";
import { loadViewer } from "./viewerSession";

/** Ranks allowed to create, edit, and delete events. */
export const MANAGER_RANKS: readonly GuildRankName[] = ["owner", "chief", "strategist"];

export type ManagerAccess = "manager" | "signin" | "unverified" | "denied";

/**
 * Same trust rules as the member gates: management is only ever authorized
 * against a fresh roster. A stale or missing roster fails closed.
 */
export async function checkEventManager(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<ManagerAccess> {
  if (!viewer) return "signin";
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
 */
export async function requireEventManager(request: {
  cookies: Cookies;
  fetch: typeof fetch;
}): Promise<void> {
  const viewer = await loadViewer(request.cookies.get("seq_session"), request.fetch);
  if ((await checkEventManager(request.fetch, viewer)) !== "manager") {
    error(403, "Event management is restricted to guild leadership");
  }
}
