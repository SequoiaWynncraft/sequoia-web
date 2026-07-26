<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import DeferredPanel from "$lib/design-system/components/DeferredPanel.svelte";
  import ScopeChips from "$lib/design-system/components/ScopeChips.svelte";
  import { nmsrFace } from "$lib/site/nmsr";
  import Podium from "$lib/design-system/components/Podium.svelte";
  import WeeklyRaidAnnouncement from "./WeeklyRaidAnnouncement.svelte";
  import type { GuildMemberStats } from "$lib/api/guildStats";
  import type { MemberProgressEntry } from "$lib/api/memberProgress";

  let { data } = $props();

  // "now" is the roster as it stands; every other scope shows gains over that window.
  const SCOPES = [
    { key: "now", label: "now" },
    { key: "1d", label: "1d" },
    { key: "3d", label: "3d" },
    { key: "1w", label: "1w" },
    { key: "1m", label: "1m" },
    { key: "3m", label: "3m" },
    { key: "6m", label: "6m" },
    { key: "ytd", label: "ytd" },
    { key: "all", label: "all" },
  ];

  const stats = $derived(data.view === "now" ? data.stats : null);
  const progress = $derived(data.view === "gains" ? data.progress : null);

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

  const gainTotals = $derived.by(() => {
    if (!progress) return null;
    const totals = { playtime: 0, wars: 0, raids: 0, warPoints: 0 };
    for (const member of progress.members) {
      totals.playtime += member.playtime_hours;
      totals.wars += member.wars;
      totals.raids += member.raids;
      totals.warPoints += member.war_points;
    }
    return totals;
  });

  /** UTC rollup days summed by the backend - the range is from..to inclusive. */
  const windowDays = $derived(
    data.view === "gains"
      ? Math.max(1, Math.round((Date.parse(data.to) - Date.parse(data.from)) / 86_400_000) + 1)
      : 1,
  );

  const activeCount = $derived(
    progress
      ? progress.members.filter(
          (member) => member.playtime_hours > 0 || member.wars > 0 || member.raids > 0,
        ).length
      : 0,
  );

  let gainsSortKey = $state("playtime");

  /** The podium mirrors the ledger's sort; the name column falls back to raids. */
  const podiumMetric = $derived.by(() => {
    switch (gainsSortKey) {
      case "wars":
        return { of: (m: MemberProgressEntry) => m.wars, show: (v: number) => v.toLocaleString() };
      case "member":
      case "raids":
        return { of: (m: MemberProgressEntry) => m.raids, show: (v: number) => v.toLocaleString() };
      case "war_points":
        return { of: (m: MemberProgressEntry) => m.war_points, show: points };
      case "rate":
        return {
          of: (m: MemberProgressEntry) => m.playtime_hours / windowDays,
          show: (v: number) => `${points(v)} h / day`,
        };
      default:
        return {
          of: (m: MemberProgressEntry) => m.playtime_hours,
          show: (v: number) => `${v.toLocaleString()} h`,
        };
    }
  });

  const topGainers = $derived(
    progress
      ? [...progress.members]
          .filter((member) => podiumMetric.of(member) > 0)
          .sort((a, b) => podiumMetric.of(b) - podiumMetric.of(a))
          .slice(0, 5)
          .map((member) => ({
            name: member.player_name,
            ident: member.player_uuid,
            value: podiumMetric.show(podiumMetric.of(member)),
            href: `/statistics/player/playercard?player=${encodeURIComponent(member.player_name)}`,
          }))
      : [],
  );

  const trackingNotes = $derived.by(() => {
    if (data.view !== "gains" || !progress) return [];
    const from = data.from;
    const sources: [string, string][] = [
      ["Playtime and wars", progress.data_since.activity],
      ["Raids", progress.data_since.raids],
      ["War points", progress.data_since.war_points],
    ];
    return sources
      .filter(([, since]) => since > from)
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

  function lastSeenLabel(member: GuildMemberStats): string {
    if (member.online === true) return member.server ? `Online · ${member.server}` : "Online";
    if (!member.last_join) return "-";
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

  function standingOf(member: GuildMemberStats) {
    if (data.view !== "now" || !member.uuid) return null;
    return data.ranks[member.uuid.toLowerCase()] ?? null;
  }

  const rosterColumns: LedgerColumn<GuildMemberStats>[] = [
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
      key: "rank",
      label: "Rank",
      nameStyle: true,
      value: (member) => standingOf(member)?.rank ?? "-",
      sortValue: (member) => standingOf(member)?.rankOrder ?? null,
      icon: (member) => {
        const standing = standingOf(member);
        return standing?.insigniaUrl
          ? { src: standing.insigniaUrl, alt: `${standing.insignia?.toLowerCase()} insignia` }
          : null;
      },
      // Text fallback so an insignia without artwork still shows its grade.
      secondary: (member) => {
        const standing = standingOf(member);
        return standing?.insignia && !standing.insigniaUrl
          ? `◆ ${standing.insignia.toLowerCase()}`
          : null;
      },
    },
    {
      key: "playtime",
      label: "Playtime",
      numeric: true,
      value: (member) =>
        member.playtime === null ? "-" : `${Math.round(member.playtime).toLocaleString()} h`,
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
          : "-",
      sortValue: (member) => (member.joined ? Date.parse(member.joined) : null),
    },
  ];

  const gainColumns: LedgerColumn<MemberProgressEntry>[] = [
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
    {
      key: "rate",
      label: "h / day",
      numeric: true,
      value: (member) => points(member.playtime_hours / windowDays),
      sortValue: (member) => member.playtime_hours / windowDays,
    },
  ];
</script>

<StatsHeader
  kicker="Player"
  title="Activity"
/>

<div class="scope-row">
  <ScopeChips
    scopes={SCOPES}
    active={data.range}
    href={(key) => `?range=${key}`}
    note={data.view === "gains" ? `${formatDay(data.from)} to ${formatDay(data.to)}` : null}
    label="Time scope"
  />
</div>

{#if data.view === "now" && stats}
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

  <section class="block" aria-label="Roster">
    <SectionLabel meta="{stats.members.length} members">
      {#snippet children()}Roster ledger{/snippet}
    </SectionLabel>
    <LedgerTable
      columns={rosterColumns}
      rows={stats.members}
      rowKey={(member) => member.uuid ?? member.username}
      defaultSort="playtime"
      maxHeight="640px"
    />
  </section>
{:else if data.view === "gains" && progress && gainTotals}
  <div class="divider-gold"></div>
  <div class="activity-vitals">
    <div class="activity-vital">
      <span class="activity-vital-value">{Math.round(gainTotals.playtime).toLocaleString()} h</span>
      <span class="activity-vital-label">Playtime</span>
    </div>
    <div class="activity-vital">
      <span class="activity-vital-value">{gainTotals.wars.toLocaleString()}</span>
      <span class="activity-vital-label">Wars</span>
    </div>
    <div class="activity-vital">
      <span class="activity-vital-value">{gainTotals.raids.toLocaleString()}</span>
      <span class="activity-vital-label">Raids</span>
    </div>
    <div class="activity-vital">
      <span class="activity-vital-value">{points(gainTotals.warPoints)}</span>
      <span class="activity-vital-label">War points</span>
    </div>
  </div>
  <div class="divider-gold divider-below"></div>

  {#if topGainers.length >= 3}
    <Podium max={5} entries={topGainers} label="Top gainers" />
  {/if}

  <section class="block" aria-label="Member gains">
    <SectionLabel meta="{progress.members.length} members · {activeCount} active">
      {#snippet children()}Gains ledger{/snippet}
    </SectionLabel>
    <LedgerTable
      columns={gainColumns}
      rows={progress.members}
      rowKey={(member) => member.player_uuid}
      defaultSort="playtime"
      bind:sortKey={gainsSortKey}
      maxHeight="640px"
    />
    {#if trackingNotes.length > 0}
      <p class="tracking-note">{trackingNotes.join(" · ")}</p>
    {/if}
  </section>
{:else}
  <DeferredPanel title="Data unavailable">
    {#snippet children()}Player statistics are temporarily unavailable - try again shortly.{/snippet}
  </DeferredPanel>
{/if}

{#await data.raidAnnouncement then announcement}
  {#if announcement}
    <div class="divider-gold"></div>
    <section class="block" aria-label="Weekly raid announcement">
      <WeeklyRaidAnnouncement {announcement} />
    </section>
  {/if}
{/await}

<style>
  .scope-row {
    margin-bottom: 28px;
  }

  .activity-vitals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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

  .tracking-note {
    margin: 12px 2px 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }
</style>
