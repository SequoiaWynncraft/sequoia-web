<script lang="ts" module>
  import { rankColor as sharedRankColor } from "$lib/site/rankColors";

  // Backgrounds are badge-local; foregrounds come from the shared rank
  // vocabulary so a rank never renders two colors on two pages.
  const RANK_BACKGROUNDS: Record<string, string> = {
    owner: "color-mix(in srgb, var(--color-gold) 20%, transparent)",
    chief: "color-mix(in srgb, var(--color-enchant) 20%, transparent)",
    strategist: "color-mix(in srgb, var(--color-diamond) 20%, transparent)",
    captain: "color-mix(in srgb, var(--color-lapis) 20%, transparent)",
    recruiter: "color-mix(in srgb, var(--color-emerald) 20%, transparent)",
    recruit: "var(--color-border-subtle)",
  };

  const BORDER_COLORS: Record<string, string> = {
    owner: "color-mix(in srgb, var(--color-gold) 50%, transparent)",
    chief: "color-mix(in srgb, var(--color-enchant) 40%, transparent)",
    strategist: "color-mix(in srgb, var(--color-diamond) 40%, transparent)",
    captain: "color-mix(in srgb, var(--color-lapis) 40%, transparent)",
    recruiter: "color-mix(in srgb, var(--color-emerald) 30%, transparent)",
    recruit: "color-mix(in srgb, var(--color-border-subtle) 60%, transparent)",
  };

  export function borderColor(rank: string): string {
    return BORDER_COLORS[rank] ?? "color-mix(in srgb, var(--color-border-subtle) 60%, transparent)";
  }
</script>

<script lang="ts">
  let { rank = "recruit", color = null }: { rank?: string; color?: string | null } = $props();
  const roleColor = $derived(color && /^#[0-9a-f]{6}$/i.test(color) ? color : null);
  const bg = $derived(
    roleColor
      ? `color-mix(in srgb, ${roleColor} 20%, transparent)`
      : (RANK_BACKGROUNDS[rank] ?? RANK_BACKGROUNDS.recruit),
  );
  const fg = $derived(roleColor ?? sharedRankColor(rank) ?? "var(--color-text-dim)");
</script>

<span style="display:inline-block;font-family:var(--font-display);font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;padding:0.15rem 0.5rem;border-radius:var(--radius-sm);background:{bg};color:{fg};line-height:1.5">
  {rank}
</span>
