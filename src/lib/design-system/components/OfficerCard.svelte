<script lang="ts">
  import RankBadge, { borderColor } from "./RankBadge.svelte";
  import StatusDot from "./StatusDot.svelte";

  let {
    username,
    rank = "recruit",
    online = false,
    avatarUrl,
    stats = {},
  }: {
    username: string;
    rank?: string;
    online?: boolean;
    avatarUrl?: string;
    stats?: Record<string, string>;
  } = $props();

  let avatarFailed = $state(false);
  const initial = $derived((username || "?").charAt(0).toUpperCase());
  const entries = $derived(Object.entries(stats));
</script>

<div
  class="seq-officer-card"
  style="--seq-officer-border:{borderColor(rank)}"
>
  {#if online}
    <span class="seq-officer-status">
      <StatusDot tone="online" size={9} />
    </span>
  {/if}
  <div class="seq-officer-avatar">
    {#if avatarUrl && !avatarFailed}
      <img
        src={avatarUrl}
        alt=""
        aria-hidden="true"
        loading="lazy"
        decoding="async"
        class="seq-officer-avatar-image"
        onerror={() => avatarFailed = true}
      />
    {:else}
      <span class="seq-officer-initial">{initial}</span>
    {/if}
  </div>
  <div class="seq-officer-name">
    {username}
  </div>
  <span class="seq-officer-rank"><RankBadge {rank} /></span>
  {#if entries.length > 0}
    <div class="seq-officer-stats">
      {#each entries as [k, v]}
        <div class="seq-officer-stat-row">
          <span class="seq-officer-stat-key">{k}</span>
          <span class="seq-officer-stat-value">{v}</span>
        </div>
      {/each}
    </div>
  {/if}
</div>
