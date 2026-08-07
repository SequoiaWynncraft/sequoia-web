<script lang="ts">
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import { webAuthStartUrl } from "$lib/site/webAuth";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import BarList from "$lib/design-system/components/BarList.svelte";
  import StackedColumns from "$lib/design-system/components/charts/StackedColumns.svelte";
  import ScopeChips from "$lib/design-system/components/ScopeChips.svelte";
  import DeferredPanel from "$lib/design-system/components/DeferredPanel.svelte";
  import { RAID_WINDOWS, raidWindowPreset } from "$lib/site/duration";
  import { KNOWN_RAIDS, raidSeriesFor } from "$lib/site/raids";

  let { data } = $props();

  const stats = $derived(data.stats);
  const customWindow = $derived(data.customWindow);
  const signInUrl = $derived(webAuthStartUrl());

  /** The window a bare URL resolves to, so its chip link can stay clean. */
  const DEFAULT_WINDOW = "7d";

  const windowScopes = RAID_WINDOWS.map((window) => ({ key: window.key, label: window.label }));
  /** Preset the current timeframe names, or null when it is custom or an event. */
  const activePreset = $derived(
    data.selectedEvent ? null : raidWindowPreset(data.windowInput ?? ""),
  );
  const activeWindow = $derived(activePreset?.key ?? "");
  /** A typed window that is not one of the presets, so the disclosure opens on it. */
  const customActive = $derived(
    !data.selectedEvent && data.windowInput !== "" && activePreset === null,
  );

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

  /** Link for a timeframe chip, keeping the raid filter and dropping any event. */
  function windowHref(key: string): string {
    const params = new URLSearchParams();
    if (key !== DEFAULT_WINDOW) params.set("window", key);
    if (data.selectedRaid) params.set("raid", data.selectedRaid);
    const query = params.toString();
    return query ? `?${query}` : "?";
  }

  /** Link for a raid chip, preserving whichever timeframe currently drives the board. */
  function raidHref(key: string): string {
    const params = new URLSearchParams();
    if (data.selectedEvent) {
      params.set("event", data.selectedEvent.id);
    } else if (data.windowInput && data.windowInput !== DEFAULT_WINDOW) {
      params.set("window", data.windowInput);
    }
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
      avatarAlt: (entry) => (entry.insignia ? `${entry.insignia.toLowerCase()} insignia` : null),
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

  /** What the board is scoped to: an explicit range, a duration, or an event. */
  const boardTitle = $derived.by(() => {
    if (customWindow?.kind === "range") {
      return `${formatDate(customWindow.from)} – ${formatDate(customWindow.to)}`;
    }
    if (customWindow) return `Last ${activePreset?.label ?? customWindow.label}`;
    return data.selectedEvent?.name ?? "Contributions";
  });

  /** The resolved dates behind that scope, plus how it was tracked. */
  const boardMeta = $derived.by(() => {
    if (customWindow?.kind === "range") return "in-game tracked";
    if (customWindow) {
      return `${formatDate(customWindow.from)} – ${formatDate(customWindow.to)} · in-game tracked`;
    }
    const event = data.selectedEvent;
    if (!event) return undefined;
    const tracked = event.tracking === "mod" ? " · in-game tracked" : "";
    return `${formatDate(event.starts_at)} – ${formatDate(event.ends_at)}${tracked}`;
  });
</script>

<StatsHeader
  kicker="Guilds"
  title="Raid"
  lead="Sequoia's raid completions: guild totals, the last two weeks of daily activity, and member contributions over any timeframe or event."
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
        <span class="raid-vital-label">Most in guild · {(topRaider.raids_total ?? 0).toLocaleString()} completions</span>
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
{:else}
  <DeferredPanel title="Data unavailable">
    {#snippet children()}Guild statistics are temporarily unavailable. Try again shortly.{/snippet}
  </DeferredPanel>
{/if}

<section class="block" aria-label="Daily raid activity">
  <SectionLabel meta="last 14 days, UTC">
    {#snippet children()}Daily activity{/snippet}
  </SectionLabel>
  {#await data.activity}
    <p class="muted">Loading recent activity…</p>
  {:then activity}
    {#if activity === null}
      <p class="muted">The daily activity feed is temporarily unavailable.</p>
    {:else if activity.length === 0}
      <p class="muted">No raid activity recorded yet. The feed is still collecting.</p>
    {:else}
      <StackedColumns series={activitySeries(activity)} columns={activityColumns(activity)} height={190} />
      {#if activity.length < 3}
        <p class="muted accumulating">Daily history is still accumulating. Recording started in July 2026.</p>
      {/if}
    {/if}
  {:catch}
    <p class="muted">The daily activity feed is temporarily unavailable.</p>
  {/await}
</section>

<section class="block" aria-label="Member contributions">
  <SectionLabel meta={boardMeta}>
    {#snippet children()}{boardTitle}{/snippet}
  </SectionLabel>

  <div class="board-controls">
    <div class="control-group">
      <span class="control-label">Timeframe</span>
      <ScopeChips
        scopes={windowScopes}
        active={activeWindow}
        href={windowHref}
        label="Timeframe"
        note={data.selectedEvent ? "An event is driving the board" : null}
      />
    </div>
    {#if data.raidFilterAvailable}
      <div class="control-group">
        <span class="control-label">Raid</span>
        <ScopeChips scopes={raidScopes} active={activeRaid} href={raidHref} label="Raid filter" />
      </div>
    {/if}
  </div>

  <details class="timeframe-custom" open={data.windowInvalid || customActive}>
    <summary class="timeframe-summary">Custom range</summary>
    <form class="timeframe-form" method="GET" action="/statistics/guilds/raid">
      {#if data.selectedRaid}
        <input type="hidden" name="raid" value={data.selectedRaid} />
      {/if}
      <div class="timeframe-row">
        <label class="timeframe-label" for="raid-window">Duration or timestamp range</label>
        <div class="timeframe-field">
          <input
            class="timeframe-input"
            class:invalid={data.windowInvalid}
            id="raid-window"
            type="text"
            name="window"
            placeholder="e.g. 0.5d"
            value={customActive ? data.windowInput : ""}
            aria-invalid={data.windowInvalid}
            aria-describedby="raid-window-help"
            autocomplete="off"
            spellcheck="false"
          />
          <button class="timeframe-submit" type="submit">Show</button>
        </div>
      </div>
    </form>
    <p class="muted timeframe-help" id="raid-window-help">
      Durations: <code>20min</code>, <code>7h</code>, <code>0.5d</code>, <code>1m</code>, up to
      366 days. Exact range: <code>t:1784109600-1784282400</code>, in Unix seconds. An end in the
      future is clamped to now.
    </p>
    {#if data.windowInvalid}
      <p class="muted error timeframe-note">
        {#if data.windowError}
          {data.windowError}
        {:else}
          Couldn't read "{data.windowInput}". Try a duration like <code>20min</code> or <code>7h</code>,
          or a <code>t:</code> timestamp range.
        {/if}
      </p>
    {:else if customActive}
      <a class="timeframe-clear" href={windowHref(DEFAULT_WINDOW)}>Back to 7 days</a>
    {/if}
  </details>

  {#if !data.viewer}
    <p class="muted"><a class="auth-link" href={signInUrl}>Sign in</a> to see member contributions{data.selectedEvent ? " for this event" : " for this timeframe"}.</p>
  {:else if data.membershipUnverified}
    <p class="muted">Membership can't be verified right now. Try again shortly.</p>
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
      maxHeight="min(72vh, 760px)"
    />
  {:else if customWindow}
    <p class="muted">
      No {activeRaidShort ? `${activeRaidShort} ` : ""}member raids were tracked
      {customWindow.kind === "range" ? "in this timeframe" : `in the last ${activePreset?.label ?? customWindow.label}`}.
    </p>
  {:else}
    <p class="muted">No raid deltas have been observed for this event yet.</p>
  {/if}
</section>

<section class="block" aria-label="Raid events">
  <SectionLabel meta="score the board over an event's window instead">
    {#snippet children()}Events{/snippet}
  </SectionLabel>
  {#if data.events.length > 0}
    <div class="event-stack">
      {#each data.events as event (event.id)}
        <a
          class="event-row"
          class:selected={!customWindow && data.selectedEvent?.id === event.id}
          aria-current={!customWindow && data.selectedEvent?.id === event.id ? "page" : undefined}
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

  .board-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 12px 32px;
    margin-bottom: 14px;
  }

  .control-group {
    display: flex;
    align-items: baseline;
    flex-wrap: wrap;
    gap: 10px;
  }

  .control-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .timeframe-custom {
    margin-bottom: 18px;
  }

  .timeframe-summary {
    width: fit-content;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
  }

  .timeframe-summary:hover {
    color: var(--color-gold);
  }

  .timeframe-summary:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .timeframe-label {
    flex: 0 0 auto;
    color: var(--text-muted);
    font-size: var(--text-xs);
    white-space: nowrap;
  }

  .timeframe-help {
    margin-top: 8px;
    max-width: 60ch;
    line-height: var(--leading-normal);
    font-size: var(--text-xs);
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
    margin-top: 12px;
  }

  /* Label and field share one row while they fit; the field's flex-basis makes
     it wrap underneath the label as a unit once space runs out. */
  .timeframe-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px 10px;
    max-width: 560px;
  }

  .timeframe-field {
    display: flex;
    flex: 1 1 240px;
    gap: 8px;
    min-width: 0;
    max-width: 420px;
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
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
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

  .event-stack {
    display: grid;
    /* min() so a 320px viewport shrinks the track instead of overflowing. */
    grid-template-columns: repeat(auto-fill, minmax(min(240px, 100%), 1fr));
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
</style>
