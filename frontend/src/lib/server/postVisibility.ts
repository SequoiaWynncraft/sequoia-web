import type { RankProfilesResponse } from "$lib/api/client";
import { ANONYMOUS_VIEWER, type PostViewer } from "$lib/posts/audience";
import type { Viewer } from "$lib/site/viewer";

import { checkBranchAreaWithRoster } from "./branchAccess";
import { sameUuid } from "./raidEventBoards";
import { getLinkedRankProfilesResult, memberRanksByUuid } from "./rankProfiles";

/**
 * Resolves who a request is, for post visibility.
 *
 * `manager` is the Community-branch verdict (branch members, guild leadership,
 * website admins) - the same rule that guards the post console, so a manager
 * previews exactly what they can edit. Membership and guild rank come from the
 * fresh roster that verdict was judged against; Sequoia rank and branches from
 * a fresh rank-profile read. Anything stale or unavailable is left out, so a
 * narrowed post fails closed instead of trusting a cached promotion.
 *
 * Anonymous viewers are answered without any read.
 */
export async function resolvePostViewer(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<PostViewer> {
  if (!viewer) return ANONYMOUS_VIEWER;
  // Started alongside the roster read; the branch check reads the same cached
  // resource, so this is not a second call out.
  const profilesPromise = loadFreshProfiles(fetchImpl);
  const { access, roster } = await checkBranchAreaWithRoster(fetchImpl, viewer, "community");
  if (access === "granted") return { ...ANONYMOUS_VIEWER, tier: "manager" };

  const entry = roster?.find(
    (member) => member.uuid !== null && sameUuid(member.uuid, viewer.minecraftUuid),
  );
  if (!entry) return { ...ANONYMOUS_VIEWER, tier: "signedIn" };
  return {
    tier: "member",
    guildRank: entry.rank,
    ...profileStanding(await profilesPromise, viewer.minecraftUuid),
  };
}

function loadFreshProfiles(fetchImpl: typeof fetch): Promise<RankProfilesResponse | null> {
  // Both staleness flags count, as in branchAccess: our cache's and the
  // backend's own Discord snapshot.
  return getLinkedRankProfilesResult(fetchImpl, { allowStale: false })
    .then((result) => (result.stale || result.data.source.stale ? null : result.data))
    .catch(() => null);
}

/** A member's Sequoia rank and full-member branches, or nothing when unverifiable. */
function profileStanding(
  profiles: RankProfilesResponse | null,
  minecraftUuid: string,
): Pick<PostViewer, "seqRank" | "branches"> {
  const none = { seqRank: null, branches: [] };
  if (!profiles) return none;
  const profile = profiles.profiles.find(
    (candidate) => candidate.minecraft != null && sameUuid(candidate.minecraft.uuid, minecraftUuid),
  );
  if (!profile?.minecraft) return none;

  let seqRank: string | null = null;
  try {
    seqRank = memberRanksByUuid(profiles)[profile.minecraft.uuid.toLowerCase()]?.rank ?? null;
  } catch {
    // A version-skewed catalog loses the rank, not the page.
  }
  const branches: unknown = profile.summary?.branches;
  return {
    seqRank,
    branches: Array.isArray(branches)
      ? branches.flatMap((entry) =>
          entry !== null &&
          typeof entry === "object" &&
          entry.level === "member" &&
          typeof entry.branch === "string"
            ? [entry.branch]
            : [],
        )
      : [],
  };
}
