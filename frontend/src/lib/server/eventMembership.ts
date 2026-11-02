import type { GuildMemberStats } from "#lib/api/guildStats.js";
import type { Viewer } from "#lib/site/viewer.js";

import { getGuildStats } from "./guildStats";
import { sameUuid } from "./raidEventBoards";

/** Non-members never receive a member event's gated sections. */
export type Membership = "member" | "signin" | "unverified" | "notMember";

export interface MembershipResult {
  membership: Membership;
  /** The roster the check ran against, for callers that reuse it. */
  roster: GuildMemberStats[] | null;
}

/**
 * Membership mirrors the raid page's fresh-roster trust rules: only a fresh
 * roster is authoritative, and an unavailable one fails closed. Website
 * administrators are already authorized by the backend, so they read as
 * members off the stale-tolerant roster.
 */
export async function checkEventMembership(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<MembershipResult> {
  if (!viewer) return { membership: "signin", roster: null };
  if (viewer.websiteAdmin) {
    const stats = await getGuildStats(fetchImpl, { allowStale: true }).catch(() => null);
    return { membership: "member", roster: stats?.members ?? null };
  }
  const stats = await getGuildStats(fetchImpl, { allowStale: false }).catch(() => null);
  const roster = stats !== null && !stats.stale ? stats.members : null;
  if (roster === null) return { membership: "unverified", roster: null };
  const member = roster.some(
    (entry) => entry.uuid !== null && sameUuid(entry.uuid, viewer.minecraftUuid),
  );
  return { membership: member ? "member" : "notMember", roster };
}
