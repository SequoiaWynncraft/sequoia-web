<script lang="ts">
  import { goto } from "$app/navigation";
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import ScopeChips from "$lib/design-system/components/ScopeChips.svelte";
  import SeasonLedger from "$lib/design-system/components/charts/SeasonLedger.svelte";
  import DeferredPanel from "$lib/design-system/components/DeferredPanel.svelte";
  import { RANKING_WINDOWS, type GlobalRaidRankingEntry } from "$lib/api/globalRankings";
  import type { SeasonRankingEntry } from "$lib/api/seasonRankings";

  let { data } = $props();

  const stats = $derived(data.stats);
  const rankings = $derived(data.rankings);
  const season = $derived(data.season);
  const raidRace = $derived(data.raidRace);
  const activeWindow = $derived(data.window);
  const guildName = $derived(stats?.guild.name ?? "Sequoia");

  const seasonOptions = $derived(
    stats ? [...stats.season_ranks].reverse().map((entry) => entry.season) : [],
  );
  const ownPosition = $derived(
    rankings?.entries.find((entry) => entry.name === guildName)?.position ??
      // Outside the fetched top slice, the guild's own rankings map still knows the placement.
      (season !== null ? (stats?.rankings[`guildSeason${season}`] ?? null) : null),
  );

  const sequoiaRaidEntry = $derived(
    raidRace?.entries.find((entry) => entry.guild_name === guildName) ?? null,
  );

  const raceWindowNote = $derived.by(() => {
    if (!raidRace?.baseline_sampled_at || !raidRace.current_sampled_at || raidRace.totals_only) {
      return null;
    }
    return `${raceDay(raidRace.baseline_sampled_at)} → ${raceDay(raidRace.current_sampled_at)}`;
  });

  function raceDay(instant: string): string {
    return new Date(instant).toLocaleDateString("en-GB", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  function guildHref(name: string): string {
    return `/statistics/global/guilds/${encodeURIComponent(name)}`;
  }

  function raceHref(key: string): string {
    const query = new URLSearchParams({ window: key });
    if (season !== null) query.set("season", String(season));
    return `?${query}`;
  }

  function compact(value: number): string {
    return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }

  /** Gambits per completion, the efficiency measure raiders compare. */
  function ratio(gambits: number, raids: number): string {
    return raids > 0 ? (gambits / raids).toFixed(1) : "-";
  }

  const raceColumns: LedgerColumn<GlobalRaidRankingEntry>[] = $derived.by(() => {
    const columns: LedgerColumn<GlobalRaidRankingEntry>[] = [
      {
        key: "position",
        label: "#",
        numeric: true,
        value: (entry) => String(entry.position),
        sortValue: (entry) => entry.position,
      },
      {
        key: "guild",
        label: "Guild",
        nameStyle: true,
        value: (entry) => entry.guild_name,
        sortValue: (entry) => entry.guild_name.toLowerCase(),
        secondary: (entry) => (entry.prefix ? `[${entry.prefix}]` : null),
        href: (entry) => guildHref(entry.guild_name),
      },
    ];
    if (raidRace?.totals_only) {
      // Lifetime and warm-up boards rank by current totals.
      columns.push(
        {
          key: "total",
          label: "Total raids",
          numeric: true,
          value: (entry) => entry.raids_total.toLocaleString(),
          sortValue: (entry) => entry.raids_total,
        },
        {
          key: "gambits",
          label: "Gambits",
          numeric: true,
          value: (entry) => compact(entry.gambits_total),
          sortValue: (entry) => entry.gambits_total,
        },
        {
          key: "sr",
          label: "SR",
          numeric: true,
          value: (entry) => compact(entry.sr_total),
          sortValue: (entry) => entry.sr_total,
        },
        {
          key: "ratio",
          label: "Gambits / raid",
          numeric: true,
          value: (entry) => ratio(entry.gambits_total, entry.raids_total),
          sortValue: (entry) => (entry.raids_total > 0 ? entry.gambits_total / entry.raids_total : -1),
        },
      );
    } else {
      columns.push(
        {
          key: "gained",
          label: "Raids gained",
          numeric: true,
          value: (entry) => `+${entry.raids_gained.toLocaleString()}`,
          sortValue: (entry) => entry.raids_gained,
        },
        {
          key: "gambits",
          label: "Gambits gained",
          numeric: true,
          value: (entry) => `+${entry.gambits_gained.toLocaleString()}`,
          sortValue: (entry) => entry.gambits_gained,
        },
        {
          key: "sr",
          label: "SR gained",
          numeric: true,
          value: (entry) => `+${compact(entry.sr_gained)}`,
          sortValue: (entry) => entry.sr_gained,
        },
        {
          key: "ratio",
          label: "Gambits / raid",
          numeric: true,
          value: (entry) => ratio(entry.gambits_gained, entry.raids_gained),
          sortValue: (entry) =>
            entry.raids_gained > 0 ? entry.gambits_gained / entry.raids_gained : -1,
        },
        {
          key: "total",
          label: "Total raids",
          numeric: true,
          value: (entry) => entry.raids_total.toLocaleString(),
          sortValue: (entry) => entry.raids_total,
        },
      );
    }
    columns.push({
      key: "rank",
      label: "Overall #",
      numeric: true,
      value: (entry) => String(entry.leaderboard_rank),
      sortValue: (entry) => entry.leaderboard_rank,
    });
    return columns;
  });

  const standingsColumns: LedgerColumn<SeasonRankingEntry>[] = [
    {
      key: "position",
      label: "#",
      numeric: true,
      value: (entry) => String(entry.position),
      sortValue: (entry) => entry.position,
    },
    {
      key: "guild",
      label: "Guild",
      nameStyle: true,
      value: (entry) => entry.name,
      sortValue: (entry) => entry.name.toLowerCase(),
      secondary: (entry) => (entry.prefix ? `[${entry.prefix}]` : null),
      href: (entry) => guildHref(entry.name),
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
    const query = new URLSearchParams({ season: value });
    if (activeWindow !== "7d") query.set("window", activeWindow);
    void goto(`?${query}`, { noScroll: true, keepFocus: true });
  }
</script>

<StatsHeader
  kicker="Global"
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

{#if ownPosition || sequoiaRaidEntry}
  <p class="standing-callout">
    {#if ownPosition}
      Season {season}: <strong>{guildName}</strong> holds
      <span class="standing-position" class:standing-first={ownPosition === 1}>#{ownPosition}</span>.
    {/if}
    {#if sequoiaRaidEntry}
      Guild raid leaderboard:
      <span
        class="standing-position"
        class:standing-first={sequoiaRaidEntry.leaderboard_rank === 1}
        >#{sequoiaRaidEntry.leaderboard_rank}</span
      >.
    {/if}
  </p>
{/if}

<section class="block" aria-label="Guild raid race">
  <SectionLabel meta={raidRace ? `top ${raidRace.entries.length} · every 10 min` : undefined}>
    {#snippet children()}Guild raid race{/snippet}
    {#snippet actions()}
      <ScopeChips
        scopes={[...RANKING_WINDOWS]}
        active={activeWindow}
        href={raceHref}
        note={raceWindowNote}
        label="Race window"
      />
    {/snippet}
  </SectionLabel>
  {#if raidRace && raidRace.entries.length > 0}
    {#if raidRace.warming_up}
      <p class="muted">Delta tracking is warming up - showing current totals.</p>
    {/if}
    <LedgerTable
      columns={raceColumns}
      rows={raidRace.entries}
      rowKey={(entry) => `${entry.position}:${entry.guild_name}`}
      defaultSort="position"
      defaultDescending={false}
      showRank={false}
      highlight={(entry) => entry.guild_name === guildName}
      maxHeight="480px"
    />
  {:else}
    <p class="muted">Raid rankings are temporarily unavailable.</p>
  {/if}
</section>

<section class="block" aria-label="Season standings">
  <SectionLabel meta={rankings ? `top ${rankings.entries.length}` : undefined}>
    {#snippet children()}Season {season ?? "-"} standings{/snippet}
  </SectionLabel>
  {#if rankings && rankings.entries.length > 0}
    <LedgerTable
      columns={standingsColumns}
      rows={rankings.entries}
      rowKey={(entry) => `${entry.position}:${entry.name}`}
      defaultSort="position"
      defaultDescending={false}
      showRank={false}
      highlight={(entry) => entry.name === guildName}
      maxHeight="480px"
    />
  {:else}
    <p class="muted">Season standings are temporarily unavailable.</p>
  {/if}
</section>

{#if stats}
  <section class="block" aria-label="Season history">
    <SectionLabel meta="{guildName} · seasons {stats.season_ranks[0]?.season ?? 0}–{stats.season_ranks.at(-1)?.season ?? 0}">
      {#snippet children()}Season history{/snippet}
    </SectionLabel>
    <SeasonLedger
      seasons={stats.season_ranks}
      positions={stats.rankings}
      liveSeason={stats.season_ranks.at(-1)?.season ?? null}
    />
  </section>

  <section class="block" aria-label="Leaderboard positions">
    <SectionLabel meta={guildName}>
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
    {#snippet children()}Guild statistics are temporarily unavailable - try again shortly.{/snippet}
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
