<script lang="ts">
  import RankBadge, { borderColor } from "./RankBadge.svelte";
  import StatusDot from "./StatusDot.svelte";

  let {
    username,
    rank = "recruit",
    online = false,
    stats = {},
  }: {
    username: string;
    rank?: string;
    online?: boolean;
    stats?: Record<string, string>;
  } = $props();

  let hover = $state(false);
  const initial = (username || "?").charAt(0).toUpperCase();
  const entries = $derived(Object.entries(stats));
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  onmouseenter={() => hover = true}
  onmouseleave={() => hover = false}
  style="position:relative;width:200px;background:var(--color-surface);border:1px solid var(--color-border-subtle);border-left:2px solid {borderColor(rank)};border-radius:var(--radius-lg);padding:1rem;display:flex;flex-direction:column;align-items:center;transition:box-shadow var(--dur-slow) ease,transform var(--dur-slow) var(--ease-out-soft);box-shadow:{hover ? 'var(--shadow-md)' : 'none'};transform:{hover ? 'translateY(-2px)' : 'none'}"
>
  {#if online}
    <span style="position:absolute;top:0.6rem;right:0.6rem">
      <StatusDot tone="online" size={9} />
    </span>
  {/if}
  <div style="width:3.5rem;height:3.5rem;border-radius:var(--radius-md);overflow:hidden;background:var(--color-deep);display:flex;align-items:center;justify-content:center;box-shadow:var(--bevel-slot);image-rendering:pixelated">
    <span style="font-family:var(--font-display);font-size:1.5rem;color:var(--color-text-secondary)">{initial}</span>
  </div>
  <div style="font-family:var(--font-display);font-size:0.875rem;letter-spacing:0.03em;color:var(--color-text-primary);margin-top:0.6rem;text-align:center">
    {username}
  </div>
  <span style="margin-top:0.35rem"><RankBadge {rank} /></span>
  {#if entries.length > 0}
    <div style="width:100%;margin-top:0.85rem;display:flex;flex-direction:column;gap:0.2rem">
      {#each entries as [k, v]}
        <div style="display:flex;justify-content:space-between;font-size:0.75rem">
          <span style="color:var(--color-text-dim)">{k}</span>
          <span style="color:var(--color-text-secondary);font-family:var(--font-mono);font-size:0.7rem">{v}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
