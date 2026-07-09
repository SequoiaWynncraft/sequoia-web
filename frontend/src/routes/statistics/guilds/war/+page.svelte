<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import StackedColumns from "$lib/design-system/components/charts/StackedColumns.svelte";
  import DeferredPanel from "$lib/design-system/components/DeferredPanel.svelte";
  import type { GuildMemberStats } from "$lib/api/guildStats";

  let { data } = $props();

  const stats = $derived(data.stats);

  const warrers = $derived(stats ? stats.members.filter((member) => (member.wars ?? 0) > 0) : []);
  const topWarrer = $derived(
    warrers.length > 0
      ? warrers.reduce((best, member) => ((member.wars ?? 0) > (best.wars ?? 0) ? member : best))
      : null,
  );

  const RANK_LABELS: Record<string, string> = {
    owner: "Owner",
    chief: "Chief",
    strategist: "Strategist",
    captain: "Captain",
    recruiter: "Recruiter",
    recruit: "Recruit",
  };

  const warColumns: LedgerColumn<GuildMemberStats>[] = [
    {
      key: "member",
      label: "Member",
      value: (member) => member.username,
      sortValue: (member) => member.username.toLowerCase(),
      secondary: (member) => RANK_LABELS[member.rank] ?? member.rank,
      href: (member) => `/statistics/player/playercard?player=${encodeURIComponent(member.username)}`,
    },
    {
      key: "wars",
      label: "Wars",
      numeric: true,
      value: (member) => (member.wars ?? 0).toLocaleString(),
      sortValue: (member) => member.wars ?? 0,
    },
    {
      key: "joined",
      label: "Joined",
      numeric: true,
      value: (member) => (member.joined ? formatDate(member.joined) : "—"),
      sortValue: (member) => (member.joined ? Date.parse(member.joined) : null),
    },
  ];

  const territorySeries = [
    { key: "territories", label: "Final territories", color: "var(--chart-amber)" },
  ];
  // The live season has no final count yet — only completed seasons chart.
  const territoryColumns = $derived(
    stats
      ? stats.season_ranks.slice(0, -1).map((entry) => ({
          label: `S${entry.season}`,
          values: { territories: entry.final_territories },
        }))
      : [],
  );

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat("en", { month: "short", year: "numeric" }).format(new Date(value));
  }
</script>

<StatsHeader
  kicker="Guilds"
  title="War"
/>

{#if stats}
  <div class="divider-gold"></div>
  <div class="war-vitals">
    <div class="war-vital">
      <span class="war-vital-value">{stats.guild.wars.toLocaleString()}</span>
      <span class="war-vital-label">Lifetime wars</span>
    </div>
    <div class="war-vital">
      <span class="war-vital-value">{stats.guild.territories.toLocaleString()}</span>
      <span class="war-vital-label">Territories held</span>
    </div>
    <div class="war-vital">
      <span class="war-vital-value">{warrers.length.toLocaleString()}</span>
      <span class="war-vital-label">Members with wars</span>
    </div>
    {#if topWarrer}
      <div class="war-vital">
        <span class="war-vital-value war-vital-name">{topWarrer.username}</span>
        <span class="war-vital-label">{(topWarrer.wars ?? 0).toLocaleString()} wars — most in guild</span>
      </div>
    {/if}
  </div>
  <div class="divider-gold divider-below"></div>

  <section class="block" aria-label="War leaderboard">
    <SectionLabel meta="{warrers.length} members">
      {#snippet children()}War leaderboard{/snippet}
    </SectionLabel>
    <LedgerTable
      columns={warColumns}
      rows={warrers}
      rowKey={(member) => member.uuid ?? member.username}
      defaultSort="wars"
      maxHeight="560px"
    />
  </section>

  <section class="block" aria-label="Territory finishes by season">
    <SectionLabel meta="completed seasons">
      {#snippet children()}Territory finishes{/snippet}
    </SectionLabel>
    <StackedColumns series={territorySeries} columns={territoryColumns} height={170} />
  </section>

  <section class="block" aria-label="Battle history">
    <SectionLabel>
      {#snippet children()}Battle history{/snippet}
    </SectionLabel>
    <DeferredPanel title="Awaiting feed" since="July 2026">
      {#snippet children()}
        War-by-war records — outcomes, territories, and participants — are being collected. This
        ledger unlocks once enough history has been recorded.
      {/snippet}
    </DeferredPanel>
  </section>
{:else}
  <DeferredPanel title="Data unavailable">
    {#snippet children()}Guild statistics are temporarily unavailable — try again shortly.{/snippet}
  </DeferredPanel>
{/if}

<style>
  .war-vitals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 20px;
    padding: 24px 8px;
  }

  .divider-below {
    margin-bottom: 40px;
  }

  .war-vital {
    display: grid;
    gap: 4px;
  }

  .war-vital-value {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    line-height: var(--leading-tight);
  }

  .war-vital-name {
    color: var(--color-gold);
    font-size: var(--text-xl);
  }

  .war-vital-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .block {
    margin-bottom: 40px;
  }
</style>
