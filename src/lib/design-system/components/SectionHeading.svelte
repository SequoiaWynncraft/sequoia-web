<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    kicker,
    align = "center",
    gradient = "gold",
    style = "",
  }: {
    children: Snippet;
    kicker?: string;
    align?: string;
    gradient?: "gold" | "enchant" | "diamond" | "none";
    style?: string;
  } = $props();

  const gradClass = $derived(
    gradient === "enchant" ? "text-enchant-gradient" : gradient === "diamond" ? "text-diamond-gradient" : gradient === "none" ? "" : "text-gold-gradient"
  );
</script>

<div style="text-align:{align};{style}">
  {#if kicker}
    <div style="font-family:var(--font-display);font-size:0.7rem;letter-spacing:0.18em;text-transform:uppercase;color:var(--color-text-dim);margin-bottom:0.6rem">
      {kicker}
    </div>
  {/if}
  <h2
    class={gradClass}
    style="font-family:var(--font-display);font-size:clamp(1.75rem,4vw,2rem);letter-spacing:0.06em;margin:0;{gradient === 'none' ? 'color:var(--color-text-primary)' : ''}"
  >
    {@render children()}
  </h2>
</div>
