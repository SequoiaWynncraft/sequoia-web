<script lang="ts" module>
  const RANKS: Record<string, { bg: string; fg: string }> = {
    owner: { bg: "rgba(245,197,66,0.2)", fg: "var(--color-gold)" },
    chief: { bg: "rgba(168,85,247,0.2)", fg: "var(--color-enchant)" },
    strategist: { bg: "rgba(92,232,228,0.2)", fg: "var(--color-diamond)" },
    captain: { bg: "rgba(74,108,230,0.2)", fg: "var(--color-lapis)" },
    recruiter: { bg: "rgba(80,200,120,0.2)", fg: "var(--color-emerald)" },
    recruit: { bg: "var(--color-border-subtle)", fg: "var(--color-text-dim)" },
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
  const r = RANKS[rank] ?? RANKS.recruit;
</script>

<span style="display:inline-block;font-family:var(--font-display);font-size:0.7rem;letter-spacing:0.1em;text-transform:uppercase;padding:0.15rem 0.5rem;border-radius:var(--radius-sm);background:{r.bg};color:{r.fg};line-height:1.5">
  {rank}
</span>
