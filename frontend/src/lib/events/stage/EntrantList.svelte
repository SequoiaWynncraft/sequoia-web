<script lang="ts">
  import PlayerName from "$lib/design-system/components/PlayerName.svelte";
  import type { StageEntrant } from "$lib/events/stageProtocol";

  let { entrants }: { entrants: StageEntrant[] } = $props();

  const total = $derived(entrants.reduce((sum, entrant) => sum + entrant.tickets, 0));
  const sorted = $derived(
    [...entrants].sort(
      (left, right) => right.tickets - left.tickets || left.username.localeCompare(right.username),
    ),
  );
</script>

<div class="entrants">
  <p class="entrants-meta">
    {entrants.length}
    {entrants.length === 1 ? "entrant" : "entrants"} · {total}
    {total === 1 ? "ticket" : "tickets"}
  </p>
  <ul class="entrants-list">
    {#each sorted as entrant (entrant.player_uuid)}
      <li class="entrants-row">
        <PlayerName username={entrant.username} uuid={entrant.player_uuid} size={20} />
        <span class="entrants-tickets">{entrant.tickets}</span>
      </li>
    {/each}
  </ul>
</div>

<style>
  .entrants {
    display: grid;
    gap: 10px;
    align-content: start;
    min-height: 0;
  }

  .entrants-meta {
    margin: 0;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .entrants-list {
    display: grid;
    margin: 0;
    padding: 0;
    max-height: min(52vh, 560px);
    overflow-y: auto;
    list-style: none;
    border-top: 1px solid var(--color-border-subtle);
  }

  .entrants-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 7px 6px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .entrants-row :global(.pn) {
    flex: 1 1 auto;
    font-size: var(--text-sm);
  }

  .entrants-tickets {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
  }
</style>
