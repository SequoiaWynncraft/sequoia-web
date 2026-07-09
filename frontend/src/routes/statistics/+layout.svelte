<script lang="ts">
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import { SECTIONS } from "$lib/site/nav";

  let { data, children }: { data: { shell: { online_now: number; members_total: number } | null }; children: Snippet } = $props();

  const statistics = SECTIONS.find((section) => section.to === "/statistics");
  const groups = statistics?.groups ?? [];

  const path = $derived(page.url.pathname);
</script>

<div class="stats-shell">
  <aside class="stats-side" aria-label="Statistics navigation">
    <div class="stats-side-head">
      <a href="/statistics" class="stats-side-brand">Statistics</a>
      <div class="divider-gold"></div>
    </div>

    <nav class="stats-side-nav">
      <a href="/statistics" class="stats-side-link" class:stats-side-link-active={path === "/statistics"}>
        Overview
      </a>
      {#each groups as group (group.to)}
        <span class="stats-side-group"><span class="stats-side-diamond" aria-hidden="true">◆</span>{group.label}</span>
        {#each group.items as item (item.to)}
          <a href={item.to} class="stats-side-link" class:stats-side-link-active={path === item.to}>
            {item.label}
          </a>
        {/each}
      {/each}
    </nav>

    {#if data.shell}
      <div class="stats-side-foot">
        <span class="stats-side-online">{data.shell.online_now} online</span>
        <span class="stats-side-members">/ {data.shell.members_total}</span>
      </div>
    {/if}
  </aside>

  <div class="stats-content">
    {@render children()}
  </div>
</div>

<style>
  .stats-shell {
    display: grid;
    grid-template-columns: 224px minmax(0, 1fr);
    width: min(1720px, 100% - 3rem);
    margin: 0 auto;
  }

  .stats-side {
    position: sticky;
    top: 5rem;
    align-self: start;
    display: flex;
    flex-direction: column;
    max-height: calc(100vh - 6rem);
    padding: 4px 0 16px;
    border-right: 1px solid var(--color-border-subtle);
    overflow-y: auto;
  }

  .stats-side-head {
    padding: 8px 18px 0 2px;
  }

  .stats-side-brand {
    display: block;
    margin-bottom: 10px;
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
    text-decoration: none;
  }

  .stats-side-brand:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .stats-side-nav {
    display: grid;
    padding: 10px 0;
  }

  .stats-side-group {
    margin-top: 16px;
    padding: 6px 18px 6px 2px;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
  }

  .stats-side-diamond {
    margin-right: 8px;
    color: var(--color-gold);
    font-size: 0.8em;
  }

  .stats-side-link {
    padding: 8px 18px 8px 14px;
    border-left: 2px solid transparent;
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    text-decoration: none;
    transition: color var(--dur-fast) ease, background var(--dur-fast) ease, border-color var(--dur-fast) ease;
  }

  .stats-side-link:hover {
    color: var(--text-heading);
    background: rgba(245, 197, 66, 0.04);
  }

  .stats-side-link:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: -2px;
  }

  .stats-side-link-active {
    border-left-color: var(--color-gold);
    color: var(--color-gold);
    background: rgba(245, 197, 66, 0.06);
  }

  .stats-side-foot {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin-top: auto;
    padding: 18px 18px 4px 2px;
  }

  .stats-side-online {
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .stats-side-members {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  .stats-content {
    min-width: 0;
    padding: 0 0 56px 32px;
  }

  @media (max-width: 900px) {
    .stats-shell {
      grid-template-columns: 1fr;
      width: min(1720px, 100% - 2rem);
    }

    .stats-side {
      position: static;
      max-height: none;
      flex-direction: row;
      align-items: center;
      gap: 4px;
      padding: 0 0 12px;
      border-right: 0;
      border-bottom: 1px solid var(--color-border-subtle);
      overflow-x: auto;
    }

    .stats-side-head,
    .stats-side-group,
    .stats-side-foot {
      display: none;
    }

    .stats-side-nav {
      display: flex;
      gap: 4px;
      padding: 0;
    }

    .stats-side-link {
      padding: 8px 12px;
      border-left: 0;
      border-bottom: 2px solid transparent;
      white-space: nowrap;
    }

    .stats-side-link-active {
      border-bottom-color: var(--color-gold);
    }

    .stats-content {
      padding: 20px 0 48px;
    }
  }
</style>
