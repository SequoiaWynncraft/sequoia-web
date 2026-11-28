<script lang="ts">
  import StatsHeader from "#lib/components/StatsHeader.svelte";
  import SectionLabel from "#lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "#lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "#lib/design-system/components/ledgerTable.js";
  import ScopeChips from "#lib/design-system/components/ScopeChips.svelte";
  import Podium from "#lib/design-system/components/Podium.svelte";
  import {
    PLAYER_METRICS,
    PLAYER_WINDOWS,
    type GlobalPlayerRankingEntry,
  } from "#lib/api/globalPlayers.js";
  import type { PlayerSearchHit } from "#lib/server/globalPlayer.js";
  import { nmsrFace } from "#lib/site/nmsr.js";

  let { data } = $props();

  const query = $derived(data.query);
  const hits = $derived(data.hits);
  const rankings = $derived(data.rankings);
  const activeMetric = $derived(data.metric);
  const activeWindow = $derived(data.window);

  const metricLabel = $derived(
    PLAYER_METRICS.find((metric) => metric.key === activeMetric)?.label ?? "Playtime",
  );

  function boardHref(metric: string, window: string): string {
    const params = new URLSearchParams();
    if (metric !== "playtime") params.set("metric", metric);
    if (window !== "7d") params.set("window", window);
    const suffix = params.toString();
    return suffix ? `?${suffix}` : "?";
  }

  function playerHref(entry: GlobalPlayerRankingEntry): string {
    // UUIDs dodge the 300 selector that reused usernames answer with.
    return `/statistics/global/players/${encodeURIComponent(entry.player_uuid)}`;
  }

  function metricValue(value: number): string {
    return activeMetric === "playtime" ? `${value.toLocaleString()} h` : value.toLocaleString();
  }

  const windowNote = $derived.by(() => {
    if (!rankings) return null;
    if (rankings.from && rankings.to) {
      const truncated = rankings.data_since !== null && rankings.data_since > rankings.from;
      const from = truncated && rankings.data_since ? rankings.data_since : rankings.from;
      return `${truncated ? "tracked " : ""}${day(from)} to ${day(rankings.to)}`;
    }
    if (rankings.range === "all" && rankings.data_since) {
      return `tracked since ${day(rankings.data_since)}`;
    }
    return null;
  });

  function day(value: string): string {
    return new Date(`${value}T00:00:00Z`).toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  const podiumEntries = $derived(
    (rankings?.entries ?? []).slice(0, 5).map((entry) => ({
      name: entry.username,
      ident: entry.player_uuid,
      value: metricValue(entry.value),
      href: playerHref(entry),
    })),
  );

  const boardColumns: LedgerColumn<GlobalPlayerRankingEntry>[] = $derived.by(() => [
    {
      key: "position",
      label: "#",
      numeric: true,
      value: (entry) => String(entry.position),
      sortValue: (entry) => entry.position,
    },
    {
      key: "player",
      label: "Player",
      nameStyle: true,
      value: (entry) => entry.username,
      sortValue: (entry) => entry.username.toLowerCase(),
      avatar: (entry) => nmsrFace(entry.player_uuid, 22),
      href: (entry) => playerHref(entry),
    },
    {
      key: "guild",
      label: "Guild",
      value: (entry) => entry.guild_name ?? "-",
      sortValue: (entry) => entry.guild_name?.toLowerCase() ?? null,
      secondary: (entry) => (entry.guild_prefix ? `[${entry.guild_prefix}]` : null),
      href: (entry) =>
        entry.guild_name
          ? `/statistics/global/guilds/${encodeURIComponent(entry.guild_name)}`
          : null,
    },
    {
      key: "value",
      label: metricLabel,
      numeric: true,
      value: (entry) => metricValue(entry.value),
      sortValue: (entry) => entry.value,
    },
  ]);

  const searchColumns: LedgerColumn<PlayerSearchHit>[] = [
    {
      key: "player",
      label: "Player",
      nameStyle: true,
      value: (hit) => hit.username,
      sortValue: (hit) => hit.username.toLowerCase(),
      avatar: (hit) => nmsrFace(hit.uuid, 22),
      href: (hit) => `/statistics/global/players/${encodeURIComponent(hit.uuid)}`,
    },
  ];
</script>

<StatsHeader kicker="Global" title="Players" lead="Look up any player - or see who leads the server." />

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
        columns={searchColumns}
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
  <p class="muted lookup-hint">Type at least 3 characters to search.</p>
{/if}

<section class="block" aria-label="Player rankings">
  <SectionLabel
    meta={rankings ? `top ${rankings.entries.length} · every 15 min` : undefined}
  >
    {#snippet children()}Player rankings{/snippet}
    {#snippet actions()}
      <div class="board-scopes">
        <ScopeChips
          scopes={[...PLAYER_METRICS]}
          active={activeMetric}
          href={(key) => boardHref(key, activeWindow)}
          label="Metric"
        />
        <ScopeChips
          scopes={[...PLAYER_WINDOWS]}
          active={activeWindow}
          href={(key) => boardHref(activeMetric, key)}
          note={windowNote}
          label="Window"
        />
      </div>
    {/snippet}
  </SectionLabel>
  {#if rankings && rankings.warming_up}
    <p class="muted">Rankings are warming up - check back in a few minutes.</p>
  {:else if rankings && rankings.entries.length > 0}
    {#if podiumEntries.length >= 3}
      <Podium max={5} entries={podiumEntries} label="Top players" />
    {/if}
    <LedgerTable
      columns={boardColumns}
      rows={rankings.entries}
      rowKey={(entry) => entry.player_uuid}
      defaultSort="position"
      defaultDescending={false}
      showRank={false}
      maxHeight="640px"
    />
  {:else}
    <p class="muted">Player rankings are temporarily unavailable.</p>
  {/if}
</section>

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
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
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
    border-color: color-mix(in srgb, var(--color-gold) 40%, transparent);
    color: var(--color-gold);
  }

  .lookup button:focus-visible {
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
    outline-offset: 2px;
  }

  .board-scopes {
    display: grid;
    gap: 8px;
    justify-items: end;
  }

  .block {
    margin-bottom: 40px;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .lookup-hint {
    margin-bottom: 40px;
  }
</style>
