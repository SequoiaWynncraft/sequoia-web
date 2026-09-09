<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    since,
    children,
  }: {
    title: string;
    since?: string;
    children?: Snippet;
  } = $props();
</script>

<div class="deferred slot-bevel">
  <span class="deferred-title">{title}</span>
  {#if children}
    <p class="deferred-copy">{@render children()}</p>
  {/if}
  {#if since}
    <span class="deferred-since">Recording since {since}</span>
  {/if}
</div>

<style>
  .deferred {
    display: grid;
    justify-items: center;
    gap: 8px;
    padding: 40px 24px;
    border: 1px solid color-mix(in srgb, var(--color-enchant) 25%, transparent);
    background: color-mix(in srgb, var(--color-deep) 60%, transparent);
    text-align: center;
  }

  .deferred-title {
    color: var(--color-enchant);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
  }

  .deferred-copy {
    max-width: 46ch;
    margin: 0;
    color: var(--text-body);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  .deferred-since {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-tight);
    text-transform: uppercase;
  }
</style>
