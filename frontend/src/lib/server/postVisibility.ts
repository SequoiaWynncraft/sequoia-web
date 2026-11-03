import type { RankProfilesResponse } from "#lib/api/client.js";
import { ANONYMOUS_VIEWER, type PostViewer } from "#lib/posts/audience.js";
import type { Viewer } from "#lib/site/viewer.js";

import { checkBranchAreaWithRoster } from "./branchAccess";
import { sameUuid } from "./raidEventBoards";
import { getLinkedRankProfilesResult, memberRanksByUuid } from "./rankProfiles";

export async function resolvePostViewer(
  fetchImpl: typeof fetch,
  viewer: Viewer | null,
): Promise<PostViewer> {
  if (!viewer) return ANONYMOUS_VIEWER;
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
  return getLinkedRankProfilesResult(fetchImpl, { allowStale: false })
    .then((result) => (result.stale || result.data.source.stale ? null : result.data))
    .catch(() => null);
}

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
  } catch {}
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
