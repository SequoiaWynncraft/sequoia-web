<script lang="ts">
  import Button from "#lib/design-system/components/Button.svelte";
  import SectionLabel from "#lib/design-system/components/SectionLabel.svelte";
  import { formatWindow } from "#lib/events/format.js";
  import { raidIconUrl } from "#lib/events/raidIcons.js";
  import type { EventStatus } from "#lib/events/types.js";
  import ManageHeader from "#lib/manage/ManageHeader.svelte";
  import AreaGate from "#lib/manage/AreaGate.svelte";

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
  <ManageHeader area="Events" title="Events" />

  {#if data.access !== "granted"}
    <AreaGate area="events" access={data.access} returnTo="/manage/events" />
  {:else if data.entries}
    {#if data.auditWarning}
      <p class="mg-audit-warning" role="alert">
        The deletion succeeded but was not recorded in the audit log.
      </p>
    {/if}
    <SectionLabel meta={String(data.entries.length)}>
      {#snippet children()}All events{/snippet}
      {#snippet actions()}
        <Button size="sm" href="/manage/events/new">New event</Button>
      {/snippet}
    </SectionLabel>

    <ul class="mg-list">
      {#each data.entries as entry (entry.event.slug)}
        <li>
          <a class="mg-row focus-ring" href={`/manage/events/${entry.event.slug}`}>
            <span
              class="mg-swatch"
              aria-hidden="true"
              style="background: linear-gradient(160deg, {entry.event.theme.sky[0]}, {entry.event
                .theme.sky[1]}); border-color: {entry.event.theme.accent}"
            ></span>
            {#if entry.event.icon?.placements.includes("manage")}
              <img
                class="mg-row-icon"
                src={raidIconUrl(entry.event.icon.file)}
                alt=""
                loading="lazy"
              />
            {/if}
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
    padding-bottom: 48px;
  }

  .mg-audit-warning {
    margin: 0 0 18px;
    color: var(--status-error);
    font-size: var(--text-sm);
  }

  .mg-list {
    display: grid;
    margin: 0;
    padding: 0;
    list-style: none;
    border-top: 1px solid var(--color-border-subtle);
  }

  .mg-row {
    display: flex;
    align-items: center;
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
    flex: 0 0 34px;
    width: 34px;
    height: 22px;
    border: 1px solid;
  }

  .mg-row-icon {
    width: 24px;
    height: 24px;
    image-rendering: pixelated;
  }

  .mg-name {
    flex: 1 1 auto;
    min-width: 0;
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
    border: 1px solid color-mix(in srgb, var(--color-gold) 35%, transparent);
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
    .mg-row {
      grid-template-columns: auto minmax(0, 1fr) auto;
    }

    .mg-status,
    .mg-window {
      display: none;
    }
  }
</style>
