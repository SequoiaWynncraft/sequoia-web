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

export const MANAGER_RANKS: readonly GuildRankName[] = ["owner", "chief", "strategist"];

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
  return getLinkedRankProfilesResult(fetchImpl, { allowStale })
    .then((result) => (!allowStale && (result.stale || result.data.source.stale) ? null : result.data))
    .catch(() => null);
}

export async function loadBranchSnapshot(
  fetchImpl: typeof fetch,
  options: { allowStale: boolean; waitMs?: number },
): Promise<BranchSnapshot> {
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
  const profile = snapshot.profiles.profiles.find(
    (candidate) =>
      candidate.minecraft != null && sameUuid(candidate.minecraft.uuid, viewer.minecraftUuid),
  );
  if (!profile) return "denied";
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

export interface BranchAreaResult {
  access: AreaAccess;
  roster: GuildMemberStats[] | null;
}

export async function checkBranchAreaWithRoster(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
  branch: ManageBranchKey,
): Promise<BranchAreaResult> {
  if (!viewer) return { access: "signin", roster: null };
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

export async function checkBranchArea(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
  branch: ManageBranchKey,
): Promise<AreaAccess> {
  if (!viewer) return "signin";
  if (viewer.websiteAdmin) return "granted";
  return (await checkBranchAreaWithRoster(fetchImpl, viewer, branch)).access;
}

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
