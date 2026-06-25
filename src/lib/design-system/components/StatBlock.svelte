<script lang="ts">
  import type { Snippet } from "svelte";

  let { icon, value, label }: { icon?: Snippet; value: string; label: string } = $props();
</script>

<div style="text-align:center">
  {#if icon}
    <div style="width:2.5rem;height:2.5rem;margin:0 auto 0.75rem;border-radius:var(--radius-md);background:var(--color-surface);display:flex;align-items:center;justify-content:center;color:rgba(245,197,66,0.7)">
      {@render icon()}
    </div>
  {/if}
  <div style="font-family:var(--font-display);font-size:clamp(1.75rem,4vw,2.5rem);color:var(--color-text-primary);margin-bottom:0.25rem;line-height:1">
    {value}
  </div>
  <div style="font-family:var(--font-display);font-size:0.7rem;letter-spacing:0.15em;text-transform:uppercase;color:var(--color-text-secondary)">
    {label}
  </div>
</div>
