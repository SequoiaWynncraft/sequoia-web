<script lang="ts">
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Button from "$lib/design-system/components/Button.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import { formatWindow } from "$lib/events/format";
  import type { EventStatus } from "$lib/events/types";
  import ManageGate from "./ManageGate.svelte";

  let { data } = $props();

  const STATUS_LABELS: Record<EventStatus, string> = {
    tba: "Dates TBA",
    upcoming: "Upcoming",
    live: "Live",
    ended: "Ended",
  };
</script>

<svelte:head>
  <title>Manage events - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<div class="mg-page">
  <PageHeader kicker="Events" title="Manage" />

  {#if data.access !== "manager"}
    <ManageGate access={data.access} returnTo="/events/manage" />
  {:else if data.entries}
    <SectionLabel meta={String(data.entries.length)}>
      {#snippet children()}All events{/snippet}
      {#snippet actions()}
        <Button size="sm" variant="ghost" href="/events/manage/audit">Audit log</Button>
        <Button size="sm" href="/events/manage/new">New event</Button>
      {/snippet}
    </SectionLabel>

    <ul class="mg-list">
      {#each data.entries as entry (entry.event.slug)}
        <li>
          <a class="mg-row focus-ring" href={`/events/manage/${entry.event.slug}`}>
            <span
              class="mg-swatch"
              aria-hidden="true"
              style="background: linear-gradient(160deg, {entry.event.theme.sky[0]}, {entry.event
                .theme.sky[1]}); border-color: {entry.event.theme.accent}"
            ></span>
            <span class="mg-name">{entry.event.name}</span>
            <span class="mg-chips">
              {#if !entry.published}<span class="mg-chip mg-chip-draft">Draft</span>{/if}
              {#if entry.event.access === "members"}<span class="mg-chip">Members</span>{/if}
            </span>
            <span class="mg-status" class:mg-status-live={entry.status === "live"}>
              {STATUS_LABELS[entry.status]}
            </span>
            <span class="mg-window">{formatWindow(entry.event) ?? "-"}</span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .mg-page {
    width: min(940px, 100% - 3rem);
    margin: 0 auto;
    padding-bottom: 48px;
  }

  .mg-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--color-border-subtle);
  }

  .mg-row {
    display: grid;
    grid-template-columns: auto minmax(0, 1fr) auto auto auto;
    align-items: center;
    gap: 16px;
    padding: 14px 10px;
    border-bottom: 1px solid var(--color-border-subtle);
    text-decoration: none;
    transition: background var(--dur-fast) ease;
  }

  .mg-row:hover {
    background: color-mix(in srgb, var(--color-gold) 4%, transparent);
  }

  .mg-swatch {
    width: 34px;
    height: 22px;
    border: 1px solid;
  }

  .mg-name {
    overflow: hidden;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wide);
    text-overflow: ellipsis;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .mg-chips {
    display: flex;
    gap: 6px;
  }

  .mg-chip {
    padding: 3px 8px 2px;
    border: 1px solid rgba(245, 197, 66, 0.35);
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .mg-chip-draft {
    border-color: var(--color-border-accent);
    color: var(--text-muted);
  }

  .mg-status {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .mg-status-live {
    color: var(--color-gold);
  }

  .mg-window {
    min-width: 110px;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    text-align: right;
    white-space: nowrap;
  }

  @media (max-width: 640px) {
    .mg-page {
      width: min(940px, 100% - 2rem);
    }

    .mg-row {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .mg-status,
    .mg-window {
      display: none;
    }
  }
</style>
