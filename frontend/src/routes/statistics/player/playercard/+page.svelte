<script lang="ts">
  import { goto } from "$app/navigation";
  import StatsHeader from "$lib/components/StatsHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import BarList from "$lib/design-system/components/BarList.svelte";
  import DeferredPanel from "$lib/design-system/components/DeferredPanel.svelte";
  import ScopeChips from "$lib/design-system/components/ScopeChips.svelte";
  import DailyBars from "$lib/design-system/components/charts/DailyBars.svelte";
  import { raidSeriesFor } from "$lib/site/raids";
  import { tierColor } from "$lib/site/rankColors";
  import { nmsrFullBodyIso } from "$lib/site/nmsr";
  import type { PlayerCardResponse } from "$lib/api/playerCard";
  import type { PlayerSeriesResponse } from "$lib/api/playerSeries";
  import { insigniaLabel } from "$lib/site/honours";

  let { data } = $props();

  // svelte-ignore state_referenced_locally — seeded here, kept in sync by the effect below
  let query = $state(data.player);
  $effect(() => {
    query = data.player;
  });

  /** How many names the dropdown offers — enough to be useful, never the whole roster. */
  const MAX_SUGGESTIONS = 10;

  const suggestions = $derived.by(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return [];
    return data.memberNames.filter((name) => name.toLowerCase().includes(needle)).slice(0, MAX_SUGGESTIONS);
  });

  let copied = $state(false);

  function search(event: SubmitEvent) {
    event.preventDefault();
    const name = query.trim();
    if (name) void goto(`?player=${encodeURIComponent(name)}`, { keepFocus: true });
  }

  function raidBars(card: PlayerCardResponse) {
    const series = raidSeriesFor(Object.keys(card.raids));
    return series.map((raid) => ({
      label: raid.key,
      value: card.raids[raid.key] ?? 0,
      color: raid.color,
    }));
  }

  /** Meta line for the Raids section: lifetime total, plus the Sequoia share when known. */
  function raidsMeta(card: PlayerCardResponse): string {
    const total = `${(card.raids_total ?? 0).toLocaleString()} total`;
    if (card.current_guild_raids === null) return total;
    return `${total} · ${card.current_guild_raids.toLocaleString()} in SEQ`;
  }


  const CLASS_LABELS: Record<string, string> = {
    WARRIOR: "Warrior",
    ARCHER: "Archer",
    ASSASSIN: "Assassin",
    MAGE: "Mage",
    SHAMAN: "Shaman",
  };

  function classLabel(character: { type: string; reskin: string | null }): string {
    if (character.reskin) return character.reskin[0] + character.reskin.slice(1).toLowerCase();
    return CLASS_LABELS[character.type] ?? character.type;
  }

  function formatDate(value: string | null): string {
    if (!value) return "-";
    return new Intl.DateTimeFormat("en", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(
      new Date(value),
    );
  }

  function notableRankings(card: PlayerCardResponse): { label: string; position: number }[] {
    return Object.entries(card.rankings)
      .filter(([, position]) => position <= 100)
      .sort((a, b) => a[1] - b[1])
      .slice(0, 6)
      .map(([slug, position]) => ({ label: prettifySlug(slug), position }));
  }

  function prettifySlug(slug: string): string {
    return slug
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/^./, (letter) => letter.toUpperCase())
      .replace(/ Sr /g, " SR ");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      copied = false;
    }
  }

  // Tracking chart: one full-history series, sliced client-side per metric and range.
  const METRICS = [
    { key: "playtime", label: "playtime" },
    { key: "wars", label: "wars" },
    { key: "raids", label: "raids" },
    { key: "war_points", label: "war points" },
  ];
  const METRIC_META: Record<string, { label: string; unit: string; decimals: number; since: keyof PlayerSeriesResponse["data_since"] }> = {
    playtime: { label: "Playtime", unit: " h", decimals: 0, since: "activity" },
    wars: { label: "Wars", unit: "", decimals: 0, since: "activity" },
    raids: { label: "Raids", unit: "", decimals: 0, since: "raids" },
    war_points: { label: "War points", unit: "", decimals: 1, since: "war_points" },
  };
  const TRACK_RANGES = [
    { key: "1w", label: "1w" },
    { key: "1m", label: "1m" },
    { key: "3m", label: "3m" },
    { key: "6m", label: "6m" },
    { key: "all", label: "all" },
  ];
  const RANGE_DAYS: Record<string, number> = { "1w": 7, "1m": 30, "3m": 91, "6m": 182, all: 399 };

  let metric = $state("playtime");
  let trackRange = $state("1m");

  function trackWindow(series: PlayerSeriesResponse): { from: string; to: string } {
    const to = series.to;
    const from = new Date(
      Date.parse(`${to}T00:00:00Z`) - (RANGE_DAYS[trackRange] - 1) * 24 * 60 * 60 * 1000,
    )
      .toISOString()
      .slice(0, 10);
    return { from: from < series.from ? series.from : from, to };
  }

  function trackPoints(series: PlayerSeriesResponse, from: string): { day: string; value: number }[] {
    return series.days
      .filter((day) => day.day >= from)
      .map((day) => ({
        day: day.day,
        value:
          metric === "playtime"
            ? day.playtime_hours
            : metric === "wars"
              ? day.wars
              : metric === "raids"
                ? day.raids
                : day.war_points,
      }));
  }

  function trackCaption(series: PlayerSeriesResponse, from: string): string | null {
    const meta = METRIC_META[metric];
    const since = series.data_since[meta.since];
    return since > from ? `${meta.label} tracked since ${formatDate(since)}` : null;
  }
</script>

<StatsHeader
  kicker="Player"
  title="Playercard"
/>

<form class="search" onsubmit={search} role="search" aria-label="Find a member">
  <input
    class="search-input"
    type="search"
    name="player"
    list="member-names"
    placeholder="Search a member…"
    autocomplete="off"
    bind:value={query}
  />
  <datalist id="member-names">
    {#each suggestions as name (name)}
      <option value={name}></option>
    {/each}
  </datalist>
  <button class="search-button" type="submit">Look up</button>
</form>

{#if !data.player}
  <p class="hint">Pick a member to render their playercard - stats, characters, and standings.</p>
{:else}
  {#await data.result}
    <div class="card card-loading slot-bevel" aria-label="Loading playercard">
      <span class="loading-label">Rendering {data.player}…</span>
    </div>
  {:then result}
    {#if result && result.ok && result.card}
      {@const card = result.card}
      {@const honours = result.honours}
      <article class="card slot-bevel" aria-label="{card.username}'s playercard">
        <div class="card-render">
          <img
            src={nmsrFullBodyIso(card.uuid, 260)}
            alt="{card.username}'s full-body skin render"
            loading="lazy"
          />
        </div>

        <div class="card-body">
          <header class="card-head">
            <div>
              <h2 class="card-name">{card.username}</h2>
              <p class="card-tags">
                {#if honours.rank}
                  <span
                    class="tag"
                    class:tag-gold={!honours.rankColor}
                    style:color={honours.rankColor ?? undefined}
                  >
                    {honours.rank.toLowerCase()}
                  </span>
                {/if}
                {#if honours.insignia}
                  {@const label = insigniaLabel(honours.insignia.tier)}
                  {#if honours.insignia.assetUrl}
                    <img
                      class="insignia-icon"
                      src={honours.insignia.assetUrl}
                      alt={label}
                      title={label}
                    />
                  {:else}
                    <span class="insignia" style="--tier-color:{tierColor(honours.insignia.tier)}">
                      ◆ {label}
                    </span>
                  {/if}
                {/if}
                {#if card.guild_rank}
                  <span class="tag" class:tag-gold={!honours.rank}>
                    {card.guild_rank.toLowerCase()} {card.guild_rank_stars ?? ""}
                  </span>
                {/if}
                {#if honours.leadership}<span class="tag">{honours.leadership.toLowerCase()}</span>{/if}
                {#if card.support_rank}<span class="tag">{card.support_rank}</span>{/if}
                {#if card.veteran}<span class="tag">veteran</span>{/if}
              </p>
            </div>
            <button class="copy-button" type="button" onclick={copyLink}>
              {copied ? "Copied" : "Copy link"}
            </button>
          </header>

          <dl class="meta">
            <div class="meta-row"><dt>First joined Wynncraft</dt><dd>{formatDate(card.first_join)}</dd></div>
            <div class="meta-row"><dt>Joined Sequoia</dt><dd>{formatDate(card.guild_joined)}</dd></div>
            <div class="meta-row">
              <dt>Last seen</dt>
              <dd>
                {#if card.online === true}
                  <span class="online-now">Online now{card.server ? ` · ${card.server}` : ""}</span>
                {:else}
                  {formatDate(card.last_join)}
                {/if}
              </dd>
            </div>
            <div class="meta-row"><dt>Playtime</dt><dd>{card.playtime === null ? "-" : `${Math.round(card.playtime).toLocaleString()} h`}</dd></div>
            {#if honours.branches.length > 0}
              <div class="meta-row"><dt>Branches</dt><dd>{honours.branches.join(" · ")}</dd></div>
            {/if}
          </dl>

          <div class="stat-grid">
            {#each [
              ["Wars", card.wars],
              ["Total level", card.total_level],
              ["Quests", card.quests],
              ["Dungeons", card.dungeons_total],
              ["Content", card.content_completion],
              ["Chests", card.chests_found],
            ] as [label, value] (label)}
              <div class="stat-cell">
                <span class="stat-value">{value === null ? "-" : Number(value).toLocaleString()}</span>
                <span class="stat-label">{label}</span>
              </div>
            {/each}
          </div>

          {#await result.series then series}
            {#if series && series.days.length > 0}
              {@const window = trackWindow(series)}
              <div class="card-section">
                <SectionLabel meta="{formatDate(window.from)} to {formatDate(window.to)}">
                  {#snippet children()}Tracking{/snippet}
                </SectionLabel>
                <div class="track-controls">
                  <ScopeChips
                    scopes={METRICS}
                    active={metric}
                    onselect={(key) => (metric = key)}
                    label="Tracked metric"
                  />
                  <ScopeChips
                    scopes={TRACK_RANGES}
                    active={trackRange}
                    onselect={(key) => (trackRange = key)}
                    label="Tracking range"
                  />
                </div>
                <DailyBars
                  points={trackPoints(series, window.from)}
                  from={window.from}
                  to={window.to}
                  metricLabel={METRIC_META[metric].label}
                  unit={METRIC_META[metric].unit}
                  decimals={METRIC_META[metric].decimals}
                  height={150}
                  caption={trackCaption(series, window.from)}
                />
              </div>
            {/if}
          {/await}

          {#if honours.badges.length > 0 || honours.warHonours.length > 0}
            <div class="card-section">
              <SectionLabel meta="{honours.badges.length + honours.warHonours.length} awarded">
                {#snippet children()}Honours{/snippet}
              </SectionLabel>
              <!-- One row per honour category — future awards slot in as rows. -->
              {#if honours.warHonours.length > 0}
                <div class="honour-row">
                  <span class="honour-label">War honours</span>
                  <div class="badges">
                    {#each honours.warHonours as honour (honour.tier)}
                      <span class="tag tag-badge" style="--tier-color:{tierColor(honour.tier)}">
                        {honour.tier.toLowerCase()}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
              {#if honours.badges.length > 0}
                <div class="honour-row">
                  <span class="honour-label">Event badges</span>
                  <div class="badges">
                    {#each honours.badges as badge (badge.type + badge.tier)}
                      <span class="tag tag-badge" style="--tier-color:{tierColor(badge.tier)}">
                        <img class="badge-icon" src={badge.assetUrl} alt="" loading="lazy" />
                        {badge.type} · {badge.tier.toLowerCase()}
                      </span>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {/if}

          {#if Object.keys(card.raids).length > 0}
            <div class="card-section">
              <SectionLabel meta={raidsMeta(card)}>
                {#snippet children()}Raids{/snippet}
              </SectionLabel>
              <BarList items={raidBars(card)} />
            </div>
          {/if}

          {#if card.characters.length > 0}
            <div class="card-section">
              <SectionLabel meta="{card.characters.length} characters">
                {#snippet children()}Characters{/snippet}
              </SectionLabel>
              <div class="characters">
                {#each card.characters as character, index (index)}
                  <span class="character">
                    <span class="character-class">{classLabel(character)}</span>
                    <span class="character-level">lv {character.level}</span>
                    {#each character.gamemodes as mode (mode)}
                      <span class="character-mode">{mode}</span>
                    {/each}
                  </span>
                {/each}
              </div>
            </div>
          {/if}

          {#if notableRankings(card).length > 0}
            <div class="card-section">
              <SectionLabel>
                {#snippet children()}Leaderboard standings{/snippet}
              </SectionLabel>
              <div class="rankings">
                {#each notableRankings(card) as ranking (ranking.label)}
                  <span class="ranking" class:ranking-first={ranking.position === 1}>
                    <span class="ranking-position">#{ranking.position}</span>
                    {ranking.label}
                  </span>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      </article>
    {:else if result}
      <DeferredPanel title="No card to render">
        {#snippet children()}{result.error}{/snippet}
      </DeferredPanel>
    {/if}
  {/await}
{/if}

<style>
  .search {
    display: flex;
    gap: 10px;
    max-width: 480px;
    margin-bottom: 28px;
  }

  .search-input {
    flex: 1;
    padding: 10px 14px;
    border: 1px solid var(--color-border-accent);
    background: var(--color-surface);
    color: var(--text-heading);
    font-family: var(--font-body);
    font-size: var(--text-sm);
  }

  .search-input:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .search-button {
    padding: 10px 18px;
    border: 1px solid rgba(245, 197, 66, 0.4);
    background: rgba(245, 197, 66, 0.08);
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
    transition: background var(--dur-fast) ease;
  }

  .search-button:hover {
    background: rgba(245, 197, 66, 0.16);
  }

  .search-button:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .hint {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .card {
    display: grid;
    grid-template-columns: minmax(200px, 280px) minmax(0, 1fr);
    gap: 32px;
    padding: 28px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(26, 29, 42, 0.6);
  }

  .card-loading {
    min-height: 320px;
    place-items: center;
  }

  .loading-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    animation: seq-pulse-dot 1.5s ease-in-out infinite;
  }

  .card-render {
    display: grid;
    place-items: start center;
  }

  .card-render img {
    width: 100%;
    max-width: 260px;
    height: auto;
    image-rendering: pixelated;
  }

  .card-body {
    min-width: 0;
  }

  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 16px;
    margin-bottom: 18px;
  }

  .card-name {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-3xl);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
  }

  .card-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 10px 0 0;
  }

  .tag {
    padding: 3px 9px;
    border: 1px solid var(--color-border-subtle);
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .tag-gold {
    border-color: rgba(245, 197, 66, 0.4);
    color: var(--color-gold);
  }

  .insignia {
    padding: 3px 2px;
    color: var(--tier-color);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .insignia-icon {
    width: 22px;
    height: 22px;
    align-self: center;
    image-rendering: pixelated;
  }

  .tag-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    border-color: color-mix(in srgb, var(--tier-color) 45%, transparent);
    color: var(--tier-color);
  }

  .badge-icon {
    width: 16px;
    height: 16px;
    image-rendering: pixelated;
  }

  .honour-row {
    display: grid;
    gap: 10px;
  }

  .honour-row + .honour-row {
    margin-top: 14px;
  }

  .honour-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .badges {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .online-now {
    color: var(--status-online);
  }

  .copy-button {
    flex-shrink: 0;
    padding: 8px 14px;
    border: 1px solid var(--color-border-accent);
    background: none;
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    cursor: pointer;
    transition: color var(--dur-fast) ease, border-color var(--dur-fast) ease;
  }

  .copy-button:hover {
    border-color: rgba(245, 197, 66, 0.4);
    color: var(--color-gold);
  }

  .copy-button:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .meta {
    margin: 0 0 20px;
  }

  .meta-row {
    display: flex;
    justify-content: space-between;
    gap: 16px;
    padding: 9px 2px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .meta-row dt {
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  .meta-row dd {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .stat-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(100px, 1fr));
    gap: 14px 10px;
    margin-bottom: 24px;
  }

  .stat-cell {
    display: grid;
    gap: 2px;
    padding: 10px;
    background: rgba(19, 22, 31, 0.6);
    box-shadow: var(--bevel-slot);
  }

  .stat-value {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-lg);
  }

  .stat-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .card-section {
    margin-bottom: 24px;
  }

  .track-controls {
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px 24px;
    margin-bottom: 14px;
  }

  .characters {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .character {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 11px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(19, 22, 31, 0.6);
  }

  .character-class {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .character-level {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  .character-mode {
    color: var(--color-enchant);
    font-family: var(--font-display);
    font-size: 0.6rem;
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .rankings {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .ranking {
    display: inline-flex;
    align-items: baseline;
    gap: 8px;
    padding: 6px 11px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(19, 22, 31, 0.6);
    color: var(--text-body);
    font-size: var(--text-xs);
  }

  .ranking-position {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-xs);
  }

  .ranking-first {
    border-color: rgba(245, 197, 66, 0.35);
  }

  .ranking-first .ranking-position {
    color: var(--color-gold);
  }

  @media (max-width: 760px) {
    .card {
      grid-template-columns: 1fr;
    }

    .card-render {
      place-items: center;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .loading-label {
      animation: none;
    }
  }
</style>
