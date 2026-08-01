export type BadgeType = "WTP" | "NOL" | "INSIGNIA";
export type BadgeTier = "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

export interface HonourBadge {
  playerUuid: string;
  type: BadgeType;
  tier: BadgeTier;
  assetUrl: string;
}

/** What a member has earned, distilled from their rank profile for display. */
export interface PlayerHonours {
  /** Org rank label (Leafkin → Treant, Yggdrasil); null for allies and unranked members. */
  rank: string | null;
  /** Primary color of the authoritative Discord rank role, when configured. */
  rankColor: string | null;
  /** The single held insignia grade, or null. */
  insignia: { tier: BadgeTier; assetUrl: string | null } | null;
  /** Org leadership label (The Root, Branchmaster, ...); null when none or same as rank. */
  leadership: string | null;
  /** Short branch names, trainee-marked ("Development (trainee)"). */
  branches: string[];
  /** War honours held, highest tier first. */
  warHonours: { tier: BadgeTier }[];
  /** Accumulated event badges (WTP, NOL, …). */
  badges: HonourBadge[];
}

export const EMPTY_HONOURS: PlayerHonours = {
  rank: null,
  rankColor: null,
  insignia: null,
  leadership: null,
  branches: [],
  warHonours: [],
  badges: [],
};
