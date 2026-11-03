import { getLinkedRankProfiles, progressionRankLabels } from "./rankProfiles";

const RANK_PROFILES_GRACE_MS = 500;

export interface PostFormContext {
  seqRanks: string[];
}

export async function postFormContext(fetchImpl: typeof fetch): Promise<PostFormContext> {
  const profiles = await Promise.race([
    getLinkedRankProfiles(fetchImpl).catch(() => null),
    new Promise<null>((resolve) => setTimeout(resolve, RANK_PROFILES_GRACE_MS, null)),
  ]);
  if (!profiles) return { seqRanks: [] };
  try {
    return { seqRanks: progressionRankLabels(profiles) };
  } catch {
    return { seqRanks: [] };
  }
}
