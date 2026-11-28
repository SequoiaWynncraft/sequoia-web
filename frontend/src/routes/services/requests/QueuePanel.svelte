<script lang="ts">
  import PlayerName from "#lib/design-system/components/PlayerName.svelte";
  import RankBadge from "#lib/design-system/components/RankBadge.svelte";
  import { entriesAhead, queueStanding, requestedAgoLabel, type RewardQueueEntry } from "#lib/rewardQueue.js";

  let {
    title,
    entries,
    now,
  }: {
    title: string;
    entries: RewardQueueEntry[];
    now: number;
  } = $props();

  const standing = $derived(queueStanding(entries));
  const ahead = $derived(entriesAhead(entries));

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
      <ol class="qp-list">
        {#each ahead as entry, index (entry.requestId)}
          <li class="qp-row">
            <span class="qp-rank" aria-hidden="true">{index + 1}</span>
            <PlayerName username={entry.minecraftUsername} />
            {#if entry.guildRank}
              <RankBadge rank={entry.guildRank.toLowerCase()} />
            {/if}
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
