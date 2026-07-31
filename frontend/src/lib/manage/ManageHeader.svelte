<script lang="ts">
  import type { Snippet } from "svelte";

  let {
    area,
    title,
    lead,
    actions,
  }: {
    /** The console area name, e.g. "Events". */
    area: string;
    title: string;
    lead?: string;
    actions?: Snippet;
  } = $props();
</script>

<header class="manage-header">
  <div class="manage-header-text">
    <span class="manage-header-kicker">Manage · {area}</span>
    <h1 class="manage-header-title">{title}</h1>
    {#if lead}<p class="manage-header-lead">{lead}</p>{/if}
  </div>
  {#if actions}<div class="manage-header-actions">{@render actions()}</div>{/if}
</header>

<style>
  .manage-header {
    display: flex;
    flex-wrap: wrap;
    align-items: end;
    justify-content: space-between;
    gap: 14px;
    margin: 26px 0 30px;
  }

  .manage-header-text {
    display: grid;
    gap: 8px;
  }

  .manage-header-kicker {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
  }

  .manage-header-title {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xl);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    text-transform: uppercase;
  }

  .manage-header-lead {
    margin: 0;
    max-width: 60ch;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .manage-header-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
  }
</style>
