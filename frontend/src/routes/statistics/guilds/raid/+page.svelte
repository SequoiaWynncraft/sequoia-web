<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import BarList from "$lib/design-system/components/BarList.svelte";
  import StackedColumns from "$lib/design-system/components/charts/StackedColumns.svelte";
  import { raidSeriesFor } from "$lib/site/raids";

  let { data } = $props();

  const stats = $derived(data.stats);

  const rankLabels: Record<string, string> = {
    owner: "Owner",
    chief: "Chief",
    strategist: "Strategist",
    captain: "Captain",
    recruiter: "Recruiter",
    recruit: "Recruit",
  };

  /** Guild-wide totals per raid, summed from every member's per-raid counts. */
  const raidTotals = $derived.by(() => {
    if (!stats) return [];
    const totals = new Map<string, number>();
    for (const member of stats.members) {
      for (const [raid, count] of Object.entries(member.raids)) {
        totals.set(raid, (totals.get(raid) ?? 0) + count);
      }
    }
    const series = raidSeriesFor([...totals.keys()]);
    return series.map((raid) => ({
      label: raid.key,
      value: totals.get(raid.key) ?? 0,
      color: raid.color,
    }));
  });

  const topRaider = $derived.by(() => {
    if (!stats) return null;
    let best = null;
    for (const member of stats.members) {
      if (member.raids_total !== null && (best === null || member.raids_total > (best.raids_total ?? 0))) {
        best = member;
      }
    }
    return best;
  });

  const activitySeries = $derived.by(() => {
    if (!data.activity || data.activity.length === 0) return [];
    const names = new Set<string>();
    for (const day of data.activity) {
      for (const count of day.raid_counts) names.add(count.raid_name);
    }
    return raidSeriesFor([...names]).map((raid) => ({
      key: raid.key,
      label: raid.key,
      color: raid.color,
    }));
  });

  const activityColumns = $derived(
    (data.activity ?? []).map((day) => ({
      label: formatDay(day.day),
      values: Object.fromEntries(day.raid_counts.map((count) => [count.raid_name, count.count])),
    })),
  );

  const eventColumns: LedgerColumn<(typeof data.leaderboard)[number]>[] = [
    {
      key: "member",
      label: "Member",
      value: (entry) => entry.username,
      sortValue: (entry) => entry.username.toLowerCase(),
      secondary: (entry) => rankLabels[entry.rank] ?? entry.rank,
      href: (entry) => `/statistics/player/playercard?player=${encodeURIComponent(entry.username)}`,
    },
    {
      key: "raids",
      label: "Raids",
      numeric: true,
      value: (entry) => entry.raids.toLocaleString(),
      sortValue: (entry) => entry.raids,
    },
  ];

  function formatDay(value: string): string {
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(
      new Date(`${value}T00:00:00Z`),
    );
  }

  function formatDate(value: string): string {
    return new Intl.DateTimeFormat("en", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  }
</script>

<StatsHeader
  kicker="Guilds"
  title="Raid"
>
  {#snippet actions()}
    {#if data.me.authenticated}
      <span class="auth-note">Signed in as {data.me.username}</span>
    {:else}
      <a class="auth-link" href="/api/guild-raids/auth/start">Sign in</a>
    {/if}
  {/snippet}
</StatsHeader>

{#if stats}
  <div class="divider-gold"></div>
  <div class="raid-vitals">
    <div class="raid-vital">
      <span class="raid-vital-value">{stats.guild.raids.toLocaleString()}</span>
      <span class="raid-vital-label">Lifetime guild raids</span>
    </div>
    <div class="raid-vital">
      <span class="raid-vital-value">{raidTotals.reduce((sum, raid) => sum + raid.value, 0).toLocaleString()}</span>
      <span class="raid-vital-label">Member raid completions</span>
    </div>
    {#if topRaider}
      <div class="raid-vital">
        <span class="raid-vital-value raid-vital-name">{topRaider.username}</span>
        <span class="raid-vital-label">{(topRaider.raids_total ?? 0).toLocaleString()} completions — most in guild</span>
      </div>
    {/if}
  </div>
  <div class="divider-gold divider-below"></div>

  <section class="block" aria-label="Member raid completions by raid">
    <SectionLabel meta="lifetime, summed across current members">
      {#snippet children()}Completions by raid{/snippet}
    </SectionLabel>
    <BarList items={raidTotals} />
  </section>
{/if}

<section class="block" aria-label="Daily raid activity">
  <SectionLabel meta="last 14 days">
    {#snippet children()}Daily activity{/snippet}
  </SectionLabel>
  {#if data.activity === null}
    <p class="muted">The daily activity feed is temporarily unavailable.</p>
  {:else if activityColumns.length === 0}
    <p class="muted">No raid activity recorded in this window yet — the feed is collecting.</p>
  {:else}
    <StackedColumns series={activitySeries} columns={activityColumns} height={190} />
    {#if activityColumns.length < 3}
      <p class="muted accumulating">Daily history is accumulating — this feed started recording in July 2026.</p>
    {/if}
  {/if}
</section>

<div class="event-grid">
  <section class="block" aria-label="Raid events">
    <SectionLabel>
      {#snippet children()}Events{/snippet}
    </SectionLabel>
    {#if data.events.length > 0}
      <div class="event-stack">
        {#each data.events as event (event.id)}
          <a
            class="event-row"
            class:selected={data.selectedEvent?.id === event.id}
            href={`/statistics/guilds/raid?event=${event.id}`}
          >
            <span class="event-name">{event.name}</span>
            <time class="event-time">{formatDate(event.starts_at)} – {formatDate(event.ends_at)}</time>
          </a>
        {/each}
      </div>
    {:else}
      <p class="muted">No raid events are configured yet.</p>
    {/if}
  </section>

  <section class="block" aria-label="Event contribution leaderboard">
    <SectionLabel meta={data.selectedEvent ? `${formatDate(data.selectedEvent.starts_at)} – ${formatDate(data.selectedEvent.ends_at)}` : undefined}>
      {#snippet children()}{data.selectedEvent?.name ?? "Contribution"}{/snippet}
    </SectionLabel>
    {#if !data.me.authenticated}
      <p class="muted">Sign in with Wynncraft to view member raid contributions for this event.</p>
    {:else if data.leaderboardError}
      <p class="muted error">{data.leaderboardError}</p>
    {:else if data.leaderboard.length > 0}
      <LedgerTable
        columns={eventColumns}
        rows={data.leaderboard}
        rowKey={(entry) => entry.player_uuid}
        defaultSort="raids"
        maxHeight="480px"
      />
    {:else}
      <p class="muted">No raid deltas have been observed for this event yet.</p>
    {/if}
  </section>
</div>

<style>
  .auth-note {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .auth-link {
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    text-decoration: none;
  }

  .auth-link:hover {
    color: var(--color-gold-light);
  }

  .auth-link:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .raid-vitals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 20px;
    padding: 24px 8px;
  }

  .raid-vital {
    display: grid;
    gap: 4px;
  }

  .raid-vital-value {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-2xl);
    line-height: var(--leading-tight);
  }

  .raid-vital-name {
    color: var(--color-gold);
    font-size: var(--text-xl);
  }

  .raid-vital-label {
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

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .muted.error {
    color: var(--status-error);
  }

  .accumulating {
    margin-top: 10px;
    font-size: var(--text-xs);
  }

  .event-grid {
    display: grid;
    grid-template-columns: minmax(240px, 340px) minmax(0, 1fr);
    gap: 40px;
  }

  .event-stack {
    display: grid;
    gap: 8px;
  }

  .event-row {
    display: grid;
    gap: 5px;
    padding: 12px 14px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(19, 22, 31, 0.6);
    text-decoration: none;
    transition: border-color var(--dur-fast) ease, background var(--dur-fast) ease;
  }

  .event-row:hover,
  .event-row.selected {
    border-color: rgba(245, 197, 66, 0.45);
    background: rgba(245, 197, 66, 0.05);
  }

  .event-row:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .event-name {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .event-time {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  @media (max-width: 860px) {
    .event-grid {
      grid-template-columns: 1fr;
      gap: 0;
    }
  }
</style>
