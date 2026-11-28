const RANK_COLORS: Record<string, string> = {
  owner: "var(--color-gold)",
  chief: "var(--color-enchant)",
  strategist: "var(--color-diamond)",
  captain: "var(--color-lapis)",
  recruiter: "var(--color-emerald)",
  recruit: "var(--color-text-dim)",
  yggdrasil: "var(--color-gold)",
  treant: "var(--color-enchant)",
  druid: "var(--color-xp)",
  dryad: "var(--color-diamond)",
  sprite: "var(--color-lapis)",
  sapling: "var(--color-emerald)",
  leafkin: "var(--color-text-dim)",
};

export function rankColor(rank: string | null | undefined): string | null {
  if (!rank) return null;
  return RANK_COLORS[rank.trim().toLowerCase()] ?? null;
}

const TIER_COLORS: Record<string, string> = {
  DIAMOND: "var(--color-diamond)",
  GOLD: "var(--color-gold)",
  SILVER: "#aeb4c4",
  BRONZE: "#c2894f",
};

export function tierColor(tier: string | null | undefined): string {
  return (tier ? TIER_COLORS[tier] : undefined) ?? "var(--text-muted)";
}
