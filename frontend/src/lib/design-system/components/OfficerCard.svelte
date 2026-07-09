<script lang="ts">
  import RankBadge, { borderColor } from "./RankBadge.svelte";
  import StatusDot from "./StatusDot.svelte";

  let {
    username,
    rank = "recruit",
    online = false,
    avatarUrl,
    avatarLoading = "eager",
    stats = {},
  }: {
    username: string;
    rank?: string;
    online?: boolean;
    avatarUrl?: string;
    avatarLoading?: "eager" | "lazy";
    stats?: Record<string, string>;
  } = $props();

  let avatarFailed = $state(false);
  const initial = $derived((username || "?").charAt(0).toUpperCase());
  const entries = $derived(Object.entries(stats));
</script>

<div
  class="seq-officer-card"
  data-officer-card="true"
  style="--seq-officer-border:{borderColor(rank)}"
>
  {#if online}
    <span class="seq-officer-status" title={`${username} is online`} aria-label={`${username} is online`}>
      <StatusDot tone="online" size={9} />
    </span>
  {/if}
  <div class="seq-officer-main">
    <div class="seq-officer-avatar" class:seq-officer-avatar--image={avatarUrl && !avatarFailed}>
      {#if avatarUrl && !avatarFailed}
        <img
          src={avatarUrl}
          alt=""
          aria-hidden="true"
          loading={avatarLoading}
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
  </div>
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
