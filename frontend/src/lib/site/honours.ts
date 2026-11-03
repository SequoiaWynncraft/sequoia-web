export type BadgeType = "WTP" | "NOL" | "INSIGNIA";
export type BadgeTier = "BRONZE" | "SILVER" | "GOLD" | "DIAMOND";

const INSIGNIA_LABELS: Record<BadgeTier, string> = {
  BRONZE: "Bronze Insignia",
  SILVER: "Silver Insignia",
  GOLD: "Gold Insignia",
  DIAMOND: "Diamond Insignia",
};

export function insigniaLabel(tier: BadgeTier): string {
  return INSIGNIA_LABELS[tier];
}

export interface HonourBadge {
  playerUuid: string;
  type: BadgeType;
  tier: BadgeTier;
  assetUrl: string;
}

export interface PlayerHonours {
  /** Org rank label (Leafkin → Treant, Yggdrasil); null for allies and unranked members. */
  rank: string | null;
  /** Primary color of the authoritative Discord rank role, when configured. */
  rankColor: string | null;
  insignia: { tier: BadgeTier; assetUrl: string | null } | null;
  /** Org leadership label (The Root, Branchmaster, ...); null when none or same as rank. */
  leadership: string | null;
  /** Short branch names, trainee-marked ("Development (trainee)"). */
  branches: string[];
  /** War honours held, highest tier first. */
  warHonours: { tier: BadgeTier }[];
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
