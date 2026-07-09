<script lang="ts">
  import { goto } from "$app/navigation";
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import SeasonLedger from "$lib/design-system/components/charts/SeasonLedger.svelte";
  import DeferredPanel from "$lib/design-system/components/DeferredPanel.svelte";
  import type { SeasonRankingEntry } from "$lib/api/seasonRankings";

  let { data } = $props();

  const stats = $derived(data.stats);
  const rankings = $derived(data.rankings);
  const season = $derived(data.season);
  const guildName = $derived(stats?.guild.name ?? "Sequoia");

  const seasonOptions = $derived(
    stats ? [...stats.season_ranks].reverse().map((entry) => entry.season) : [],
  );
  const ownPosition = $derived(
    rankings?.entries.find((entry) => entry.name === guildName)?.position ??
      // Outside the fetched top slice, the guild's own rankings map still knows the placement.
      (season !== null ? (stats?.rankings[`guildSeason${season}`] ?? null) : null),
  );

  const standingsColumns: LedgerColumn<SeasonRankingEntry>[] = [
    {
      key: "guild",
      label: "Guild",
      value: (entry) => entry.name,
      sortValue: (entry) => entry.name.toLowerCase(),
      secondary: (entry) => (entry.prefix ? `[${entry.prefix}]` : null),
    },
    {
      key: "rating",
      label: "Season rating",
      numeric: true,
      value: (entry) => entry.rating.toLocaleString(),
      sortValue: (entry) => entry.rating,
    },
  ];

  interface Trophy {
    label: string;
    position: number;
    slug: string;
  }

  const TROPHY_LABELS: [RegExp, (match: RegExpMatchArray) => string][] = [
    [/^guildSeason(\d+)$/, (match) => `Season ${match[1]}`],
    [/^guildTotalRaids$/, () => "Total guild raids"],
    [/^colossusSrGuilds$/, () => "TCC season rating"],
    [/^namelessSrGuilds$/, () => "TNA season rating"],
    [/^orphionSrGuilds$/, () => "NOL season rating"],
    [/^grootslangSrGuilds$/, () => "NOTG season rating"],
    [/^frumaSrGuilds$/, () => "Fruma season rating"],
    [/^guildLevel$/, () => "Guild level"],
    [/^guildTerritories$/, () => "Territories"],
    [/^guildWars$/, () => "Wars"],
  ];

  const trophies: Trophy[] = $derived.by(() => {
    if (!stats) return [];
    // The live season is a standing, not a finish — it stays off the wall.
    const liveSeasonSlug = `guildSeason${stats.season_ranks.at(-1)?.season ?? -1}`;
    const entries: Trophy[] = [];
    for (const [slug, position] of Object.entries(stats.rankings)) {
      if (slug === liveSeasonSlug) continue;
      for (const [pattern, label] of TROPHY_LABELS) {
        const match = slug.match(pattern);
        if (match) {
          entries.push({ label: label(match), position, slug });
          break;
        }
      }
    }
    return entries.sort(
      (a, b) => a.position - b.position || a.label.localeCompare(b.label, "en", { numeric: true }),
    );
  });

  function selectSeason(event: Event) {
    const value = (event.currentTarget as HTMLSelectElement).value;
    void goto(`?season=${value}`, { noScroll: true, keepFocus: true });
  }
</script>

<StatsHeader
  kicker="Guilds"
  title="Rankings"
>
  {#snippet actions()}
    {#if seasonOptions.length > 0}
      <label class="season-select">
        <span>Season</span>
        <select value={String(season)} onchange={selectSeason}>
          {#each seasonOptions as option (option)}
            <option value={String(option)}>{option}</option>
          {/each}
        </select>
      </label>
    {/if}
  {/snippet}
</StatsHeader>

{#if ownPosition}
  <p class="standing-callout">
    Season {season}: <strong>{guildName}</strong> holds
    <span class="standing-position" class:standing-first={ownPosition === 1}>#{ownPosition}</span>
    of {rankings?.entries.length ?? 0} ranked guilds.
  </p>
{/if}

<section class="block" aria-label="Season standings">
  <SectionLabel meta={rankings ? `top ${rankings.entries.length}` : undefined}>
    {#snippet children()}Season {season ?? "—"} standings{/snippet}
  </SectionLabel>
  {#if rankings && rankings.entries.length > 0}
    <LedgerTable
      columns={standingsColumns}
      rows={rankings.entries}
      rowKey={(entry) => `${entry.position}:${entry.name}`}
      defaultSort="rating"
      highlight={(entry) => entry.name === guildName}
      maxHeight="480px"
    />
  {:else}
    <p class="muted">Season standings are temporarily unavailable.</p>
  {/if}
</section>

{#if stats}
  <section class="block" aria-label="Season history">
    <SectionLabel meta="seasons {stats.season_ranks[0]?.season ?? 0}–{stats.season_ranks.at(-1)?.season ?? 0}">
      {#snippet children()}Season history{/snippet}
    </SectionLabel>
    <SeasonLedger seasons={stats.season_ranks} positions={stats.rankings} />
  </section>

  <section class="block" aria-label="Leaderboard positions">
    <SectionLabel>
      {#snippet children()}Trophy wall{/snippet}
    </SectionLabel>
    <div class="trophies">
      {#each trophies as trophy (trophy.slug)}
        <div class="trophy" class:trophy-first={trophy.position === 1}>
          <span class="trophy-position">#{trophy.position}</span>
          <span class="trophy-label">{trophy.label}</span>
        </div>
      {/each}
    </div>
  </section>
{:else}
  <DeferredPanel title="Data unavailable">
    {#snippet children()}Guild statistics are temporarily unavailable — try again shortly.{/snippet}
  </DeferredPanel>
{/if}

<style>
  .season-select {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .season-select select {
    padding: 7px 10px;
    border: 1px solid var(--color-border-accent);
    background: var(--color-surface);
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .season-select select:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .standing-callout {
    margin: 0 0 24px;
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  .standing-callout strong {
    color: var(--text-heading);
    font-weight: var(--weight-regular);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .standing-position {
    font-family: var(--font-data);
    color: var(--text-heading);
  }

  .standing-first {
    color: var(--color-gold);
  }

  .block {
    margin-bottom: 40px;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .trophies {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
    gap: 10px;
  }

  .trophy {
    display: flex;
    align-items: baseline;
    gap: 10px;
    padding: 12px 14px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(19, 22, 31, 0.6);
    box-shadow: var(--bevel-slot);
  }

  .trophy-position {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-sm);
  }

  .trophy-label {
    color: var(--text-body);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-tight);
  }

  .trophy-first {
    border-color: rgba(245, 197, 66, 0.35);
  }

  .trophy-first .trophy-position {
    color: var(--color-gold);
  }

  .trophy-first .trophy-label {
    color: var(--text-heading);
  }
</style>
