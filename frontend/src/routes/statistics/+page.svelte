<script lang="ts">
  import PageHeader from "$lib/components/PageHeader.svelte";
  import SubpageGrid from "$lib/components/SubpageGrid.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import StatBlock from "$lib/design-system/components/StatBlock.svelte";
  import SeasonLedger from "$lib/design-system/components/charts/SeasonLedger.svelte";
  import { pageView } from "$lib/site/nav";
  import type { GuildMemberStats } from "$lib/api/guildStats";

  let { data } = $props();

  const page = pageView("/statistics");
  const stats = $derived(data.stats);

  const currentSeason = $derived(stats?.season_ranks.at(-1) ?? null);
  const currentPosition = $derived(
    stats && currentSeason ? (stats.rankings[`guildSeason${currentSeason.season}`] ?? null) : null,
  );

  function topBy(
    members: GuildMemberStats[],
    value: (member: GuildMemberStats) => number | null,
  ): { member: GuildMemberStats; value: number } | null {
    let best: { member: GuildMemberStats; value: number } | null = null;
    for (const member of members) {
      const current = value(member);
      if (current !== null && (best === null || current > best.value)) {
        best = { member, value: current };
      }
    }
    return best;
  }

  const bestSeason = $derived(
    stats && stats.season_ranks.length > 0
      ? stats.season_ranks.reduce((best, entry) => (entry.rating > best.rating ? entry : best))
      : null,
  );
  const topWars = $derived(stats ? topBy(stats.members, (member) => member.wars) : null);
  const topRaids = $derived(stats ? topBy(stats.members, (member) => member.raids_total) : null);
  const topPlaytime = $derived(stats ? topBy(stats.members, (member) => member.playtime) : null);
  const topContributed = $derived(stats ? topBy(stats.members, (member) => member.contributed) : null);
  const firstFinishes = $derived(
    stats
      ? Object.keys(stats.rankings).filter(
          (slug) => slug.startsWith("guildSeason") && stats.rankings[slug] === 1,
        ).length
      : 0,
  );

  function compact(value: number): string {
    return Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(value);
  }

  const STALE_NOTE_AFTER_MS = 30 * 60 * 1000;
  const staleForLong = $derived(
    stats?.stale === true && Date.now() - Date.parse(stats.generated_at) > STALE_NOTE_AFTER_MS,
  );
</script>

<PageHeader kicker={page.kicker} title={page.title} lead={page.lead} />

{#if stats && currentSeason}
  <section class="season-hero animate-fade-in-up" aria-label="Current guild season">
    <div class="season-hero-info">
      <span class="season-eyebrow">Guild Season {currentSeason.season} · Live</span>
      <span class="season-rank" class:text-gold-gradient={currentPosition === 1}>
        {currentPosition ? `Rank #${currentPosition}` : "In progress"}
      </span>
      <div class="season-facts">
        <span class="season-fact">
          <span class="season-fact-label">Season rating</span>
          <span class="season-fact-value">{currentSeason.rating.toLocaleString()}</span>
        </span>
        {#if bestSeason && bestSeason.season !== currentSeason.season}
          <span class="season-fact">
            <span class="season-fact-label">Best season (S{bestSeason.season})</span>
            <span class="season-fact-value">{bestSeason.rating.toLocaleString()}</span>
          </span>
        {/if}
        <span class="season-fact">
          <span class="season-fact-label">#1 finishes</span>
          <span class="season-fact-value">{firstFinishes}</span>
        </span>
      </div>
      <a class="season-link" href="/statistics/guilds/rankings">Full season history →</a>
    </div>
    <div class="season-hero-chart">
      <SeasonLedger seasons={stats.season_ranks} positions={stats.rankings} compact />
    </div>
  </section>

  <div class="vitals-strip">
    <div class="divider-gold"></div>
    <div class="vitals">
      <StatBlock value={stats.guild.members_total.toLocaleString()} label="Members">
        {#snippet icon()}<Icon name="users" />{/snippet}
      </StatBlock>
      <StatBlock value={stats.guild.level.toLocaleString()} label="Guild Level">
        {#snippet icon()}<Icon name="level" />{/snippet}
      </StatBlock>
      <StatBlock value={stats.guild.territories.toLocaleString()} label="Territories">
        {#snippet icon()}<Icon name="territory" />{/snippet}
      </StatBlock>
      <StatBlock value={compact(stats.guild.wars)} label="Total Wars">
        {#snippet icon()}<Icon name="war" />{/snippet}
      </StatBlock>
      <StatBlock value={compact(stats.guild.raids)} label="Guild Raids">
        {#snippet icon()}<Icon name="raid" />{/snippet}
      </StatBlock>
      <StatBlock value={stats.guild.online_now.toLocaleString()} label="Online Now">
        {#snippet icon()}<Icon name="online" />{/snippet}
      </StatBlock>
    </div>
    <div class="divider-gold"></div>
  </div>

  <div class="records">
    <section aria-label="Player records">
      <h2 class="records-title"><span class="records-diamond" aria-hidden="true">◆</span>Player records</h2>
      <dl class="records-list">
        {#if topWars}
          <div class="record">
            <dt>Most wars</dt>
            <dd><a class="record-name" href="/statistics/player/playercard?player={encodeURIComponent(topWars.member.username)}">{topWars.member.username}</a>{topWars.value.toLocaleString()}</dd>
          </div>
        {/if}
        {#if topRaids}
          <div class="record">
            <dt>Most guild raids</dt>
            <dd><a class="record-name" href="/statistics/player/playercard?player={encodeURIComponent(topRaids.member.username)}">{topRaids.member.username}</a>{topRaids.value.toLocaleString()}</dd>
          </div>
        {/if}
        {#if topPlaytime}
          <div class="record">
            <dt>Most playtime</dt>
            <dd><a class="record-name" href="/statistics/player/playercard?player={encodeURIComponent(topPlaytime.member.username)}">{topPlaytime.member.username}</a>{Math.round(topPlaytime.value).toLocaleString()} h</dd>
          </div>
        {/if}
        {#if topContributed}
          <div class="record">
            <dt>Most XP contributed</dt>
            <dd><a class="record-name" href="/statistics/player/playercard?player={encodeURIComponent(topContributed.member.username)}">{topContributed.member.username}</a>{compact(topContributed.value)}</dd>
          </div>
        {/if}
      </dl>
    </section>

    <section aria-label="Guild records">
      <h2 class="records-title"><span class="records-diamond" aria-hidden="true">◆</span>Guild records</h2>
      <dl class="records-list">
        <div class="record">
          <dt>Season {currentSeason.season} standing</dt>
          <dd>{currentPosition ? `#${currentPosition}` : "—"}</dd>
        </div>
        <div class="record">
          <dt>Best season rating</dt>
          <dd>{bestSeason ? bestSeason.rating.toLocaleString() : "—"}</dd>
        </div>
        <div class="record">
          <dt>Lifetime wars</dt>
          <dd>{stats.guild.wars.toLocaleString()}</dd>
        </div>
        <div class="record">
          <dt>Lifetime guild raids</dt>
          <dd>{stats.guild.raids.toLocaleString()}</dd>
        </div>
      </dl>
    </section>
  </div>

  {#if staleForLong}
    <p class="stale-note">Live data is currently unavailable — showing the last recorded snapshot.</p>
  {/if}
{:else}
  <SubpageGrid items={page.cards} />
  <p class="stale-note">Live statistics are temporarily unavailable.</p>
{/if}

<style>
  .season-hero {
    display: grid;
    grid-template-columns: minmax(280px, 2fr) minmax(320px, 3fr);
    gap: 32px;
    align-items: end;
    margin-bottom: 40px;
    padding: 28px 28px 22px;
    border: 1px solid rgba(245, 197, 66, 0.22);
    background: rgba(26, 29, 42, 0.55);
    box-shadow: var(--bevel-slot);
  }

  .season-hero-info {
    display: grid;
    gap: 14px;
    justify-items: start;
  }

  .season-eyebrow {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
  }

  .season-rank {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: clamp(2rem, 4vw, 3.25rem);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    text-transform: uppercase;
  }

  .season-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 24px;
  }

  .season-fact {
    display: grid;
    gap: 2px;
  }

  .season-fact-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .season-fact-value {
    color: var(--text-heading);
    font-family: var(--font-mono);
    font-size: var(--text-base);
  }

  .season-link {
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    text-decoration: none;
  }

  .season-link:hover {
    color: var(--color-gold-light);
  }

  .season-link:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .season-hero-chart {
    min-width: 0;
    padding: 8px 6px 0;
  }

  .vitals-strip {
    margin-bottom: 44px;
  }

  .vitals {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
    gap: 24px 12px;
    padding: 30px 8px;
  }

  .records {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
    gap: 24px 48px;
  }

  .records-title {
    margin: 0 0 6px;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .records-diamond {
    margin-right: 8px;
    color: var(--color-gold);
    font-size: 0.8em;
  }

  .records-list {
    margin: 0;
  }

  .record {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 11px 2px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .record dt {
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  .record dd {
    display: flex;
    align-items: baseline;
    gap: 12px;
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .record-name {
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    text-decoration: none;
  }

  .record-name:hover {
    color: var(--color-gold-light);
  }

  .record-name:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .stale-note {
    margin-top: 20px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  @media (max-width: 1100px) {
    .season-hero {
      grid-template-columns: 1fr;
      align-items: start;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .season-hero {
      animation: none;
    }
  }
</style>
