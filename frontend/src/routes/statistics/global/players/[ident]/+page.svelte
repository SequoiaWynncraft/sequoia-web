<script lang="ts">
  import StatsHeader from "#lib/components/StatsHeader.svelte";
  import SectionLabel from "#lib/design-system/components/SectionLabel.svelte";
  import BarList from "#lib/design-system/components/BarList.svelte";
  import ScopeChips from "#lib/design-system/components/ScopeChips.svelte";
  import DailyBars from "#lib/design-system/components/charts/DailyBars.svelte";
  import { raidSeriesFor } from "#lib/site/raids.js";
  import { nmsrFullBodyIso } from "#lib/site/nmsr.js";
  import type { PlayerCardResponse } from "#lib/api/playerCard.js";
  import type { PlayerSeriesResponse } from "#lib/api/playerSeries.js";

  let { data } = $props();

  const card = $derived(data.card);

  function formatDate(value: string | null): string {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("en-GB", {
      year: "numeric",
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  }

  function raidBars(current: PlayerCardResponse) {
    const series = raidSeriesFor(Object.keys(current.raids));
    return series.map((raid) => ({
      label: raid.short,
      value: current.raids[raid.key] ?? 0,
      color: raid.color,
    }));
  }

  function prettifySlug(slug: string): string {
    return slug
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replaceAll("Sr ", "SR ")
      .toLowerCase();
  }

  function notableRankings(current: PlayerCardResponse): { label: string; position: number }[] {
    return Object.entries(current.rankings)
      .filter(([, position]) => position <= 100)
      .map(([slug, position]) => ({ label: prettifySlug(slug), position }))
      .sort((a, b) => a.position - b.position)
      .slice(0, 12);
  }

  const METRICS = [
    { key: "playtime", label: "playtime" },
    { key: "wars", label: "wars" },
    { key: "raids", label: "raids" },
  ];
  const METRIC_META: Record<
    string,
    { label: string; unit: string; decimals: number; since: keyof PlayerSeriesResponse["data_since"] }
  > = {
    playtime: { label: "Playtime", unit: " h", decimals: 0, since: "activity" },
    wars: { label: "Wars", unit: "", decimals: 0, since: "activity" },
    raids: { label: "Raids", unit: "", decimals: 0, since: "raids" },
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
        value: metric === "playtime" ? day.playtime_hours : metric === "wars" ? day.wars : day.raids,
      }));
  }

  function trackCaption(series: PlayerSeriesResponse, from: string): string | null {
    const meta = METRIC_META[metric];
    const since = series.data_since[meta.since];
    return since > from ? `${meta.label} tracked since ${formatDate(since)}` : null;
  }

  const vitals = $derived([
    { label: "Total level", value: card.total_level },
    { label: "Playtime", value: card.playtime === null ? null : Math.round(card.playtime), unit: " h" },
    { label: "Wars", value: card.wars },
    { label: "Guild raids", value: card.raids_total },
    { label: "Dungeons", value: card.dungeons_total },
    { label: "Quests", value: card.quests },
  ]);
</script>

<StatsHeader kicker="Global · Player" title={card.username} />

<article class="profile slot-bevel" aria-label="{card.username}'s profile">
  <div class="profile-render">
    <img
      src={nmsrFullBodyIso(card.uuid, 260)}
      alt="{card.username}'s full-body skin render"
      loading="lazy"
    />
  </div>

  <div class="profile-body">
    <p class="profile-tags">
      {#if card.guild_name}
        <a class="tag tag-gold" href={`/statistics/global/guilds/${encodeURIComponent(card.guild_name)}`}>
          {card.guild_name}{card.guild_prefix ? ` [${card.guild_prefix}]` : ""}
        </a>
        {#if card.guild_rank}
          <span class="tag">{card.guild_rank.toLowerCase()} {card.guild_rank_stars ?? ""}</span>
        {/if}
      {/if}
      {#if card.support_rank}<span class="tag">{card.support_rank}</span>{/if}
      {#if card.veteran}<span class="tag">veteran</span>{/if}
    </p>

    <dl class="meta">
      <div class="meta-row"><dt>First joined Wynncraft</dt><dd>{formatDate(card.first_join)}</dd></div>
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
    </dl>

    <dl class="profile-vitals">
      {#each vitals as vital (vital.label)}
        <div class="vital">
          <dt>{vital.label}</dt>
          <dd>{vital.value === null ? "-" : `${vital.value.toLocaleString()}${vital.unit ?? ""}`}</dd>
        </div>
      {/each}
    </dl>

    {#await data.series then series}
      {#if series && series.days.length > 0}
        {@const window = trackWindow(series)}
        <div class="profile-section">
          <SectionLabel meta="{formatDate(window.from)} to {formatDate(window.to)}">
            {#snippet children()}Tracking{/snippet}
          </SectionLabel>
          <div class="track-controls">
            <ScopeChips scopes={METRICS} active={metric} onselect={(key) => (metric = key)} label="Tracked metric" />
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

    {#if Object.keys(card.raids).length > 0}
      <div class="profile-section">
        <SectionLabel meta={card.raids_total === null ? undefined : `${card.raids_total.toLocaleString()} total`}>
          {#snippet children()}Raids{/snippet}
        </SectionLabel>
        <BarList items={raidBars(card)} />
      </div>
    {/if}

    {#if notableRankings(card).length > 0}
      <div class="profile-section">
        <SectionLabel meta="top 100 finishes">
          {#snippet children()}Leaderboard standings{/snippet}
        </SectionLabel>
        <ul class="standings">
          {#each notableRankings(card) as ranking (ranking.label)}
            <li>
              <span class="standing-rank" class:gold={ranking.position === 1}>#{ranking.position}</span>
              <span class="standing-label">{ranking.label}</span>
            </li>
          {/each}
        </ul>
      </div>
    {/if}
  </div>
</article>

<style>
  .profile {
    display: grid;
    grid-template-columns: 280px minmax(0, 1fr);
    gap: 28px;
    padding: 26px;
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-deep) 60%, transparent);
  }

  @media (max-width: 760px) {
    .profile {
      grid-template-columns: 1fr;
    }

    .profile-render {
      justify-self: center;
    }
  }

  .profile-render img {
    display: block;
    max-width: 100%;
    image-rendering: pixelated;
  }

  .profile-tags {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 18px;
  }

  .tag {
    padding: 4px 10px;
    border: 1px solid var(--color-border-subtle);
    color: var(--text-body);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    text-decoration: none;
  }

  .tag-gold {
    border-color: color-mix(in srgb, var(--color-gold) 35%, transparent);
    color: var(--color-gold);
  }

  a.tag:hover {
    border-color: color-mix(in srgb, var(--color-gold) 50%, transparent);
  }

  .meta {
    display: grid;
    gap: 6px;
    margin: 0 0 22px;
  }

  .meta-row {
    display: flex;
    gap: 12px;
    align-items: baseline;
  }

  .meta-row dt {
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .meta-row dd {
    margin: 0;
    color: var(--text-body);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .online-now {
    color: var(--status-online);
  }

  .profile-vitals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 16px;
    margin: 0 0 26px;
  }

  .vital dt {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .vital dd {
    margin: 6px 0 0;
    color: var(--text-heading);
    font-family: var(--font-data);
    font-size: var(--text-lg);
  }

  .profile-section {
    margin-bottom: 26px;
  }

  .track-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-bottom: 14px;
  }

  .standings {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .standings li {
    display: flex;
    gap: 10px;
    align-items: baseline;
    padding: 8px 12px;
    border: 1px solid var(--color-border-subtle);
  }

  .standing-rank {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .standing-rank.gold {
    color: var(--color-gold);
  }

  .standing-label {
    color: var(--text-body);
    font-size: var(--text-xs);
  }
</style>
