<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import DeferredPanel from "$lib/design-system/components/DeferredPanel.svelte";
  import { nmsrFace } from "$lib/site/nmsr";
  import type { GuildMemberStats } from "$lib/api/guildStats";

  let { data } = $props();

  const stats = $derived(data.stats);

  const totalPlaytime = $derived(
    stats ? stats.members.reduce((sum, member) => sum + (member.playtime ?? 0), 0) : 0,
  );
  // Aggregate count — per-member flags are null for restricted or stale presence.
  const onlineCount = $derived(stats?.guild.online_now ?? 0);
  const activeThisWeek = $derived(
    stats
      ? stats.members.filter(
          (member) =>
            member.online === true ||
            (member.last_join !== null &&
              Date.now() - Date.parse(member.last_join) < 7 * 24 * 60 * 60 * 1000),
        ).length
      : 0,
  );

  function lastSeenLabel(member: GuildMemberStats): string {
    if (member.online === true) return member.server ? `Online · ${member.server}` : "Online";
    if (!member.last_join) return "—";
    const days = Math.floor((Date.now() - Date.parse(member.last_join)) / (24 * 60 * 60 * 1000));
    if (days <= 0) return "Today";
    if (days === 1) return "Yesterday";
    if (days < 30) return `${days} d ago`;
    const months = Math.floor(days / 30);
    return months < 12 ? `${months} mo ago` : `${Math.floor(months / 12)} y ago`;
  }

  function lastSeenRank(member: GuildMemberStats): number {
    if (member.online === true) return Date.now() + 1;
    return member.last_join ? Date.parse(member.last_join) : 0;
  }

  const columns: LedgerColumn<GuildMemberStats>[] = [
    {
      key: "member",
      label: "Member",
      nameStyle: true,
      value: (member) => member.username,
      sortValue: (member) => member.username.toLowerCase(),
      avatar: (member) => nmsrFace(member.uuid ?? member.username, 22),
      href: (member) => `/statistics/player/playercard?player=${encodeURIComponent(member.username)}`,
    },
    {
      key: "playtime",
      label: "Playtime",
      numeric: true,
      value: (member) =>
        member.playtime === null ? "—" : `${Math.round(member.playtime).toLocaleString()} h`,
      sortValue: (member) => member.playtime,
    },
    {
      key: "last_seen",
      label: "Last seen",
      numeric: true,
      value: (member) => lastSeenLabel(member),
      sortValue: (member) => lastSeenRank(member),
    },
    {
      key: "joined",
      label: "Member since",
      numeric: true,
      value: (member) =>
        member.joined
          ? new Intl.DateTimeFormat("en", { month: "short", year: "numeric", timeZone: "UTC" }).format(
              new Date(member.joined),
            )
          : "—",
      sortValue: (member) => (member.joined ? Date.parse(member.joined) : null),
    },
  ];
</script>

<StatsHeader
  kicker="Player"
  title="Activity"
/>

{#if stats}
  <div class="divider-gold"></div>
  <div class="activity-vitals">
    <div class="activity-vital">
      <span class="activity-vital-value">{onlineCount.toLocaleString()}</span>
      <span class="activity-vital-label">Online now</span>
    </div>
    <div class="activity-vital">
      <span class="activity-vital-value">{activeThisWeek.toLocaleString()}</span>
      <span class="activity-vital-label">Seen this week</span>
    </div>
    <div class="activity-vital">
      <span class="activity-vital-value">{Math.round(totalPlaytime).toLocaleString()} h</span>
      <span class="activity-vital-label">Combined playtime</span>
    </div>
  </div>
  <div class="divider-gold divider-below"></div>

  <section class="block" aria-label="Playtime leaderboard">
    <SectionLabel meta="{stats.members.length} members">
      {#snippet children()}Playtime ledger{/snippet}
    </SectionLabel>
    <LedgerTable
      {columns}
      rows={stats.members}
      rowKey={(member) => member.uuid ?? member.username}
      defaultSort="playtime"
      maxHeight="600px"
    />
  </section>

  <section class="block" aria-label="Session history">
    <SectionLabel>
      {#snippet children()}Session history{/snippet}
    </SectionLabel>
    <DeferredPanel title="Awaiting feed" since="July 2026">
      {#snippet children()}
        Daily playtime and session history per member are being recorded. Time-series charts
        unlock once enough snapshots have accumulated.
      {/snippet}
    </DeferredPanel>
  </section>
{:else}
  <DeferredPanel title="Data unavailable">
    {#snippet children()}Player statistics are temporarily unavailable — try again shortly.{/snippet}
  </DeferredPanel>
{/if}

<style>
  .activity-vitals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 20px;
    padding: 24px 8px;
  }

  .activity-vital {
    display: grid;
    gap: 4px;
  }

  .activity-vital-value {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    line-height: var(--leading-tight);
  }

  .activity-vital-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .divider-below {
    margin-bottom: 40px;
  }

  .block {
    margin-bottom: 40px;
  }
</style>
