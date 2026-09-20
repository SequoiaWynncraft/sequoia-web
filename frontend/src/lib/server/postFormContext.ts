import { getLinkedRankProfiles, progressionRankLabels } from "./rankProfiles";

/** Optional rank choices must not hold the editor behind the rank API timeout. */
const RANK_PROFILES_GRACE_MS = 500;

export interface PostFormContext {
  /** Org ladder labels for the audience picker, most senior first. */
  seqRanks: string[];
}

/** Picker data for the post editor - lookup helpers, not authorization. */
export async function postFormContext(fetchImpl: typeof fetch): Promise<PostFormContext> {
  const profiles = await Promise.race([
    getLinkedRankProfiles(fetchImpl).catch(() => null),
    new Promise<null>((resolve) => setTimeout(resolve, RANK_PROFILES_GRACE_MS, null)),
  ]);
  if (!profiles) return { seqRanks: [] };
  // A keyless catalog role throws out of `progressionRankLabels`; the picker
  // is optional, so a skewed snapshot loses the list rather than the editor.
  try {
    return { seqRanks: progressionRankLabels(profiles) };
  } catch {
    return { seqRanks: [] };
  }
}
