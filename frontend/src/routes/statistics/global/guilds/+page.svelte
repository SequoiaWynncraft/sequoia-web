<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import type { GuildSearchHit } from "$lib/server/globalGuild";

  let { data } = $props();

  const query = $derived(data.query);
  const hits = $derived(data.hits);

  const columns: LedgerColumn<GuildSearchHit>[] = [
    {
      key: "guild",
      label: "Guild",
      nameStyle: true,
      value: (hit) => hit.name,
      sortValue: (hit) => hit.name.toLowerCase(),
      secondary: (hit) => (hit.prefix ? `[${hit.prefix}]` : null),
      href: (hit) => `/statistics/global/guilds/${encodeURIComponent(hit.name)}`,
    },
    {
      key: "prefix",
      label: "Prefix",
      value: (hit) => hit.prefix || "-",
      sortValue: (hit) => hit.prefix.toLowerCase(),
    },
  ];
</script>

<StatsHeader kicker="Global" title="Guilds" lead="Look up any guild on Wynncraft." />

<form class="lookup" method="GET" action="/statistics/global/guilds">
  <input
    type="search"
    name="q"
    value={query}
    placeholder="Guild name or prefix"
    minlength="3"
    maxlength="64"
    aria-label="Guild name or prefix"
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
      <p class="muted">No guilds match "{query}".</p>
    {:else}
      <LedgerTable
        columns={columns}
        rows={hits}
        rowKey={(hit) => hit.name}
        defaultSort="guild"
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
