<script lang="ts">
  import { webAuthStartUrl } from "$lib/site/webAuth";
  import Button from "$lib/design-system/components/Button.svelte";
  import DailyBars from "$lib/design-system/components/charts/DailyBars.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import EventMeta from "$lib/events/components/EventMeta.svelte";
  import GoalMeter from "$lib/events/components/GoalMeter.svelte";
  import { themeVars } from "$lib/events/theme";
  import { isoDay } from "$lib/events/format";
  import { nmsrFace } from "$lib/site/nmsr";
  import { raidIconUrl } from "$lib/events/raidIcons";
  import type { RaidLeaderboardEntry } from "$lib/server/raidEventBoards";

  let { data } = $props();

  const event = $derived(data.event);
  const status = $derived(data.status);
  const signInUrl = $derived(webAuthStartUrl());
  const iconAt = $derived(
    (placement: "hero" | "meta"): string | null =>
      event.icon?.placements.includes(placement) ? raidIconUrl(event.icon.file) : null,
  );

  /** Live reads the feed, ended freezes on finalTotal, before start shows zero. */
  const goalCurrent = $derived((index: number): number | null => {
    if (status === "live") return data.progress?.[index] ?? null;
    return status === "ended" ? null : 0;
  });

  const rankLabels: Record<string, string> = {
    owner: "Owner",
    chief: "Chief",
    strategist: "Strategist",
    captain: "Captain",
    recruiter: "Recruiter",
    recruit: "Recruit",
  };

  const standingsColumns: LedgerColumn<RaidLeaderboardEntry>[] = [
    {
      key: "member",
      label: "Member",
      nameStyle: true,
      value: (entry) => entry.username,
      sortValue: (entry) => entry.username.toLowerCase(),
      secondary: (entry) => rankLabels[entry.rank] ?? entry.rank,
      avatar: (entry) => nmsrFace(entry.player_uuid, 22),
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
</script>

<svelte:head>
  <title>{event.name} - Sequoia</title>
  <meta name="description" content="{event.name}: {event.tagline}" />
</svelte:head>

<article class="ev-page" style={themeVars(event.theme)}>
  <div class="ev-page-sky" aria-hidden="true"></div>

  <a class="ev-hero-back focus-ring" href="/events">
    <span class="ev-hero-back-diamond" aria-hidden="true">◆</span>Events
  </a>

  <header class="ev-hero">
    {#if iconAt("hero")}
      <img class="ev-hero-icon ev-enter" style="--enter: 0" src={iconAt("hero")} alt="" />
    {:else}
      <span class="ev-hero-spark ev-enter" style="--enter: 0" aria-hidden="true">✦</span>
    {/if}
    <h1 class="ev-hero-name ev-enter" style="--enter: 1">{event.name}</h1>
    <p class="ev-hero-tagline ev-enter" style="--enter: 2">{event.tagline}</p>
    <div class="ev-hero-meta ev-enter" style="--enter: 3">
      {#if iconAt("meta")}
        <img class="ev-meta-icon" src={iconAt("meta")} alt="" />
      {/if}
      <EventMeta {event} {status} align="center" />
    </div>
    {#if data.draft}
      <p class="ev-draft-note ev-enter" style="--enter: 3">
        Draft preview - hidden from the hub until it is listed.
        <a class="focus-ring" href={`/events/manage/${event.slug}`}>Edit</a>
      </p>
    {/if}
    {#if event.about}
      <div class="ev-hero-about ev-enter" style="--enter: 4">
        {#each event.about as paragraph (paragraph)}
          <p>{paragraph}</p>
        {/each}
      </div>
    {/if}
  </header>

  <div class="ev-body">
    {#if data.locked}
      <div class="ev-gate">
        <span class="ev-gate-spark" aria-hidden="true">✦</span>
        <h2 class="ev-gate-title">Members only</h2>
        {#if data.lockReason === "unverified"}
          <p class="ev-gate-text">Membership can't be verified right now - try again shortly.</p>
        {:else}
          <p class="ev-gate-text">Goal, prizes, comp, and standings are visible to Sequoia members.</p>
        {/if}
        {#if data.lockReason === "signin"}
          <Button href={signInUrl}>
            {#snippet children()}Sign in{/snippet}
          </Button>
        {/if}
      </div>
    {/if}

    {#if event.goals && event.goals.length > 0}
      <section class="ev-section" aria-label="Event goals">
        <h2 class="ev-label">
          <span class="ev-spark" aria-hidden="true">✦</span>{event.goals.length === 1
            ? "Goal"
            : "Goals"}
        </h2>
        <div class="ev-goals">
          {#each event.goals as goal, index (goal.metricLabel + index)}
            <GoalMeter {goal} current={goalCurrent(index)} />
          {/each}
        </div>
      </section>
    {/if}

    {#if data.chart && status !== "ended"}
      <section class="ev-section" aria-label="Event activity">
        <h2 class="ev-label">
          <span class="ev-spark" aria-hidden="true">✦</span>Activity
          {#if status === "live" && event.startsAt}
            <span class="ev-label-meta">daily, since {isoDay(event.startsAt)}</span>
          {/if}
        </h2>
        {#if status !== "live"}
          <p class="ev-muted">Tracking begins when the event starts.</p>
        {:else if data.days === null}
          <p class="ev-muted">The activity feed is temporarily unavailable.</p>
        {:else if data.days.length === 0}
          <p class="ev-muted">No activity recorded yet - the feed is collecting.</p>
        {:else if event.startsAt}
          <div class="ev-chart">
            <DailyBars
              points={data.days}
              from={isoDay(event.startsAt)}
              to={data.today}
              metricLabel={data.chart.label}
              height={190}
            />
          </div>
        {/if}
      </section>
    {/if}

    {#if data.standings !== null || (event.access === "members" && event.goals && status !== "ended")}
      <section class="ev-section" aria-label="Member standings">
        <h2 class="ev-label"><span class="ev-spark" aria-hidden="true">✦</span>Standings</h2>
        {#if data.standings === null}
          <p class="ev-muted">Member standings open when the event starts.</p>
        {:else if data.standings.state === "signin"}
          <p class="ev-muted"><a class="ev-link" href={signInUrl}>Sign in</a> to see member contributions.</p>
        {:else if data.standings.state === "unverified"}
          <p class="ev-muted">Membership can't be verified right now - try again shortly.</p>
        {:else if data.standings.state === "notMember"}
          <p class="ev-muted">Standings are visible to current Sequoia members.</p>
        {:else if data.standings.error}
          <p class="ev-muted ev-error">{data.standings.error}</p>
        {:else if data.standings.leaderboard.length === 0}
          <p class="ev-muted">No contributions have been recorded yet.</p>
        {:else}
          <LedgerTable
            columns={standingsColumns}
            rows={data.standings.leaderboard}
            rowKey={(entry) => entry.player_uuid}
            defaultSort="raids"
            maxHeight="480px"
          />
        {/if}
      </section>
    {/if}

    {#if event.prizes || event.comp}
      <div class="ev-columns">
        {#if event.prizes}
          <section class="ev-section" aria-label="Prize pool">
            <h2 class="ev-label">
              <span class="ev-spark" aria-hidden="true">✦</span>Prize pool
              <span class="ev-label-meta">{event.prizes.length} donations</span>
            </h2>
            <ul class="ev-prizes">
              {#each event.prizes as entry (entry.donor + entry.prize)}
                <li class="ev-prize">
                  {#if entry.donorPlayer}
                    <a
                      class="ev-prize-donor ev-prize-donor-link focus-ring"
                      href={`/statistics/player/playercard?player=${encodeURIComponent(entry.donorPlayer)}`}
                    >{entry.donor}</a>
                  {:else}
                    <span class="ev-prize-donor">{entry.donor}</span>
                  {/if}
                  <span class="ev-prize-what">{entry.prize}</span>
                </li>
              {/each}
            </ul>
            {#if event.prizesNote}
              <p class="ev-muted ev-note">{event.prizesNote}</p>
            {/if}
          </section>
        {/if}

        {#if event.comp}
          <section class="ev-section" aria-label="Suggested comp">
            <h2 class="ev-label"><span class="ev-spark" aria-hidden="true">✦</span>Suggested comp</h2>
            <ul class="ev-comp">
              {#each event.comp.roles as role (role.role)}
                <li class="ev-comp-role">
                  <span class="ev-comp-name">
                    {role.role}
                    {#if role.note}<span class="ev-comp-note">{role.note}</span>{/if}
                  </span>
                  <span class="ev-comp-builds">{role.builds}</span>
                </li>
              {/each}
            </ul>
            {#if event.comp.note}
              <p class="ev-muted ev-note">{event.comp.note}</p>
            {/if}
          </section>
        {/if}
      </div>
    {/if}

    {#if event.rules}
      <section class="ev-section" aria-label="Rules">
        <h2 class="ev-label"><span class="ev-spark" aria-hidden="true">✦</span>Rules</h2>
        <ul class="ev-rules">
          {#each event.rules as rule (rule)}
            <li>{rule}</li>
          {/each}
        </ul>
      </section>
    {/if}
  </div>
</article>

<style>
  /* One continuous sky: the hero gradient dissipates into the abyss instead
     of cutting off, and the star field fades out with it. */
  .ev-page {
    position: relative;
    isolation: isolate;
    min-height: 60vh;
  }

  .ev-page-sky {
    position: absolute;
    inset: 0;
    z-index: -1;
    overflow: hidden;
    /* Whatever the page height, the sky never ends on a hard edge. */
    mask-image: linear-gradient(to bottom, black calc(100% - 320px), transparent);
    -webkit-mask-image: linear-gradient(to bottom, black calc(100% - 320px), transparent);
    background:
      radial-gradient(56% 400px at 50% 300px, color-mix(in srgb, var(--ev-accent) 11%, transparent), transparent 72%),
      linear-gradient(
        180deg,
        var(--ev-sky-0) 0px,
        var(--ev-sky-1) 460px,
        color-mix(in srgb, var(--ev-sky-1) 45%, var(--color-abyss)) 1050px,
        color-mix(in srgb, var(--ev-sky-1) 16%, transparent) 1700px,
        transparent 2200px
      );
  }

  .ev-page-sky::before {
    content: "";
    position: absolute;
    top: -140px;
    left: -10%;
    right: -10%;
    height: 2000px;
    background:
      radial-gradient(circle, var(--ev-star) 1px, transparent 1.5px) 24px 41px / 233px 141px,
      radial-gradient(circle, var(--ev-star) 0.8px, transparent 1.3px) 131px 87px / 337px 97px,
      radial-gradient(circle, var(--ev-star) 0.6px, transparent 1.1px) 61px 13px / 149px 113px,
      radial-gradient(circle, var(--ev-star) 0.6px, transparent 1.1px) 7px 51px / 191px 73px;
    opacity: 0.75;
    transform: rotate(-4deg);
    mask-image: linear-gradient(to bottom, black 0, black 800px, transparent 1600px);
    -webkit-mask-image: linear-gradient(to bottom, black 0, black 800px, transparent 1600px);
  }

  /* The sky runs under the fixed translucent navbar (the layout drops its
     top padding for event pages), so the hero clears it with its own. */
  .ev-hero {
    display: grid;
    justify-items: center;
    padding: calc(3.5rem + 72px) 24px 56px;
    text-align: center;
  }

  /* Orchestrated entrance: each hero element arrives a beat after the last.
     will-change keeps the elements composited after the animation ends -
     dropping the layer re-rasterizes the pixel-font gradient (a visible pop). */
  .ev-enter {
    animation: seq-fade-in-up 0.55s var(--ease-out-soft) both;
    animation-delay: calc(var(--enter) * 90ms);
    will-change: transform;
  }

  .ev-hero-back {
    position: absolute;
    top: calc(3.5rem + 18px);
    left: 22px;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    text-decoration: none;
    transition: color var(--dur-fast) ease;
  }

  .ev-hero-back:hover {
    color: var(--color-gold);
  }

  .ev-hero-back-diamond {
    margin-right: 7px;
    color: var(--color-gold);
    font-size: 0.8em;
  }

  .ev-hero-spark {
    margin-bottom: 18px;
    color: var(--ev-accent);
    font-size: 1.5rem;
    line-height: 1;
    text-shadow: 0 0 18px color-mix(in srgb, var(--ev-accent) 60%, transparent);
  }

  /* The icon takes the spark's slot - both stacked would crowd the name. */
  .ev-hero-icon {
    width: 40px;
    height: 40px;
    margin-bottom: 16px;
    image-rendering: pixelated;
  }

  .ev-hero-meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 10px;
  }

  .ev-meta-icon {
    width: 28px;
    height: 28px;
    image-rendering: pixelated;
  }

  .ev-hero-name {
    margin: 0 0 10px;
    background: linear-gradient(90deg, var(--ev-accent), var(--ev-accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 5vw, 3.4rem);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    text-transform: uppercase;
  }

  .ev-hero-tagline {
    margin: 0 0 20px;
    color: var(--text-body);
    font-size: var(--text-base);
  }

  .ev-draft-note {
    margin: 14px 0 0;
    color: var(--text-muted);
    font-size: var(--text-xs);
  }

  .ev-draft-note a {
    margin-left: 6px;
    color: var(--ev-accent);
    text-decoration: none;
    text-transform: uppercase;
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
  }

  .ev-hero-about {
    max-width: 62ch;
    margin-top: 30px;
    color: var(--text-body);
    font-size: var(--text-base);
    line-height: var(--leading-normal);
  }

  .ev-hero-about p {
    margin: 0 0 8px;
  }

  .ev-body {
    width: min(1100px, 100% - 3rem);
    margin: 0 auto;
    padding: 28px 0 64px;
  }

  /* The gate is the page's one bordered moment - it only appears when
     everything else is stripped. */
  .ev-gate {
    display: grid;
    justify-items: center;
    gap: 10px;
    max-width: 460px;
    margin: 40px auto 24px;
    padding: 40px 28px 34px;
    border: 1px solid color-mix(in srgb, var(--ev-accent) 30%, transparent);
    background: color-mix(in srgb, var(--ev-sky-1) 40%, transparent);
    text-align: center;
  }

  .ev-gate-spark {
    color: var(--ev-accent);
    font-size: 1.1rem;
    line-height: 1;
  }

  .ev-gate-title {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .ev-gate-text {
    margin: 0 0 14px;
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  .ev-section {
    margin-bottom: 44px;
  }

  .ev-goals {
    display: grid;
    gap: 24px;
  }

  .ev-label {
    display: flex;
    align-items: baseline;
    gap: 14px;
    margin: 0 0 16px;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .ev-spark {
    margin-right: -4px;
    color: var(--ev-accent);
    font-size: 0.9em;
  }

  .ev-label-meta {
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-2xs);
    letter-spacing: normal;
    text-transform: none;
  }

  /* Chart marks take the event accent: quiet bars, accent peak. */
  .ev-chart {
    --chart-context: color-mix(in srgb, var(--ev-accent) 30%, #565b78);
    --color-gold-dark: var(--ev-accent);
    --color-gold-light: var(--ev-accent-2);
    --color-gold: var(--ev-accent-2);
  }

  .ev-muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .ev-error {
    color: var(--status-error);
  }

  .ev-note {
    margin-top: 12px;
    font-size: var(--text-xs);
  }

  .ev-link {
    color: var(--color-gold);
    text-decoration: none;
  }

  .ev-link:hover {
    color: var(--color-gold-light);
  }

  .ev-link:focus-visible {
    outline: 2px solid rgba(245, 197, 66, 0.5);
    outline-offset: 2px;
  }

  .ev-columns {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
    gap: 0 56px;
    align-items: start;
  }

  .ev-prizes,
  .ev-comp,
  .ev-rules {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .ev-prize,
  .ev-comp-role {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 20px;
    padding: 11px 2px;
    border-bottom: 1px solid var(--color-border-subtle);
  }

  .ev-prize-donor {
    flex-shrink: 0;
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .ev-prize-donor-link {
    text-decoration: none;
    transition: color var(--dur-fast) ease;
  }

  .ev-prize-donor-link:hover {
    color: var(--ev-accent);
    text-decoration: underline;
    text-underline-offset: 3px;
  }

  .ev-prize-what {
    color: var(--text-body);
    font-family: var(--font-data);
    font-size: var(--text-sm);
    text-align: right;
  }

  .ev-comp-name {
    flex-shrink: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
  }

  .ev-comp-note {
    margin-left: 10px;
    color: var(--ev-accent);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
  }

  .ev-comp-builds {
    color: var(--text-body);
    font-size: var(--text-sm);
    text-align: right;
  }

  .ev-rules li {
    padding: 10px 2px;
    border-bottom: 1px solid var(--color-border-subtle);
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  @media (max-width: 900px) {
    .ev-columns {
      grid-template-columns: 1fr;
    }

    .ev-body {
      width: min(1100px, 100% - 2rem);
    }

    .ev-hero {
      padding: calc(3.5rem + 40px) 18px 44px;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ev-enter {
      animation: none;
      will-change: auto;
    }
  }
</style>
