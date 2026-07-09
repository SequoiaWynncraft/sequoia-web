<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import SubpageGrid from "$lib/components/SubpageGrid.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import StatBlock from "$lib/design-system/components/StatBlock.svelte";
  import DataPanel from "$lib/design-system/components/DataPanel.svelte";
  import SeasonLedger from "$lib/design-system/components/charts/SeasonLedger.svelte";
  import { cardsFor, pageView } from "$lib/site/nav";
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

<PageScaffold crumbs={page.crumbs} width="xl">
  {#snippet children()}
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

      <div class="group-grid">
        <DataPanel title="Player statistics">
          {#snippet children()}
            <dl class="teasers">
              {#if topWars}
                <div class="teaser">
                  <dt>Most wars</dt>
                  <dd><span class="teaser-name">{topWars.member.username}</span>{topWars.value.toLocaleString()}</dd>
                </div>
              {/if}
              {#if topRaids}
                <div class="teaser">
                  <dt>Most guild raids</dt>
                  <dd><span class="teaser-name">{topRaids.member.username}</span>{topRaids.value.toLocaleString()}</dd>
                </div>
              {/if}
              {#if topPlaytime}
                <div class="teaser">
                  <dt>Most playtime</dt>
                  <dd>
                    <span class="teaser-name">{topPlaytime.member.username}</span>{Math.round(topPlaytime.value).toLocaleString()} h
                  </dd>
                </div>
              {/if}
            </dl>
            <nav class="panel-links" aria-label="Player statistics pages">
              {#each cardsFor("/statistics/player") as item (item.to)}
                <a href={item.to}>{item.label}<span aria-hidden="true">→</span></a>
              {/each}
            </nav>
          {/snippet}
        </DataPanel>

        <DataPanel title="Guild statistics">
          {#snippet children()}
            <dl class="teasers">
              <div class="teaser">
                <dt>Season {currentSeason.season} standing</dt>
                <dd>{currentPosition ? `#${currentPosition}` : "—"}</dd>
              </div>
              <div class="teaser">
                <dt>Lifetime wars</dt>
                <dd>{stats.guild.wars.toLocaleString()}</dd>
              </div>
              <div class="teaser">
                <dt>Lifetime guild raids</dt>
                <dd>{stats.guild.raids.toLocaleString()}</dd>
              </div>
            </dl>
            <nav class="panel-links" aria-label="Guild statistics pages">
              {#each cardsFor("/statistics/guilds") as item (item.to)}
                <a href={item.to}>{item.label}<span aria-hidden="true">→</span></a>
              {/each}
            </nav>
          {/snippet}
        </DataPanel>
      </div>

      {#if staleForLong}
        <p class="stale-note">Live data is currently unavailable — showing the last recorded snapshot.</p>
      {/if}
    {:else}
      <SubpageGrid items={page.cards} />
      <p class="stale-note">Live statistics are temporarily unavailable.</p>
    {/if}
  {/snippet}
</PageScaffold>

<style>
  .season-hero {
    display: grid;
    grid-template-columns: minmax(260px, 5fr) minmax(280px, 7fr);
    gap: 24px;
    align-items: end;
    margin-bottom: 20px;
    padding: 24px;
    border: 1px solid rgba(245, 197, 66, 0.22);
    background: rgba(26, 29, 42, 0.74);
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
    font-size: clamp(2rem, 5vw, 3.25rem);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    text-transform: uppercase;
  }

  .season-facts {
    display: flex;
    flex-wrap: wrap;
    gap: 20px;
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
  }

  .vitals {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 20px 12px;
    margin-bottom: 20px;
    padding: 24px 16px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(19, 22, 31, 0.6);
  }

  .group-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
  }

  .teasers {
    display: grid;
    gap: 0;
    margin: 0;
  }

  .teaser {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 16px;
    padding: 10px 0;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .teaser dt {
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  .teaser dd {
    display: flex;
    align-items: baseline;
    gap: 10px;
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-mono);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .teaser-name {
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
  }

  .panel-links {
    display: grid;
    gap: 2px;
    margin-top: 14px;
  }

  .panel-links a {
    display: flex;
    justify-content: space-between;
    padding: 9px 10px;
    border: 1px solid transparent;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    text-decoration: none;
    transition: border-color var(--dur-fast) ease, background var(--dur-fast) ease;
  }

  .panel-links a:hover {
    border-color: rgba(245, 197, 66, 0.4);
    background: rgba(245, 197, 66, 0.05);
  }

  .panel-links a:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .panel-links a span {
    color: var(--color-gold);
  }

  .stale-note {
    margin-top: 16px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  @media (max-width: 900px) {
    .season-hero,
    .group-grid {
      grid-template-columns: 1fr;
    }

    .vitals {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 520px) {
    .vitals {
      grid-template-columns: repeat(2, 1fr);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .season-hero {
      animation: none;
    }
  }
</style>
