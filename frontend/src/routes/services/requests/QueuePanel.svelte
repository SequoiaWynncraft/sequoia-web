<script lang="ts">
  import PlayerName from "#lib/design-system/components/PlayerName.svelte";
  import RankBadge from "#lib/design-system/components/RankBadge.svelte";
  import { entriesAhead, queueStanding, requestedAgoLabel, type RewardQueueEntry } from "#lib/rewardQueue.js";

  let {
    title,
    entries,
    now,
  }: {
    /** Queue name as the reader knows it, e.g. "Aspects". */
    title: string;
    /** The whole pending queue, front first, with the viewer's own row flagged. */
    entries: RewardQueueEntry[];
    /** Render-time clock, passed in so every row on the page agrees. */
    now: number;
  } = $props();

  const standing = $derived(queueStanding(entries));
  const ahead = $derived(entriesAhead(entries));

  // One disclosure serves both readings of the same list: the people you are waiting
  // behind, or - when you aren't queued - who is waiting at all, so the count above is
  // never an unexplained number.
  //
  // The label names the list rather than the action ("2 ahead of you", not "Show the 2
  // ahead of you"): a <summary> keeps its text once the disclosure is open, and an
  // open list still offering to show itself reads as a broken control. The triangle
  // already says which way this toggles.
  const disclosureLabel = $derived(
    standing ? (ahead.length === 1 ? "The 1 ahead of you" : `The ${ahead.length} ahead of you`) : "Everyone waiting",
  );
</script>

<div class="qp">
  <h3 class="qp-title">{title}</h3>

  <div class="qp-standing">
    {#if standing}
      <span class="qp-position">#{standing.position}</span>
      <span class="qp-of">of {standing.total}</span>
    {:else}
      <span class="qp-absent">Not in queue</span>
    {/if}
  </div>

  <p class="qp-meta">
    {#if standing && standing.position === 1}
      You're next. Requested {requestedAgoLabel(standing.entry.createdAtMs, now)}.
    {:else if standing}
      Requested {requestedAgoLabel(standing.entry.createdAtMs, now)}.
    {:else if entries.length === 0}
      Nobody is waiting.
    {:else if entries.length === 1}
      1 member waiting.
    {:else}
      {entries.length} members waiting.
    {/if}
  </p>

  {#if ahead.length > 0}
    <details class="qp-details">
      <summary class="qp-summary focus-ring">{disclosureLabel}</summary>
      <!-- An ordered list, not a sortable table: the order is the whole point, so a
           column header offering to resort it would be lying about what this is. -->
      <ol class="qp-list">
        {#each ahead as entry, index (entry.requestId)}
          <li class="qp-row">
            <span class="qp-rank" aria-hidden="true">{index + 1}</span>
            <PlayerName username={entry.minecraftUsername} />
            {#if entry.guildRank}
              <RankBadge rank={entry.guildRank.toLowerCase()} />
            {/if}
            <!-- "ago" is carried in the visible text rather than hidden for screen readers:
                 an unlabelled column of durations beside a queue reads as time remaining to
                 everyone, not just to assistive tech. -->
            <span class="qp-wait">{requestedAgoLabel(entry.createdAtMs, now)}</span>
          </li>
        {/each}
      </ol>
    </details>
  {/if}
</div>

<style>
  .qp {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: baseline;
    gap: 4px var(--space-4);
    padding: var(--space-4) 0;
    border-top: 1px solid var(--color-border-subtle);
  }

  .qp-title {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .qp-standing {
    grid-row: 1 / span 2;
    grid-column: 2;
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
    justify-self: end;
  }

  /* The one live fact on the page, so it is the one place gold is spent here. */
  .qp-position {
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    line-height: var(--leading-tight);
  }

  .qp-of,
  .qp-absent {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .qp-meta {
    grid-column: 1;
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
    line-height: var(--leading-normal);
  }

  .qp-details {
    grid-column: 1 / -1;
    margin-top: var(--space-2);
  }

  .qp-summary {
    display: inline-block;
    color: var(--text-muted);
    cursor: pointer;
    font-size: var(--text-xs);
  }

  .qp-summary:hover {
    color: var(--accent-hover);
  }

  .qp-list {
    margin: var(--space-3) 0 0;
    padding: 0;
    list-style: none;
  }

  .qp-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-2) 0;
    border-top: 1px solid var(--color-border-subtle);
    font-size: var(--text-sm);
  }

  .qp-row:first-child {
    border-top: 0;
  }

  .qp-rank {
    min-width: 1.5rem;
    color: var(--text-dim);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }

  .qp-wait {
    margin-left: auto;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  @media (max-width: 30rem) {
    .qp {
      grid-template-columns: minmax(0, 1fr);
    }

    .qp-standing {
      grid-row: auto;
      grid-column: 1;
      justify-self: start;
    }
  }
</style>
