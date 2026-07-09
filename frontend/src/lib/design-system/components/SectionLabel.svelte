<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    children,
    meta,
    actions,
  }: {
    children: Snippet;
    meta?: string;
    actions?: Snippet;
  } = $props();
</script>

<div class="section-label">
  <h2 class="section-label-title"><span class="section-label-diamond" aria-hidden="true">◆</span>{@render children()}</h2>
  {#if meta}<span class="section-label-meta">{meta}</span>{/if}
  {#if actions}<div class="section-label-actions">{@render actions()}</div>{/if}
</div>

<style>
  .section-label {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin: 0 0 14px;
  }

  .section-label-title {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .section-label-diamond {
    margin-right: 8px;
    color: var(--color-gold);
    font-size: 0.8em;
  }

  .section-label-meta {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  .section-label-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 10px;
  }
</style>
