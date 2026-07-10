import type { BadgeEntry } from "$lib/api/client";

/** What a member has earned, distilled from their rank profile for display. */
export interface PlayerHonours {
  /** Org rank label (Leafkin → Treant, Yggdrasil); null for allies and unranked members. */
  rank: string | null;
  /** The single held insignia grade, or null. */
  insignia: { tier: BadgeEntry["tier"]; assetUrl: string | null } | null;
  /** War honours held, highest tier first. */
  warHonours: { tier: BadgeEntry["tier"] }[];
  /** Accumulated event badges (WTP, NOL, …). */
  badges: BadgeEntry[];
}

export const EMPTY_HONOURS: PlayerHonours = {
  rank: null,
  insignia: null,
  warHonours: [],
  badges: [],
};
