<script lang="ts">
  import type { EventStatus, GuildEvent } from "../types";
  import { formatWindow } from "../format";

  let {
    event,
    status,
    align = "start",
    showStatus = true,
  }: {
    event: GuildEvent;
    status: EventStatus;
    align?: "start" | "center" | "end";
    /** Hub shelves already group by status - the chip would repeat them. */
    showStatus?: boolean;
  } = $props();

  const STATUS_LABELS: Record<EventStatus, string> = {
    tba: "Dates TBA",
    upcoming: "Upcoming",
    live: "Live",
    ended: "Ended",
  };

  const window = $derived(formatWindow(event));
</script>

<div class="ev-meta" style="justify-content:{align === 'center' ? 'center' : align === 'end' ? 'flex-end' : 'flex-start'}">
  {#if showStatus || status === "tba"}
    <span class="ev-chip ev-chip-{status}">{STATUS_LABELS[status]}</span>
  {/if}
  {#if event.access === "members"}
    <span class="ev-chip ev-chip-members">Members</span>
  {/if}
  {#if window}
    <span class="ev-window">{window}</span>
  {/if}
</div>

<style>
  .ev-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }

  .ev-chip {
    padding: 4px 9px 3px;
    border: 1px solid var(--color-border-accent);
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .ev-chip-live {
    border-color: color-mix(in srgb, var(--ev-accent, var(--color-gold)) 55%, transparent);
    color: var(--ev-accent, var(--color-gold));
  }

  .ev-chip-ended,
  .ev-chip-tba {
    color: var(--text-muted);
    border-color: var(--color-border-subtle);
  }

  .ev-chip-members {
    border-color: color-mix(in srgb, var(--color-gold) 35%, transparent);
    color: var(--color-gold);
  }

  .ev-window {
    margin-left: 4px;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }
</style>
