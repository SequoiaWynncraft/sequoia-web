<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    title,
    meta,
    flush = false,
    children,
    actions,
  }: {
    title: string;
    meta?: string;
    /** Remove body padding — for tables that manage their own gutters. */
    flush?: boolean;
    children: Snippet;
    actions?: Snippet;
  } = $props();
</script>

<section class="panel">
  <header class="panel-head">
    <h2 class="panel-title"><span class="panel-bullet" aria-hidden="true">◆</span>{title}</h2>
    {#if meta}<span class="panel-meta">{meta}</span>{/if}
    {#if actions}<div class="panel-actions">{@render actions()}</div>{/if}
  </header>
  <div class="panel-body" class:panel-body-flush={flush}>
    {@render children()}
  </div>
</section>

<style>
  .panel {
    border: 1px solid var(--color-border-subtle);
    background: rgba(26, 29, 42, 0.74);
  }

  .panel-head {
    display: flex;
    align-items: center;
    gap: 12px;
    min-height: 46px;
    padding: 0 16px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .panel-title {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .panel-bullet {
    margin-right: 8px;
    color: var(--color-gold);
    font-size: 0.65em;
    vertical-align: 2px;
  }

  .panel-meta {
    margin-left: auto;
    color: var(--text-muted);
    font-family: var(--font-mono);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-tight);
  }

  .panel-actions {
    margin-left: auto;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .panel-meta + .panel-actions {
    margin-left: 12px;
  }

  .panel-body {
    padding: 16px;
  }

  .panel-body-flush {
    padding: 0;
  }
</style>
