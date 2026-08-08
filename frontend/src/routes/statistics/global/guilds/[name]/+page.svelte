<script lang="ts">
  import Icon from "$lib/components/Icon.svelte";
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import StatBlock from "$lib/design-system/components/StatBlock.svelte";
  import StackedColumns from "$lib/design-system/components/charts/StackedColumns.svelte";
  import Podium from "$lib/design-system/components/Podium.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import { guildRankLabel, guildRankOrder, type GuildMemberStats } from "$lib/api/guildStats";
  import { raidSeriesFor } from "$lib/site/raids";
  import { nmsrFace } from "$lib/site/nmsr";
  import { compact } from "$lib/site/format";

  let { data } = $props();

  const stats = $derived(data.stats);
  const guild = $derived(stats.guild);
  const isSequoia = $derived(guild.name === "Sequoia");

  const currentSeason = $derived(stats.season_ranks.at(-1) ?? null);
  const bestFinish = $derived.by(() => {
    // The globally live season is a standing, not a finish - keep it out.
    // A guild's own last recorded season may be a long-finished one.
    const liveSeasonSlug = `guildSeason${data.liveSeason ?? -1}`;
    const finishes = Object.entries(stats.rankings)
      .filter(([slug]) => /^guildSeason\d+$/.test(slug) && slug !== liveSeasonSlug)
      .map(([, position]) => position);
    return finishes.length > 0 ? Math.min(...finishes) : null;
  });

  type ActivityDays = NonNullable<Awaited<typeof data.activity>>;

  function activitySeries(activity: ActivityDays) {
    const names = new Set<string>();
    for (const day of activity) {
      for (const count of day.raid_counts) names.add(count.raid_name);
    }
    return raidSeriesFor([...names]).map((raid) => ({
      key: raid.key,
      label: raid.short,
      color: raid.color,
    }));
  }

  function activityColumns(activity: ActivityDays) {
    return activity.map((day) => ({
      label: day.day.slice(5),
      values: Object.fromEntries(day.raid_counts.map((count) => [count.raid_name, count.count])),
    }));
  }

  /** Top raiders, best first - hidden and zero raid counts sit out. */
  const podium = $derived(
    stats.members
      .filter((member) => (member.raids_total ?? 0) > 0)
      .sort((a, b) => (b.raids_total ?? 0) - (a.raids_total ?? 0))
      .slice(0, 5)
      .map((member) => ({
        name: member.username,
        ident: member.uuid ?? member.username,
        value: `${(member.raids_total ?? 0).toLocaleString()} raids`,
        href: `/statistics/global/players/${encodeURIComponent(member.uuid ?? member.username)}`,
      })),
  );

  /** The member's org standing, when their Minecraft account is linked to a rank profile. */
  function orgRankOf(member: GuildMemberStats) {
    return member.uuid ? (data.ranks?.[member.uuid.toLowerCase()] ?? null) : null;
  }

  const memberColumns: LedgerColumn<GuildMemberStats>[] = [
    {
      key: "member",
      label: "Member",
      nameStyle: true,
      value: (member) => member.username,
      sortValue: (member) => member.username.toLowerCase(),
      avatar: (member) => nmsrFace(member.uuid ?? member.username, 22),
      // UUIDs dodge the 300 selector that reused usernames answer with.
      href: (member) =>
        `/statistics/global/players/${encodeURIComponent(member.uuid ?? member.username)}`,
    },
    {
      key: "rank",
      label: "Rank",
      nameStyle: true,
      value: (member) => orgRankOf(member)?.rank ?? guildRankLabel(member.rank),
      valueColor: (member) => orgRankOf(member)?.rankColor ?? null,
      // Org positions and in-game equivalents share one scale; without the
      // catalog every row falls back to the plain in-game ladder.
      sortValue: (member) =>
        data.rankLadder
          ? (orgRankOf(member)?.rankOrder ?? data.rankLadder[member.rank])
          : guildRankOrder(member.rank),
    },
    {
      key: "contributed",
      label: "XP contributed",
      numeric: true,
      value: (member) => compact(member.contributed),
      sortValue: (member) => member.contributed,
    },
    {
      key: "wars",
      label: "Wars",
      numeric: true,
      value: (member) => member.wars?.toLocaleString() ?? "-",
      sortValue: (member) => member.wars ?? -1,
    },
    {
      key: "raids",
      label: "Raids",
      numeric: true,
      value: (member) => member.raids_total?.toLocaleString() ?? "-",
      sortValue: (member) => member.raids_total ?? -1,
    },
    {
      key: "joined",
      label: "Joined",
      numeric: true,
      value: (member) => member.joined?.slice(0, 10) ?? "-",
      sortValue: (member) => member.joined ?? "",
    },
  ];
</script>

<StatsHeader kicker="Global · Guild" title={guild.name} lead={guild.prefix ? `[${guild.prefix}]` : undefined} />

<div class="vitals-strip animate-fade-in-up">
  <div class="divider-gold"></div>
  <div class="vitals">
    <StatBlock value={guild.members_total.toLocaleString()} label="Members">
      {#snippet icon()}<Icon name="users" />{/snippet}
    </StatBlock>
    <StatBlock value={guild.level.toLocaleString()} label="Guild Level">
      {#snippet icon()}<Icon name="level" />{/snippet}
    </StatBlock>
    <StatBlock value={guild.territories.toLocaleString()} label="Territories">
      {#snippet icon()}<Icon name="territory" />{/snippet}
    </StatBlock>
    <StatBlock value={compact(guild.wars)} label="Total Wars">
      {#snippet icon()}<Icon name="war" />{/snippet}
    </StatBlock>
    <StatBlock value={compact(guild.raids)} label="Guild Raids">
      {#snippet icon()}<Icon name="raid" />{/snippet}
    </StatBlock>
    <StatBlock value={stats.stale ? "-" : guild.online_now.toLocaleString()} label="Online Now">
      {#snippet icon()}<Icon name="online" />{/snippet}
    </StatBlock>
  </div>
  <div class="divider-gold"></div>
</div>

{#if stats.stale}
  <p class="muted stale-note">
    Cached snapshot from {new Date(stats.generated_at).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    })} UTC - live presence unavailable.
  </p>
{/if}

{#if isSequoia}
  <p class="muted home-note">
    This is us - the full Sequoia view lives under
    <a href="/statistics">Statistics</a>.
  </p>
{/if}

{#if currentSeason || bestFinish !== null}
  <section class="block" aria-label="Season snapshot">
    <SectionLabel>
      {#snippet children()}Season snapshot{/snippet}
    </SectionLabel>
    <dl class="season-facts">
      {#if currentSeason}
        <div class="fact">
          <dt>Season {currentSeason.season} rating</dt>
          <dd>{currentSeason.rating.toLocaleString()}</dd>
        </div>
      {/if}
      {#if bestFinish !== null}
        <div class="fact">
          <dt>Best season finish</dt>
          <dd class:gold={bestFinish === 1}>#{bestFinish}</dd>
        </div>
      {/if}
      <div class="fact">
        <dt>Seasons on record</dt>
        <dd>{stats.season_ranks.length}</dd>
      </div>
    </dl>
  </section>
{/if}

<section class="block" aria-label="Daily raid activity">
  <SectionLabel meta="last 14 days">
    {#snippet children()}Daily raid activity{/snippet}
  </SectionLabel>
  {#await data.activity}
    <p class="muted">Loading recent activity…</p>
  {:then activity}
    {#if activity === null}
      <p class="muted">The daily activity feed is temporarily unavailable.</p>
    {:else if activity.length === 0}
      <p class="muted">No raid activity recorded in this window.</p>
    {:else}
      <StackedColumns series={activitySeries(activity)} columns={activityColumns(activity)} height={190} />
    {/if}
  {/await}
</section>

<section class="block" aria-label="Top raiders">
  <SectionLabel>
    {#snippet children()}Top raiders{/snippet}
  </SectionLabel>
  {#if podium.length >= 3}
    <Podium entries={podium} max={5} label="Top raiders" />
  {:else}
    <p class="muted">Not enough visible raid counts for a podium.</p>
  {/if}
</section>

<section class="block" aria-label="Roster">
  <SectionLabel meta={`${stats.members.length} members`}>
    {#snippet children()}Roster{/snippet}
  </SectionLabel>
  {#if stats.members.length > 0}
    <LedgerTable
      columns={memberColumns}
      rows={stats.members}
      rowKey={(member) => member.username}
      defaultSort="contributed"
      defaultDescending={true}
      showRank={true}
      maxHeight="520px"
    />
  {:else}
    <p class="muted">The roster is temporarily unavailable.</p>
  {/if}
</section>

<style>
  .vitals-strip {
    margin-bottom: 40px;
  }

  .vitals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    gap: 18px;
    padding: 20px 4px;
  }

  .divider-gold {
    height: 1px;
    background: linear-gradient(90deg, rgba(245, 197, 66, 0.45), rgba(245, 197, 66, 0.06));
  }

  .home-note {
    margin: -24px 0 40px;
  }

  .stale-note {
    margin: -24px 0 40px;
  }

  .home-note a {
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

  .season-facts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    gap: 18px;
    margin: 0;
  }

  .fact dt {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .fact dd {
    margin: 6px 0 0;
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-lg);
  }

  .fact dd.gold {
    color: var(--color-gold);
  }
</style>
