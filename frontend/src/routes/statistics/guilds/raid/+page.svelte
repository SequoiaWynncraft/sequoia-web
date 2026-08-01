<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import { webAuthStartUrl } from "$lib/site/webAuth";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import BarList from "$lib/design-system/components/BarList.svelte";
  import StackedColumns from "$lib/design-system/components/charts/StackedColumns.svelte";
  import ScopeChips from "$lib/design-system/components/ScopeChips.svelte";
  import { KNOWN_RAIDS, raidSeriesFor } from "$lib/site/raids";
  import { insigniaLabel } from "$lib/site/honours";

  let { data } = $props();

  const stats = $derived(data.stats);
  const customWindow = $derived(data.customWindow);
  const signInUrl = $derived(webAuthStartUrl());

  /** Raid filter chips for the timeframe board: "all" plus each known raid. */
  const raidScopes = [
    { key: "all", label: "All" },
    ...KNOWN_RAIDS.map((raid) => ({ key: raid.key, label: raid.short })),
  ];
  const activeRaid = $derived(data.selectedRaid ?? "all");
  /** Short label of the active raid, for empty-state copy. */
  const activeRaidShort = $derived(
    KNOWN_RAIDS.find((raid) => raid.key === data.selectedRaid)?.short ?? null,
  );

  /** Link for a raid chip, preserving the active timeframe and clearing "all". */
  function raidHref(key: string): string {
    const params = new URLSearchParams();
    if (data.windowInput && data.windowInput !== "7d") params.set("window", data.windowInput);
    if (key !== "all") params.set("raid", key);
    const query = params.toString();
    return query ? `?${query}` : "?";
  }

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

  type ActivityDays = NonNullable<Awaited<typeof data.activity>>;

  function activitySeries(activity: ActivityDays) {
    const names = new Set<string>();
    for (const day of activity) {
      for (const count of day.raid_counts) names.add(count.raid_name);
    }
    return raidSeriesFor([...names]).map((raid) => ({
      key: raid.key,
      label: raid.key,
      color: raid.color,
    }));
  }

  function activityColumns(activity: ActivityDays) {
    return activity.map((day) => ({
      label: formatDay(day.day),
      values: Object.fromEntries(day.raid_counts.map((count) => [count.raid_name, count.count])),
    }));
  }

  const eventColumns: LedgerColumn<(typeof data.leaderboard)[number]>[] = [
    {
      key: "member",
      label: "Member",
      nameStyle: true,
      value: (entry) => entry.username,
      sortValue: (entry) => entry.username.toLowerCase(),
      avatar: (entry) => entry.insigniaUrl ?? null,
      avatarAlt: (entry) => (entry.insignia ? insigniaLabel(entry.insignia) : null),
      secondary: (entry) => entry.progressionRank ?? null,
      secondaryColor: (entry) => entry.progressionRankColor ?? null,
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
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" }).format(
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
/>

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
        <span class="raid-vital-label">{(topRaider.raids_total ?? 0).toLocaleString()} completions - most in guild</span>
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
  {#await data.activity}
    <p class="muted">Loading recent activity…</p>
  {:then activity}
    {#if activity === null}
      <p class="muted">The daily activity feed is temporarily unavailable.</p>
    {:else if activity.length === 0}
      <p class="muted">No raid activity recorded in this window yet - the feed is collecting.</p>
    {:else}
      <StackedColumns series={activitySeries(activity)} columns={activityColumns(activity)} height={190} />
      {#if activity.length < 3}
        <p class="muted accumulating">Daily history is accumulating - this feed started recording in July 2026.</p>
      {/if}
    {/if}
  {/await}
</section>

<div class="event-grid">
  <section class="block" aria-label="Raid events">
    <SectionLabel>
      {#snippet children()}Timeframe{/snippet}
    </SectionLabel>
    <p class="muted timeframe-help">
      Enter a timeframe. Use <code>min</code> (minutes), <code>h</code> (hours),
      <code>d</code> (days), or <code>m</code> (months) — e.g. <code>20min</code>,
      <code>7h</code>, <code>0.5d</code>, <code>1m</code>. Or enter a Unix-timestamp
      range prefixed with <code>t:</code>, like <code>t:1784109600-1784282400</code>,
      to set an explicit start and end — timestamps are in seconds (not
      milliseconds), and an end past now is clamped to now.
    </p>
    <form class="timeframe-form" method="GET" action="/statistics/guilds/raid">
      {#if data.selectedRaid}
        <input type="hidden" name="raid" value={data.selectedRaid} />
      {/if}
      <input
        class="timeframe-input"
        class:invalid={data.windowInvalid}
        type="text"
        name="window"
        placeholder="e.g. 0.5d"
        value={data.windowInput}
        aria-label="Custom raid timeframe"
        aria-invalid={data.windowInvalid}
        autocomplete="off"
        spellcheck="false"
      />
      <button class="timeframe-submit" type="submit">Show</button>
    </form>
    {#if data.windowInvalid}
      <p class="muted error timeframe-note">
        {#if data.windowError}
          {data.windowError}
        {:else}
          Couldn't read "{data.windowInput}". Try a duration like <code>20min</code> or <code>7h</code>,
          or a <code>t:</code> timestamp range.
        {/if}
      </p>
    {:else if data.customWindow && !data.windowIsDefault}
      <a class="timeframe-clear" href="/statistics/guilds/raid">Clear timeframe</a>
    {/if}

    <div class="events-heading">
      <SectionLabel>
        {#snippet children()}Events{/snippet}
      </SectionLabel>
    </div>
    {#if data.events.length > 0}
      <div class="event-stack">
        {#each data.events as event (event.id)}
          <a
            class="event-row"
            class:selected={!customWindow && data.selectedEvent?.id === event.id}
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
    {#if customWindow && customWindow.kind === "range"}
      <SectionLabel meta="in-game tracked">
        {#snippet children()}{formatDate(customWindow.from)} – {formatDate(customWindow.to)}{/snippet}
        {#snippet actions()}
          <ScopeChips scopes={raidScopes} active={activeRaid} href={raidHref} label="Raid filter" />
        {/snippet}
      </SectionLabel>
    {:else if customWindow}
      <SectionLabel meta={`${formatDate(customWindow.from)} – ${formatDate(customWindow.to)} · in-game tracked`}>
        {#snippet children()}Last {customWindow.label}{/snippet}
        {#snippet actions()}
          <ScopeChips scopes={raidScopes} active={activeRaid} href={raidHref} label="Raid filter" />
        {/snippet}
      </SectionLabel>
    {:else}
      <SectionLabel meta={data.selectedEvent ? `${formatDate(data.selectedEvent.starts_at)} – ${formatDate(data.selectedEvent.ends_at)}${data.selectedEvent.tracking === "mod" ? " · in-game tracked" : ""}` : undefined}>
        {#snippet children()}{data.selectedEvent?.name ?? "Contribution"}{/snippet}
      </SectionLabel>
    {/if}
    {#if !data.viewer}
      <p class="muted"><a class="auth-link" href={signInUrl}>Sign in</a> to see member contributions{customWindow ? " for this timeframe" : " for this event"}.</p>
    {:else if data.membershipUnverified}
      <p class="muted">Membership can't be verified right now - try again shortly.</p>
    {:else if !data.isMember}
      <p class="muted">Contributions are visible to current Sequoia members.</p>
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
    {:else if customWindow}
      <p class="muted">
        No {activeRaidShort ? `${activeRaidShort} ` : ""}member raids were tracked
        {customWindow.kind === "range" ? "in this timeframe" : `in the last ${customWindow.label}`}.
      </p>
    {:else}
      <p class="muted">No raid deltas have been observed for this event yet.</p>
    {/if}
  </section>
</div>

<style>
  .auth-link {
    color: var(--color-gold);
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

  .timeframe-help {
    margin-bottom: 12px;
    line-height: var(--leading-normal);
  }

  .timeframe-help code {
    padding: 1px 5px;
    border-radius: 3px;
    background: rgba(245, 197, 66, 0.08);
    color: var(--color-gold-light);
    font-family: var(--font-data);
    font-size: 0.85em;
  }

  .timeframe-form {
    display: flex;
    gap: 8px;
  }

  .timeframe-input {
    flex: 1;
    min-width: 0;
    padding: 9px 12px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(19, 22, 31, 0.6);
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-sm);
  }

  .timeframe-input:focus-visible {
    border-color: rgba(245, 197, 66, 0.55);
    outline: none;
  }

  .timeframe-input.invalid {
    border-color: var(--status-error);
  }

  .timeframe-submit {
    padding: 9px 16px;
    border: 1px solid rgba(245, 197, 66, 0.45);
    background: rgba(245, 197, 66, 0.08);
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    cursor: pointer;
    transition: background var(--dur-fast) ease, border-color var(--dur-fast) ease;
  }

  .timeframe-submit:hover {
    border-color: rgba(245, 197, 66, 0.7);
    background: rgba(245, 197, 66, 0.14);
  }

  .timeframe-submit:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .timeframe-note {
    margin-top: 8px;
  }

  .timeframe-clear {
    display: inline-block;
    margin-top: 8px;
    color: var(--text-muted);
    font-size: var(--text-xs);
    text-decoration: none;
  }

  .timeframe-clear:hover {
    color: var(--color-gold);
  }

  .events-heading {
    margin-top: 28px;
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
