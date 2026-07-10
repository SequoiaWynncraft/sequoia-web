<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import DeferredPanel from "$lib/design-system/components/DeferredPanel.svelte";
  import { nmsrFace } from "$lib/site/nmsr";
  import type { MemberProgressEntry } from "$lib/api/memberProgress";

  let { data } = $props();

  const RANGES = [
    { key: "1w", label: "1w" },
    { key: "1m", label: "1m" },
    { key: "3m", label: "3m" },
    { key: "6m", label: "6m" },
    { key: "ytd", label: "ytd" },
    { key: "all", label: "all" },
  ];

  const progress = $derived(data.progress);

  const trackingNotes = $derived.by(() => {
    if (!progress) return [];
    const sources: [string, string][] = [
      ["Playtime and wars", progress.data_since.activity],
      ["Raids", progress.data_since.raids],
      ["War points", progress.data_since.war_points],
    ];
    return sources
      .filter(([, since]) => since > progress.from)
      .map(([label, since]) => `${label} tracked since ${formatDay(since)}`);
  });

  function formatDay(day: string): string {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
      new Date(`${day}T00:00:00Z`),
    );
  }

  function points(value: number): string {
    return value.toLocaleString(undefined, { maximumFractionDigits: 1 });
  }

  const columns: LedgerColumn<MemberProgressEntry>[] = [
    {
      key: "member",
      label: "Member",
      nameStyle: true,
      value: (member) => member.player_name,
      sortValue: (member) => member.player_name.toLowerCase(),
      avatar: (member) => nmsrFace(member.player_uuid, 22),
      href: (member) => `/statistics/player/playercard?player=${encodeURIComponent(member.player_name)}`,
    },
    {
      key: "playtime",
      label: "Playtime",
      numeric: true,
      value: (member) => `${member.playtime_hours.toLocaleString()} h`,
      sortValue: (member) => member.playtime_hours,
    },
    {
      key: "wars",
      label: "Wars",
      numeric: true,
      value: (member) => member.wars.toLocaleString(),
      sortValue: (member) => member.wars,
    },
    {
      key: "raids",
      label: "Raids",
      numeric: true,
      value: (member) => member.raids.toLocaleString(),
      sortValue: (member) => member.raids,
    },
    {
      key: "war_points",
      label: "War points",
      numeric: true,
      value: (member) => points(member.war_points),
      sortValue: (member) => member.war_points,
    },
  ];
</script>

<StatsHeader
  kicker="Player"
  title="Progress"
/>

<nav class="ranges" aria-label="Date range">
  {#each RANGES as range (range.key)}
    <a
      href="?range={range.key}"
      class="range-chip"
      class:range-chip-active={data.range === range.key}
      aria-current={data.range === range.key ? "page" : undefined}
    >
      {range.label}
    </a>
  {/each}
  <span class="range-window">{formatDay(data.from)} to {formatDay(data.to)}</span>
</nav>

{#if progress}
  <section class="block" aria-label="Member progress">
    <SectionLabel meta="{progress.members.length} members">
      {#snippet children()}Gains ledger{/snippet}
    </SectionLabel>
    <LedgerTable
      {columns}
      rows={progress.members}
      rowKey={(member) => member.player_uuid}
      defaultSort="playtime"
      maxHeight="640px"
    />
    {#if trackingNotes.length > 0}
      <p class="tracking-note">{trackingNotes.join(" · ")}</p>
    {/if}
  </section>
{:else}
  <DeferredPanel title="Data unavailable">
    {#snippet children()}Progress statistics are temporarily unavailable - try again shortly.{/snippet}
  </DeferredPanel>
{/if}

<style>
  .ranges {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 28px;
  }

  .range-chip {
    padding: 6px 13px;
    border: 1px solid var(--color-border-subtle);
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    text-decoration: none;
    transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease;
  }

  .range-chip:hover {
    border-color: rgba(245, 197, 66, 0.4);
    color: var(--color-gold);
  }

  .range-chip-active {
    border-color: rgba(245, 197, 66, 0.4);
    background: rgba(245, 197, 66, 0.08);
    color: var(--color-gold);
  }

  .range-window {
    margin-left: 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .block {
    margin-bottom: 40px;
  }

  .tracking-note {
    margin: 12px 2px 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
