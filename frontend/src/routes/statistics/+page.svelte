<script lang="ts">
  import PageHeader from "$lib/components/PageHeader.svelte";
  import SubpageGrid from "$lib/components/SubpageGrid.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import StatBlock from "$lib/design-system/components/StatBlock.svelte";
  import { pageView } from "$lib/site/nav";
  import { compact } from "$lib/site/format";
  import type { GuildMemberStats } from "$lib/api/guildStats";

  import GuildLevelTracker from "./GuildLevelTracker.svelte";

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

  const onlineMembers = $derived(
    stats
      ? stats.members
          .filter((member) => member.online === true)
          .sort(
            (a, b) =>
              (a.server ?? "").localeCompare(b.server ?? "") || a.username.localeCompare(b.username),
          )
      : [],
  );

  function playercardHref(username: string): string {
    return `/statistics/player/playercard?player=${encodeURIComponent(username)}`;
  }

  const STALE_NOTE_AFTER_MS = 30 * 60 * 1000;
  const staleForLong = $derived(
    stats?.stale === true && Date.now() - Date.parse(stats.generated_at) > STALE_NOTE_AFTER_MS,
  );
</script>

<PageHeader kicker={page.kicker} title={page.title} />

{#if stats}
  <div class="vitals-strip animate-fade-in-up">
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
            <dd><a class="record-name" href={playercardHref(topWars.member.username)}>{topWars.member.username}</a>{topWars.value.toLocaleString()}</dd>
          </div>
        {/if}
        {#if topRaids}
          <div class="record">
            <dt>Most guild raids</dt>
            <dd><a class="record-name" href={playercardHref(topRaids.member.username)}>{topRaids.member.username}</a>{topRaids.value.toLocaleString()}</dd>
          </div>
        {/if}
        {#if topPlaytime}
          <div class="record">
            <dt>Most playtime</dt>
            <dd><a class="record-name" href={playercardHref(topPlaytime.member.username)}>{topPlaytime.member.username}</a>{Math.round(topPlaytime.value).toLocaleString()} h</dd>
          </div>
        {/if}
        {#if topContributed}
          <div class="record">
            <dt>Most XP contributed</dt>
            <dd><a class="record-name" href={playercardHref(topContributed.member.username)}>{topContributed.member.username}</a>{compact(topContributed.value)}</dd>
          </div>
        {/if}
      </dl>
    </section>

    <section aria-label="Guild records">
      <h2 class="records-title"><span class="records-diamond" aria-hidden="true">◆</span>Guild records</h2>
      <dl class="records-list">
        {#if currentSeason}
          <div class="record">
            <dt>Season {currentSeason.season} standing</dt>
            <dd>{currentPosition ? `#${currentPosition}` : "-"}</dd>
          </div>
        {/if}
        <div class="record">
          <dt>Level {stats.guild.level} progress</dt>
          <dd>{stats.guild.xp_percent}%</dd>
        </div>
        <div class="record">
          <dt>Best season rating</dt>
          <dd>{bestSeason ? bestSeason.rating.toLocaleString() : "-"}</dd>
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

  {#if onlineMembers.length > 0}
    <section class="online" aria-label="Members online now">
      <h2 class="records-title">
        <span class="records-diamond" aria-hidden="true">◆</span>Online now
        <span class="online-count">{onlineMembers.length}</span>
      </h2>
      <div class="online-grid">
        {#each onlineMembers as member (member.uuid ?? member.username)}
          <a class="online-chip" href={playercardHref(member.username)}>
            <span class="online-dot" aria-hidden="true"></span>
            <span class="online-name">{member.username}</span>
            {#if member.server}<span class="online-server">{member.server}</span>{/if}
          </a>
        {/each}
      </div>
    </section>
  {/if}

  {#if staleForLong}
    <p class="stale-note">Live data is currently unavailable - showing the last recorded snapshot.</p>
  {/if}
{:else}
  <SubpageGrid items={page.cards} />
  <p class="stale-note">Live statistics are temporarily unavailable.</p>
{/if}

<!-- Outside the `stats` branch on purpose: the loader returns `levelTracker` even
     when the guild read fails, and the tracker reads none of `stats`, so an
     eligible member still gets their section during a Wynncraft outage. -->
{#await data.levelTracker then tracker}
  {#if tracker}
    <section class="level-tracker" aria-label="Level tracker">
      <GuildLevelTracker {tracker} />
    </section>
  {/if}
{/await}

<style>
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
    margin-bottom: 44px;
  }

  .level-tracker {
    margin-top: 44px;
    padding-top: 24px;
    border-top: 1px solid var(--color-border-subtle);
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
    font-family: var(--font-data);
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

  .online-count {
    margin-left: 10px;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
  }

  .online-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin-top: 10px;
  }

  .online-chip {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 7px 12px;
    border: 1px solid var(--color-border-subtle);
    background: rgba(19, 22, 31, 0.6);
    text-decoration: none;
    transition: border-color var(--dur-fast) ease, background var(--dur-fast) ease;
  }

  .online-chip:hover {
    border-color: rgba(245, 197, 66, 0.4);
    background: rgba(245, 197, 66, 0.05);
  }

  .online-chip:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .online-dot {
    width: 5px;
    height: 5px;
    border-radius: var(--radius-full);
    background: var(--status-online);
    opacity: 0.7;
  }

  .online-name {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
  }

  .online-server {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
  }

  .stale-note {
    margin-top: 20px;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  @media (prefers-reduced-motion: reduce) {
    .vitals-strip {
      animation: none;
    }
  }
</style>
