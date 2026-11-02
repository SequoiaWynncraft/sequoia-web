<script lang="ts">
  import PlayerName from "#lib/design-system/components/PlayerName.svelte";
  import { groupPrizeRows, type PrizeSlotRow } from "#lib/events/prizeBoard.js";
  import { prizeIconUrl } from "#lib/events/prizeIcons.js";

  let { rows }: { rows: PrizeSlotRow[] } = $props();

  const groups = $derived(groupPrizeRows(rows));
</script>

<!-- One card per distinct prize: art, name, xN, and the winners as they
     land. Unrolled slots collapse into a single quiet line instead of a
     row each - 26 slots must not mean 26 rows. -->
<div class="pb">
  {#each groups as group (group.key)}
    {@const won = group.slots.filter((slot) => slot.winner !== null)}
    {@const spinning = group.slots.filter((slot) => slot.spinning).length}
    {@const unrolled = group.slots.length - won.length - spinning}
    <article class="pb-card">
      <header class="pb-head">
        {#if group.icon}
          <img class="pb-art" src={prizeIconUrl(group.icon)} alt="" loading="lazy" />
        {:else}
          <span class="pb-art pb-art-spark" aria-hidden="true">✦</span>
        {/if}
        <h3 class="pb-prize">
          {group.prize || "—"}
          {#if group.slots.length > 1}<span class="pb-count">×{group.slots.length}</span>{/if}
        </h3>
      </header>
      {#if won.length > 0}
        <ul class="pb-winners">
          {#each won as slot (slot.key)}
            <li class="pb-winner">
              <PlayerName username={slot.winner!.username} uuid={slot.winner!.uuid} size={20} />
            </li>
          {/each}
        </ul>
      {/if}
      {#if spinning > 0}
        <p class="pb-note pb-note-rolling">Rolling…</p>
      {:else if unrolled > 0}
        <p class="pb-note">{won.length > 0 ? `${unrolled} more to roll` : "Not rolled"}</p>
      {/if}
    </article>
  {/each}
</div>

<style>
  .pb {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(230px, 1fr));
    gap: 12px;
  }

  .pb-card {
    display: grid;
    gap: 8px;
    align-content: start;
    padding: 12px 14px;
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-surface) 55%, transparent);
  }

  .pb-head {
    display: flex;
    gap: 10px;
    align-items: center;
    min-width: 0;
  }

  .pb-art {
    flex: 0 0 auto;
    width: 26px;
    height: 26px;
    image-rendering: pixelated;
  }

  .pb-art-spark {
    display: grid;
    place-items: center;
    color: var(--ev-accent, var(--color-gold));
    font-size: var(--text-md);
  }

  .pb-prize {
    overflow: hidden;
    margin: 0;
    min-width: 0;
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-sm);
    font-weight: 500;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pb-count {
    margin-left: 6px;
    color: var(--text-muted);
    font-variant-numeric: tabular-nums;
  }

  .pb-winners {
    display: grid;
    gap: 5px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .pb-winner {
    font-size: var(--text-sm);
  }

  .pb-note {
    margin: 0;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-style: italic;
  }

  .pb-note-rolling {
    color: var(--ev-accent, var(--color-gold));
  }
</style>
