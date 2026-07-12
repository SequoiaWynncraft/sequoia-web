<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import type { PlayerSearchHit } from "$lib/server/globalPlayer";

  let { data } = $props();

  const query = $derived(data.query);
  const hits = $derived(data.hits);

  const columns: LedgerColumn<PlayerSearchHit>[] = [
    {
      key: "player",
      label: "Player",
      nameStyle: true,
      value: (hit) => hit.username,
      sortValue: (hit) => hit.username.toLowerCase(),
      href: (hit) => `/statistics/global/players/${encodeURIComponent(hit.username)}`,
    },
  ];
</script>

<StatsHeader kicker="Global" title="Players" lead="Look up any player on Wynncraft." />

<form class="lookup" method="GET" action="/statistics/global/players">
  <input
    type="search"
    name="q"
    value={query}
    placeholder="Player name"
    minlength="3"
    maxlength="64"
    aria-label="Player name"
  />
  <button type="submit">Search</button>
</form>

{#if query.length >= 3}
  <section class="block" aria-label="Search results">
    <SectionLabel meta={hits ? `${hits.length} match${hits.length === 1 ? "" : "es"}` : undefined}>
      {#snippet children()}Results{/snippet}
    </SectionLabel>
    {#if hits === null}
      <p class="muted">Search is temporarily unavailable - try again shortly.</p>
    {:else if hits.length === 0}
      <p class="muted">No players match "{query}".</p>
    {:else}
      <LedgerTable
        columns={columns}
        rows={hits}
        rowKey={(hit) => hit.uuid}
        defaultSort="player"
        defaultDescending={false}
        showRank={false}
        maxHeight="480px"
      />
    {/if}
  </section>
{:else if query.length > 0}
  <p class="muted">Type at least 3 characters to search.</p>
{/if}

<style>
  .lookup {
    display: flex;
    gap: 10px;
    margin-bottom: 40px;
    max-width: 460px;
  }

  .lookup input {
    flex: 1;
    padding: 9px 12px;
    border: 1px solid var(--color-border-accent);
    background: var(--color-surface);
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-sm);
  }

  .lookup input:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .lookup button {
    padding: 9px 18px;
    border: 1px solid var(--color-border-accent);
    background: none;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
    transition:
      color var(--dur-fast) ease,
      border-color var(--dur-fast) ease;
  }

  .lookup button:hover {
    border-color: rgba(245, 197, 66, 0.4);
    color: var(--color-gold);
  }

  .lookup button:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .block {
    margin-bottom: 40px;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
</style>
