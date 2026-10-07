<script lang="ts">
  import { guildRankLabel } from "$lib/api/guildStats";
  import PlayerName from "$lib/design-system/components/PlayerName.svelte";
  import { playercardUrl } from "$lib/site/identity";
  import { rankColor } from "$lib/site/rankColors";
  import { webAuthStartUrl } from "$lib/site/webAuth";
  import Button from "$lib/design-system/components/Button.svelte";
  import DailyBars from "$lib/design-system/components/charts/DailyBars.svelte";
  import LedgerTable from "$lib/design-system/components/LedgerTable.svelte";
  import type { LedgerColumn } from "$lib/design-system/components/ledgerTable";
  import EmojiText from "$lib/emoji/EmojiText.svelte";
  import EventMeta from "$lib/events/components/EventMeta.svelte";
  import GoalMeter from "$lib/events/components/GoalMeter.svelte";
  import PrizeBoard from "$lib/events/components/PrizeBoard.svelte";
  import { themeVars } from "$lib/events/theme";
  import { isoDay } from "$lib/events/format";
  import { nmsrFace } from "$lib/site/nmsr";
  import { insigniaLabel } from "$lib/site/honours";
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

  /**
   * Live and ended both read the feed (ended is frozen at the event's end in the
   * loader); before the event starts shows zero. A null progress (manual goal or
   * feed down) falls back to finalTotal inside GoalMeter.
   */
  const goalCurrent = $derived((index: number): number | null => {
    if (status === "upcoming") return 0;
    return data.progress?.[index] ?? null;
  });

  // One row per winner slot across every raffle, mirroring the manage table:
  // a raffle with three winners shows three rows sharing its prize.
  const raffleRows = $derived(
    (event.raffles ?? []).flatMap((raffle) =>
      Array.from({ length: raffle.winnerCount }, (_unused, slot) => {
        const key = `${raffle.id}:${slot}`;
        // A slot still animating on the stage keeps its committed winner
        // masked here - this page must not spoil the wheel's landing.
        const spinning = data.spinningSlots.includes(key);
        const stored = raffle.winners?.find((entry) => entry.slot === slot) ?? null;
        return {
          key,
          prize: raffle.prize,
          icon: raffle.icon ?? null,
          spinning,
          winner:
            !spinning && stored
              ? { username: stored.username, uuid: stored.player_uuid }
              : null,
        };
      }),
    ),
  );

  // The most recent draw across the event's raffles, for the meta line.
  const lastDrawnAt = $derived.by(() => {
    const times = (event.raffles ?? [])
      .map((raffle) => (raffle.drawnAt ? Date.parse(raffle.drawnAt) : Number.NaN))
      .filter((time) => Number.isFinite(time));
    if (times.length === 0) return null;
    return new Date(Math.max(...times)).toLocaleString("en-GB", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
    });
  });

  // Personal milestones are ascending by target (enforced by the validator), so
  // the last one a member has cleared is their highest tier.
  const personalMilestones = $derived(event.personalMilestones ?? []);

  /** The highest personal milestone a raid count has reached, or null. */
  const highestTier = (raids: number) =>
    personalMilestones.reduce<(typeof personalMilestones)[number] | null>(
      (best, milestone) => (raids >= milestone.at ? milestone : best),
      null,
    );

  /** Count of tiers reached, for sorting the standings milestone column. */
  const tiersReached = (raids: number) =>
    personalMilestones.filter((milestone) => raids >= milestone.at).length;

  /** What the board counts: raids, or war points on a war tracker. */
  const unit = $derived(data.standings?.state === "board" ? data.standings.unit : "raids");

  // War points can be fractional; raid counts format the same as before.
  const formatUnits = (value: number) => value.toLocaleString(undefined, { maximumFractionDigits: 1 });

  // A war-point total with wars still awaiting their points is partial: mark
  // it, and never show a member whose only wars are pending as a confirmed 0.
  const formatStanding = (entry: RaidLeaderboardEntry) => {
    if (!entry.pendingWars) return formatUnits(entry.raids);
    return entry.raids === 0 ? "pending" : `${formatUnits(entry.raids)}*`;
  };
  const hasPending = $derived(
    data.standings?.state === "board" && data.standings.leaderboard.some((entry) => entry.pendingWars),
  );

  // A GoalMeter renders any {metricLabel, milestones} shape - reuse it for the
  // signed-in member's own progress by feeding their total as the current.
  const viewerGoal = $derived({ metricLabel: unit, milestones: personalMilestones });

  const standingsColumns = $derived<LedgerColumn<RaidLeaderboardEntry>[]>([
    {
      key: "member",
      label: "Member",
      nameStyle: true,
      value: (entry) => entry.username,
      sortValue: (entry) => entry.username.toLowerCase(),
      // Role-aware: the Sequoia progression rank when the member is linked,
      // the in-game rank otherwise - colored from the shared rank vocabulary.
      secondary: (entry) => entry.progressionRank ?? guildRankLabel(entry.rank),
      secondaryColor: (entry) =>
        entry.progressionRankColor ?? rankColor(entry.progressionRank ?? entry.rank),
      avatar: (entry) => nmsrFace(entry.player_uuid, 22),
      href: (entry) => playercardUrl(entry.username),
      icon: (entry) =>
        entry.insigniaUrl && entry.insignia
          ? { src: entry.insigniaUrl, alt: insigniaLabel(entry.insignia) }
          : null,
    },
    {
      key: "raids",
      label: unit === "raids" ? "Raids" : "War points",
      numeric: true,
      value: formatStanding,
      sortValue: (entry) => entry.raids,
    },
    // The milestone column only appears when the event defines personal milestones.
    ...(personalMilestones.length > 0
      ? [
          {
            key: "milestone",
            label: "Milestone",
            value: (entry: RaidLeaderboardEntry) => highestTier(entry.raids)?.unlock ?? "—",
            sortValue: (entry: RaidLeaderboardEntry) => tiersReached(entry.raids),
          },
        ]
      : []),
  ]);
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
        <a class="focus-ring" href={`/manage/events/${event.slug}`}>Edit</a>
      </p>
    {/if}
    {#if event.about}
      <div class="ev-hero-about ev-enter" style="--enter: 4">
        {#each event.about as paragraph (paragraph)}
          <p><EmojiText text={paragraph} /></p>
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

    {#if data.chart && (status === "live" || status === "ended") && event.startsAt}
      <section class="ev-section" aria-label="Event activity">
        <h2 class="ev-label">
          <span class="ev-spark" aria-hidden="true">✦</span>Activity
          <span class="ev-label-meta">
            {#if status === "ended" && event.endsAt}
              daily, {isoDay(event.startsAt)} – {isoDay(event.endsAt)}
            {:else}
              daily, since {isoDay(event.startsAt)}
            {/if}
          </span>
        </h2>
        {#if data.days === null}
          <p class="ev-muted">The activity feed is temporarily unavailable.</p>
        {:else if data.days.length === 0}
          <p class="ev-muted">No activity recorded - the feed is empty for this window.</p>
        {:else}
          <div class="ev-chart">
            <DailyBars
              points={data.days}
              from={isoDay(event.startsAt)}
              to={status === "ended" && event.endsAt ? isoDay(event.endsAt) : data.today}
              metricLabel={data.chart.label}
              height={190}
              caption="Peak day highlighted"
            />
          </div>
        {/if}
      </section>
    {/if}

    {#if personalMilestones.length > 0 && data.viewerRaids !== null}
      <section class="ev-section" aria-label="Your milestones">
        <h2 class="ev-label">
          <span class="ev-spark" aria-hidden="true">✦</span>Your progress
          <span class="ev-label-meta">{formatUnits(data.viewerRaids)} {unit}</span>
        </h2>
        <div class="ev-personal">
          <GoalMeter goal={viewerGoal} current={data.viewerRaids} />
        </div>
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
          {#if hasPending}
            <p class="ev-muted">* Some wars are still awaiting their point values, so these totals may change.</p>
          {/if}
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
                    <span class="ev-prize-donor">
                      <PlayerName username={entry.donor} player={entry.donorPlayer} size={18} />
                    </span>
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

    {#if raffleRows.length > 0}
      <section class="ev-section" aria-label="Raffles">
        <div class="ev-raffle-heading">
          <h2 class="ev-label">
            <span class="ev-spark" aria-hidden="true">✦</span>{event.raffles && event.raffles.length === 1
              ? "Raffle"
              : "Raffles"}
          </h2>
          {#if event.raffleHideWheel !== true || data.manager}
            <a class="ev-stage-link focus-ring" href={`/events/${event.slug}/raffle`}>
              <span aria-hidden="true">✦</span> Watch the stage{#if event.raffleHideWheel === true}
                <span class="ev-stage-hidden">(hidden)</span>{/if}
            </a>
          {/if}
        </div>
        <PrizeBoard rows={raffleRows} />
        {#if lastDrawnAt}
          <p class="ev-raffle-drawn">Last drawn {lastDrawnAt} UTC</p>
        {/if}
      </section>
    {/if}

    {#if event.rules}
      <section class="ev-section" aria-label="Rules">
        <h2 class="ev-label"><span class="ev-spark" aria-hidden="true">✦</span>Rules</h2>
        <ul class="ev-rules">
          {#each event.rules as rule (rule)}
            <li><EmojiText text={rule} /></li>
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
    outline: 2px solid color-mix(in srgb, var(--color-gold) 50%, transparent);
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

  .ev-raffle-heading {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 14px;
  }

  .ev-stage-link {
    color: var(--ev-accent, var(--color-gold));
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-decoration: none;
    text-transform: uppercase;
    transition: color var(--dur-fast) ease;
  }

  .ev-stage-hidden {
    margin-left: 6px;
    color: var(--text-muted);
    text-transform: none;
  }

  .ev-stage-link:hover {
    color: var(--text-heading);
  }

  .ev-raffle-drawn {
    margin: 10px 0 0;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
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
