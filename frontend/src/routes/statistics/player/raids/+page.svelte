<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import DeferredPanel from "$lib/design-system/components/DeferredPanel.svelte";
  import { raidSeriesFor } from "$lib/site/raids";
  import { nmsrFace, nmsrFrontBust } from "$lib/site/nmsr";
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
    [...raiders].sort((a, b) => (b.raids_total ?? 0) - (a.raids_total ?? 0)).slice(0, 3),
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
  {#if podium.length === 3}
    <div class="podium" aria-label="Top three raiders">
      {#each [podium[1], podium[0], podium[2]] as member, index (member.uuid ?? member.username)}
        {@const place = index === 1 ? 1 : index === 0 ? 2 : 3}
        <a
          class="podium-slot"
          class:podium-first={place === 1}
          href={`/statistics/player/playercard?player=${encodeURIComponent(member.username)}`}
        >
          <img
            class="podium-render"
            src={nmsrFrontBust(member.uuid ?? member.username, 120)}
            alt="{member.username}'s skin"
            loading="lazy"
          />
          <span class="podium-place">#{place}</span>
          <span class="podium-name">{member.username}</span>
          <span class="podium-value">{(member.raids_total ?? 0).toLocaleString()} raids</span>
        </a>
      {/each}
    </div>
  {/if}

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
  .podium {
    display: grid;
    grid-template-columns: repeat(3, minmax(140px, 200px));
    justify-content: start;
    align-items: end;
    gap: 12px;
    margin-bottom: 40px;
  }

  .podium-slot {
    display: grid;
    justify-items: center;
    gap: 4px;
    padding: 18px 14px 14px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(19, 22, 31, 0.6);
    box-shadow: var(--bevel-slot);
    text-decoration: none;
    transition: border-color var(--dur-fast) ease, transform var(--dur-base) var(--ease-out-soft);
  }

  .podium-slot:hover {
    border-color: rgba(245, 197, 66, 0.4);
    transform: translateY(-3px);
  }

  .podium-slot:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .podium-first {
    border-color: rgba(245, 197, 66, 0.35);
    padding-top: 26px;
  }

  .podium-render {
    width: 96px;
    height: auto;
    image-rendering: pixelated;
  }

  .podium-first .podium-render {
    width: 120px;
  }

  .podium-place {
    margin-top: 6px;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-xs);
  }

  .podium-first .podium-place {
    color: var(--color-gold);
  }

  .podium-name {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
  }

  .podium-value {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  .block {
    margin-bottom: 40px;
  }

  @media (max-width: 640px) {
    .podium {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .podium-slot,
    .podium-slot:hover {
      transition: none;
      transform: none;
    }
  }
</style>
