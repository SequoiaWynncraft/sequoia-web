<script lang="ts">
  import type { Snippet } from "svelte";
  import type { EventTheme } from "../types";
  import { themeVars } from "../theme";

  let {
    theme,
    dim = false,
    children,
  }: {
    theme: EventTheme;
    dim?: boolean;
    children: Snippet;
  } = $props();

  const style = $derived(themeVars(theme));
</script>

<div class="ev-sky" class:ev-sky-dim={dim} {style}>
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
    border: 1px solid var(--color-border-subtle);
    transition: border-color var(--dur-fast) ease;
  }

  .ev-sky-backdrop {
    position: absolute;
    inset: 0;
    z-index: -1;
    background: linear-gradient(172deg, var(--ev-sky-0), var(--ev-sky-1));
  }

  .ev-sky-backdrop::before {
    content: "";
    position: absolute;
    inset: -30%;
    background:
      radial-gradient(circle, var(--ev-star) 1px, transparent 1.5px) 24px 41px / 233px 141px,
      radial-gradient(circle, var(--ev-star) 0.8px, transparent 1.3px) 131px 87px / 337px 97px,
      radial-gradient(circle, var(--ev-star) 0.6px, transparent 1.1px) 61px 13px / 149px 113px,
      radial-gradient(circle, var(--ev-star) 0.6px, transparent 1.1px) 7px 51px / 191px 73px;
    opacity: 0.55;
    transform: rotate(-4deg);
  }

  .ev-sky-dim .ev-sky-backdrop {
    opacity: 0.45;
  }

  .ev-sky-content {
    position: relative;
  }
</style>
