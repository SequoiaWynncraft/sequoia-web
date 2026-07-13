<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import DeferredPanel from "$lib/design-system/components/DeferredPanel.svelte";
  import { raidSeriesFor } from "$lib/site/raids";
  import { nmsrFace } from "$lib/site/nmsr";
  import Podium from "$lib/design-system/components/Podium.svelte";
  import type { GuildMemberStats } from "$lib/api/guildStats";

  let { data } = $props();

  const stats = $derived(data.stats);

  const raiders = $derived(
    stats ? stats.members.filter((member) => (member.raids_total ?? 0) > 0) : [],
  );

  const raidSeries = $derived.by(() => {
    const names = new Set<string>();
    for (const member of raiders) {
      for (const name of Object.keys(member.raids)) names.add(name);
    }
    return raidSeriesFor([...names]);
  });

  const podium = $derived(
    [...raiders].sort((a, b) => (b.raids_total ?? 0) - (a.raids_total ?? 0)).slice(0, 5),
  );

  const columns: LedgerColumn<GuildMemberStats>[] = $derived([
    {
      key: "member",
      label: "Member",
      nameStyle: true,
      value: (member: GuildMemberStats) => member.username,
      sortValue: (member: GuildMemberStats) => member.username.toLowerCase(),
      avatar: (member: GuildMemberStats) => nmsrFace(member.uuid ?? member.username, 22),
      href: (member: GuildMemberStats) =>
        `/statistics/player/playercard?player=${encodeURIComponent(member.username)}`,
    },
    {
      key: "total",
      label: "Total",
      numeric: true,
      value: (member: GuildMemberStats) => (member.raids_total ?? 0).toLocaleString(),
      sortValue: (member: GuildMemberStats) => member.raids_total ?? 0,
    },
    ...raidSeries.map((raid) => ({
      key: raid.key,
      label: raid.short,
      numeric: true,
      headerColor: raid.color,
      value: (member: GuildMemberStats) => (member.raids[raid.key] ?? 0).toLocaleString(),
      sortValue: (member: GuildMemberStats) => member.raids[raid.key] ?? 0,
    })),
  ]);
</script>

<StatsHeader
  kicker="Player"
  title="Raids"
/>

{#if stats}
  <Podium
    max={5}
    label="Top raiders"
    entries={podium.map((member) => ({
      name: member.username,
      ident: member.uuid ?? member.username,
      value: `${(member.raids_total ?? 0).toLocaleString()} raids`,
      href: `/statistics/player/playercard?player=${encodeURIComponent(member.username)}`,
    }))}
  />

  <section class="block" aria-label="Raid ledger">
    <SectionLabel meta="{raiders.length} raiders · sort any column">
      {#snippet children()}Raid ledger{/snippet}
    </SectionLabel>
    <LedgerTable
      {columns}
      rows={raiders}
      rowKey={(member) => member.uuid ?? member.username}
      defaultSort="total"
      maxHeight="600px"
    />
  </section>

  <section class="block" aria-label="Personal bests">
    <SectionLabel>
      {#snippet children()}Best times & personal records{/snippet}
    </SectionLabel>
    <DeferredPanel title="Work in progress" />
  </section>
{:else}
  <DeferredPanel title="Data unavailable">
    {#snippet children()}Player statistics are temporarily unavailable - try again shortly.{/snippet}
  </DeferredPanel>
{/if}

<style>
  .block {
    margin-bottom: 40px;
  }

  @media (max-width: 640px) {
    }

  @media (prefers-reduced-motion: reduce) {
    }
</style>
