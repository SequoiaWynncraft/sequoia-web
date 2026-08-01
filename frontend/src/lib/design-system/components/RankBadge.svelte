<script lang="ts" module>
  import { rankColor } from "$lib/site/rankColors";

  // Backgrounds are badge-local; foregrounds come from the shared rank
  // vocabulary so a rank never renders two colors on two pages.
  const RANK_BACKGROUNDS: Record<string, string> = {
    owner: "rgba(245,197,66,0.2)",
    chief: "rgba(168,85,247,0.2)",
    strategist: "rgba(92,232,228,0.2)",
    captain: "rgba(74,108,230,0.2)",
    recruiter: "rgba(80,200,120,0.2)",
    recruit: "var(--color-border-subtle)",
  };

  const BORDER_COLORS: Record<string, string> = {
    owner: "rgba(245,197,66,0.5)",
    chief: "rgba(168,85,247,0.4)",
    strategist: "rgba(92,232,228,0.4)",
    captain: "rgba(74,108,230,0.4)",
    recruiter: "rgba(80,200,120,0.3)",
    recruit: "rgba(40,44,62,0.6)",
  };

  export function borderColor(rank: string): string {
    return BORDER_COLORS[rank] ?? "rgba(40,44,62,0.6)";
  }
</script>

<script lang="ts">
  let { rank = "recruit" }: { rank?: string } = $props();
  const bg = $derived(RANK_BACKGROUNDS[rank] ?? RANK_BACKGROUNDS.recruit);
  const fg = $derived(rankColor(rank) ?? "var(--color-text-dim)");
</script>

<span style="display:inline-block;font-family:var(--font-display);font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;padding:0.15rem 0.5rem;border-radius:var(--radius-sm);background:{bg};color:{fg};line-height:1.5">
  {rank}
</span>
