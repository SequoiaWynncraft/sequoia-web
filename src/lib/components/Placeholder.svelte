<script lang="ts">
  import type { Snippet } from "svelte";
  let { children }: { children?: Snippet } = $props();
</script>

<div style="position:relative;border:1px dashed var(--color-border-accent);border-radius:var(--radius-lg);background:var(--color-surface);padding:3rem 1.5rem;text-align:center;color:var(--color-text-dim)">
  <div style="font-family:var(--font-display);font-size:0.75rem;letter-spacing:0.16em;text-transform:uppercase;color:var(--color-text-secondary)">
    {#if children}{@render children()}{:else}Placeholder{/if}
  </div>
  <p style="margin:0.75rem auto 0;max-width:32rem;font-size:0.9rem;line-height:1.6;color:var(--color-text-dim)">
    This section is part of the site structure. Content will be added here.
  </p>
</div>
