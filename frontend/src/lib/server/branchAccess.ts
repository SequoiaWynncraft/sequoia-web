import type { Cookies } from "@sveltejs/kit";

import type { RankProfilesResponse } from "$lib/api/client";
import type { GuildMemberStats } from "$lib/api/guildStats";
import type { AreaAccess } from "$lib/manage/types";
import type { Viewer } from "$lib/site/viewer";

import { MANAGER_RANKS } from "./eventManagers";
import { getGuildStats } from "./guildStats";
import { sameUuid } from "./raidEventBoards";
import { getLinkedRankProfilesResult } from "./rankProfiles";
import { requestError } from "./requestError";
import { loadViewer } from "./viewerSession";

/**
 * Backend branch ids (`RankSummary.branches[].branch`) that map to management
 * areas. These are stable catalog ids from sequoia-backend, not Discord
 * display labels, so renaming a role cannot open or close a gate.
 */
export type ManageBranchKey =
  | "events"
  | "treasury"
  | "community"
  | "development"
  | "military"
  | "end_game";

/**
 * Both halves of a branch authorization, loaded together so every area
 * computes from one roster read and one profiles read per request. A half is
 * null when its source failed - or, for strict loads, came back stale: a
 * cached roster or profile outlives the revocation that removed the viewer,
 * so authorizing from one would keep serving them through an upstream outage.
 */
export interface BranchSnapshot {
  roster: GuildMemberStats[] | null;
  profiles: RankProfilesResponse | null;
}

async function loadRosterHalf(
  fetchImpl: typeof fetch,
  allowStale: boolean,
): Promise<GuildMemberStats[] | null> {
  return getGuildStats(fetchImpl, { allowStale })
    .then((stats) => (!allowStale && stats.stale ? null : stats.members))
    .catch(() => null);
}

async function loadProfilesHalf(
  fetchImpl: typeof fetch,
  allowStale: boolean,
): Promise<RankProfilesResponse | null> {
  // Two staleness flags guard the profiles: `result.stale` is our cache's,
  // `data.source.stale` is the backend's own Discord snapshot. A strict load
  // rejects either - a role revoked during a Discord outage lives on in a
  // fresh-looking response.
  return getLinkedRankProfilesResult(fetchImpl, { allowStale })
    .then((result) => (!allowStale && (result.stale || result.data.source.stale) ? null : result.data))
    .catch(() => null);
}

export async function loadBranchSnapshot(
  fetchImpl: typeof fetch,
  options: { allowStale: boolean },
): Promise<BranchSnapshot> {
  const [roster, profiles] = await Promise.all([
    loadRosterHalf(fetchImpl, options.allowStale),
    loadProfilesHalf(fetchImpl, options.allowStale),
  ]);
  return { roster, profiles };
}

/**
 * The one access rule for every branch area: website admins and guild
 * leadership see every branch; a branch's full members (trainees excluded)
 * see their own. Membership requires being on the guild roster - a Discord
 * branch role outlives leaving the guild. Viewers without a linked rank
 * profile fail closed to denied, matching the services-side branch gate.
 */
export function branchAccessFrom(
  snapshot: BranchSnapshot,
  viewer: Viewer | null,
  branch: ManageBranchKey,
): AreaAccess {
  if (!viewer) return "signin";
  if (viewer.websiteAdmin) return "granted";
  if (snapshot.roster === null) return "unverified";
  const member = snapshot.roster.find(
    (entry) => entry.uuid !== null && sameUuid(entry.uuid, viewer.minecraftUuid),
  );
  if (!member) return "denied";
  if (MANAGER_RANKS.includes(member.rank)) return "granted";
  if (snapshot.profiles === null) return "unverified";
  // `sameUuid` on both halves deliberately: the roster and the rank API do
  // not agree on dashes.
  const profile = snapshot.profiles.profiles.find(
    (candidate) =>
      candidate.minecraft != null && sameUuid(candidate.minecraft.uuid, viewer.minecraftUuid),
  );
  const granted = profile?.summary.branches.some(
    (entry) => entry.level === "member" && entry.branch === branch,
  );
  return granted ? "granted" : "denied";
}

/**
 * Strict resolution for protected pages and endpoints: fresh data only. The
 * roster alone settles admins, leadership, and off-roster viewers; only an
 * ordinary member's answer waits for the rank profiles, so a slow profile
 * service cannot delay a decision that never needed it. Both reads still
 * start together - the profile fetch is not serialized behind the roster.
 */
export async function checkBranchArea(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
  branch: ManageBranchKey,
): Promise<AreaAccess> {
  if (!viewer) return "signin";
  if (viewer.websiteAdmin) return "granted";
  const profilesPromise = loadProfilesHalf(fetchImpl, false);
  const roster = await loadRosterHalf(fetchImpl, false);
  const rosterOnly = branchAccessFrom({ roster, profiles: null }, viewer, branch);
  if (roster === null || rosterOnly !== "unverified") return rosterOnly;
  return branchAccessFrom({ roster, profiles: await profilesPromise }, viewer, branch);
}

/**
 * Guard for form actions and +server endpoints, which cannot reuse the
 * layout's viewer: resolves the session cookie itself and throws 403 unless
 * the branch grants access. Returns the acting viewer so callers can
 * attribute their audit entries.
 */
export async function requireBranchArea(
  request: {
    cookies: Pick<Cookies, "get">;
    fetch: typeof fetch;
    locals: App.Locals;
  },
  branch: ManageBranchKey,
  message: string,
): Promise<Viewer> {
  const viewer = await loadViewer(request.cookies.get("seq_session"), request.fetch);
  if (!viewer || (await checkBranchArea(request.fetch, viewer, branch)) !== "granted") {
    requestError(request.locals, 403, message);
  }
  return viewer;
}
