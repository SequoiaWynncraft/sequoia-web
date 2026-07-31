/**
 * The single rank -> color vocabulary. Wynncraft guild ranks and the
 * Sequoia progression ladder share one palette through the same in-game
 * equivalences the rank profiles use (leafkin=recruit ... yggdrasil=owner),
 * so one member's rank never renders in two colors on two pages.
 */
const RANK_COLORS: Record<string, string> = {
  // Wynncraft guild ladder
  owner: "var(--color-gold)",
  chief: "var(--color-enchant)",
  strategist: "var(--color-diamond)",
  captain: "var(--color-lapis)",
  recruiter: "var(--color-emerald)",
  recruit: "var(--color-text-dim)",
  // Sequoia progression ladder, same equivalence order top-down
  yggdrasil: "var(--color-gold)",
  treant: "var(--color-enchant)",
  druid: "var(--color-xp)",
  dryad: "var(--color-diamond)",
  sprite: "var(--color-lapis)",
  sapling: "var(--color-emerald)",
  leafkin: "var(--color-text-dim)",
};

/** Null when the rank is unknown - callers keep their neutral styling. */
export function rankColor(rank: string | null | undefined): string | null {
  if (!rank) return null;
  return RANK_COLORS[rank.trim().toLowerCase()] ?? null;
}

/** Insignia/badge tier colors (playercard honours, event badges). */
const TIER_COLORS: Record<string, string> = {
  DIAMOND: "var(--color-diamond)",
  GOLD: "var(--color-gold)",
  SILVER: "#aeb4c4",
  BRONZE: "#c2894f",
};

export function tierColor(tier: string | null | undefined): string {
  return (tier ? TIER_COLORS[tier] : undefined) ?? "var(--text-muted)";
}
