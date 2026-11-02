import type { Cookies } from "@sveltejs/kit";

import type { RankProfilesResponse } from "#lib/api/client.js";
import type { GuildMemberStats, GuildRankName } from "#lib/api/guildStats.js";
import type { AreaAccess, ManageBranchKey } from "#lib/manage/types.js";
import type { Viewer } from "#lib/site/viewer.js";

import { getGuildStats } from "./guildStats";
import { sameUuid } from "./raidEventBoards";
import { getLinkedRankProfilesResult } from "./rankProfiles";
import { requestError } from "./requestError";
import { loadViewer } from "./viewerSession";

export type { ManageBranchKey };

/** Guild leadership ranks: they hold every branch area. */
export const MANAGER_RANKS: readonly GuildRankName[] = ["owner", "chief", "strategist"];

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
  options: { allowStale: boolean; waitMs?: number },
): Promise<BranchSnapshot> {
  // Each half is bounded on its own: a slow profile service must not throw
  // away a roster that already answered - the roster alone settles
  // leadership, and losing it would hide the console from owners for the
  // render. An unbounded caller just awaits both.
  const bounded = <T>(half: Promise<T | null>): Promise<T | null> =>
    options.waitMs === undefined
      ? half
      : Promise.race([
          half,
          new Promise<null>((resolve) => setTimeout(() => resolve(null), options.waitMs)),
        ]);
  const [roster, profiles] = await Promise.all([
    bounded(loadRosterHalf(fetchImpl, options.allowStale)),
    bounded(loadProfilesHalf(fetchImpl, options.allowStale)),
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
  if (!profile) return "denied";
  // The shared validator only guarantees the shallow response shape; a
  // version-skewed profile - branches missing, or holding null/short
  // entries - must fail closed as retryable, not throw a 500 out of every
  // access check that reaches it.
  const branches = profile.summary?.branches;
  const wellFormed =
    Array.isArray(branches) &&
    branches.every(
      (entry) =>
        entry !== null &&
        typeof entry === "object" &&
        typeof entry.branch === "string" &&
        typeof entry.level === "string",
    );
  if (!wellFormed) return "unverified";
  const granted = branches.some((entry) => entry.level === "member" && entry.branch === branch);
  return granted ? "granted" : "denied";
}

/** A branch decision together with the roster it was judged against. */
export interface BranchAreaResult {
  access: AreaAccess;
  roster: GuildMemberStats[] | null;
}

/**
 * Strict resolution that hands the roster back, for callers who need both the
 * branch answer and the membership behind it - resolving them separately would
 * cost a second roster read and could straddle a refresh.
 *
 * Fresh data only. The roster alone settles admins, leadership, and off-roster
 * viewers; only an ordinary member's answer waits for the rank profiles, so a
 * slow profile service cannot delay a decision that never needed it. Both
 * reads still start together - the profile fetch is not serialized behind the
 * roster.
 */
export async function checkBranchAreaWithRoster(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
  branch: ManageBranchKey,
): Promise<BranchAreaResult> {
  if (!viewer) return { access: "signin", roster: null };
  // An admin's access is settled by the session, so no profile lookup is
  // started for them; the roster is still read because the caller asked for it.
  const profilesPromise = viewer.websiteAdmin ? null : loadProfilesHalf(fetchImpl, false);
  const roster = await loadRosterHalf(fetchImpl, false);
  const rosterOnly = branchAccessFrom({ roster, profiles: null }, viewer, branch);
  if (profilesPromise === null || roster === null || rosterOnly !== "unverified") {
    return { access: rosterOnly, roster };
  }
  return {
    access: branchAccessFrom({ roster, profiles: await profilesPromise }, viewer, branch),
    roster,
  };
}

/**
 * Strict resolution for protected pages and endpoints, for callers that need
 * only the verdict: an admin is answered from the session without any read at
 * all, otherwise this is `checkBranchAreaWithRoster` with the roster dropped.
 */
export async function checkBranchArea(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
  branch: ManageBranchKey,
): Promise<AreaAccess> {
  if (!viewer) return "signin";
  if (viewer.websiteAdmin) return "granted";
  return (await checkBranchAreaWithRoster(fetchImpl, viewer, branch)).access;
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
