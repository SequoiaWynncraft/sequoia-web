<script lang="ts">
  import type { Snippet } from "svelte";
  import type { EventTheme } from "../types";
  import { themeVars } from "../theme";

  let {
    theme,
    slug,
    variant = "band",
    dim = false,
    children,
  }: {
    theme: EventTheme;
    /** Keys the hub-band to event-hero morph; must be unique per view. */
    slug: string;
    variant?: "band" | "hero";
    /** Ended events keep their sky but let it fade. */
    dim?: boolean;
    children: Snippet;
  } = $props();

  const style = $derived(`${themeVars(theme)};view-transition-name:ev-sky-${slug}`);
</script>

<div class="ev-sky ev-sky-{variant}" class:ev-sky-dim={dim} {style}>
  <div class="ev-sky-backdrop" aria-hidden="true"></div>
  <div class="ev-sky-content">
    {@render children()}
  </div>
</div>

<style>
  .ev-sky {
    position: relative;
    overflow: hidden;
    isolation: isolate;
  }

  .ev-sky-band {
    border: 1px solid var(--color-border-subtle);
    transition: border-color var(--dur-fast) ease;
  }

  .ev-sky-backdrop {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(172deg, var(--ev-sky-0), var(--ev-sky-1));
  }

  /* Star specks stay faint - atmosphere, not confetti. The slight rotation
     keeps the tiled pattern from ever reading as aligned rows. */
  .ev-sky-backdrop::before {
    content: "";
    position: absolute;
    inset: -30%;
    background:
      radial-gradient(circle, var(--ev-star) 1px, transparent 1.5px) 24px 41px / 233px 141px,
      radial-gradient(circle, var(--ev-star) 0.8px, transparent 1.3px) 131px 87px / 337px 97px,
      radial-gradient(circle, var(--ev-star) 0.6px, transparent 1.1px) 61px 13px / 149px 113px,
      radial-gradient(circle, var(--ev-star) 0.6px, transparent 1.1px) 7px 51px / 191px 73px;
    opacity: 0.75;
    transform: rotate(-4deg);
  }

  .ev-sky-band .ev-sky-backdrop::before {
    opacity: 0.55;
  }

  .ev-sky-hero .ev-sky-backdrop::after {
    content: "";
    position: absolute;
    inset: 0;
    background:
      radial-gradient(60% 90% at 50% 110%, color-mix(in srgb, var(--ev-accent) 14%, transparent), transparent 70%),
      linear-gradient(to bottom, transparent 55%, var(--bg-page));
  }

  .ev-sky-dim .ev-sky-backdrop {
    opacity: 0.45;
  }

  .ev-sky-content {
    position: relative;
  }
</style>
