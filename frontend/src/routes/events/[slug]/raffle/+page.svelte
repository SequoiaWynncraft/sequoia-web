<script lang="ts">
  import { untrack } from "svelte";

  import PrizeBoard from "$lib/events/components/PrizeBoard.svelte";
  import { prizeIconUrl } from "$lib/events/prizeIcons";
  import EventSky from "$lib/events/components/EventSky.svelte";
  import EntrantList from "$lib/events/stage/EntrantList.svelte";
  import RaffleWheel from "$lib/events/stage/RaffleWheel.svelte";
  import { StageFeed } from "$lib/events/stage/stageStream.svelte";

  let { data } = $props();

  // One feed per event: keyed on the slug alone, so an invalidate (fresh
  // `data.rolls`) never tears the live connection down, while navigating to
  // another event's stage does.
  let feed = $state<StageFeed | null>(null);
  $effect(() => {
    const connected = new StageFeed(data.event.slug);
    connected.seed(untrack(() => data.rolls));
    connected.connect();
    feed = connected;
    return () => connected.close();
  });

  // The wheel shows the newest VALID roll: rolls whose raffle or slot a save
  // removed are filtered before selection, so retiring the newest roll falls
  // back to the next surviving one instead of an empty stage.
  const current = $derived.by(() => {
    if (!feed) return null;
    const valid = Object.values(feed.rolls).filter((roll) => {
      const raffle = (data.event.raffles ?? []).find((entry) => entry.id === roll.raffleId);
      return raffle !== undefined && roll.slot < raffle.winnerCount;
    });
    if (valid.length === 0) return null;
    const spinning = valid
      .filter((roll) => roll.state === "spinning")
      .sort((left, right) => right.startedAt - left.startedAt);
    if (spinning.length > 0) return spinning[0];
    return valid.sort((left, right) => right.startedAt - left.startedAt)[0];
  });

  // One row per declared winner slot: a settled live roll wins over the
  // winner stored in the event JSON (which only refreshes on reload) - and
  // while a slot's roll is still SPINNING, the stored winner stays hidden:
  // the commit precedes the animation, and the table must not spoil the
  // wheel's landing for anyone who opens or reloads mid-spin.
  const results = $derived(
    (data.event.raffles ?? []).flatMap((raffle) =>
      Array.from({ length: raffle.winnerCount }, (_unused, slot) => {
        const live = feed?.rolls[`${raffle.id}:${slot}`];
        const spinning =
          live !== undefined &&
          (feed?.clockOffset === null
            ? live.state === "spinning"
            : live.state === "spinning" ||
              Date.now() < live.settlesAt + (feed?.clockOffset ?? 0));
        const settled = live && live.state === "settled" ? live.winner : null;
        const stored = raffle.winners?.find((entry) => entry.slot === slot) ?? null;
        const winner = spinning
          ? null
          : settled
            ? { username: settled.username, uuid: settled.player_uuid }
            : stored
              ? { username: stored.username, uuid: stored.player_uuid }
              : null;
        return {
          key: `${raffle.id}:${slot}`,
          prize: raffle.prize,
          icon: raffle.icon ?? null,
          winner,
          spinning,
        };
      }),
    ),
  );
</script>

<svelte:head>
  <title>{data.event.name} · Raffle - Sequoia</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<EventSky theme={data.event.theme} dim={data.status === "ended"}>
  <div class="stage">
    <header class="stage-head">
      <span class="stage-kicker"><span aria-hidden="true">✦</span> Raffle</span>
      <h1 class="stage-name">{data.event.name}</h1>
    </header>

    {#if current}
      <div class="stage-live">
        {#key current.rollId}
          <RaffleWheel roll={current} clockOffset={feed?.clockOffset ?? null} />
        {/key}
        <aside class="stage-side" aria-label="This draw">
          {#if current.prize}
            {@const currentIcon =
              (data.event.raffles ?? []).find((entry) => entry.id === current.raffleId)?.icon ?? null}
            <div class="stage-prize">
              <span class="stage-prize-label">Prize</span>
              <span class="stage-prize-name">
                {#if currentIcon}
                  <img class="stage-prize-art" src={prizeIconUrl(currentIcon)} alt="" />
                {/if}
                {current.prize}
              </span>
            </div>
          {/if}
          <EntrantList entrants={current.entrants} />
        </aside>
      </div>
    {:else}
      <p class="stage-waiting">Waiting for the first roll.</p>
    {/if}

    {#if results.length > 0}
      <section class="stage-results" aria-label="Winners">
        <PrizeBoard rows={results} />
      </section>
    {/if}

    <a class="stage-back focus-ring" href={`/events/${data.event.slug}`}>
      ← Back to {data.event.name}
    </a>
  </div>
</EventSky>

<style>
  .stage {
    display: grid;
    justify-items: center;
    gap: 34px;
    min-height: 100vh;
    padding: calc(3.5rem + 40px) clamp(16px, 4vw, 48px) 48px;
    align-content: start;
  }

  .stage-head {
    display: grid;
    justify-items: center;
    gap: 10px;
    text-align: center;
  }

  .stage-kicker {
    color: var(--ev-accent, var(--color-gold));
    font-family: var(--font-display);
    font-size: var(--text-xs);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
  }

  .stage-name {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: clamp(1.4rem, 4vw, 2.4rem);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    text-transform: uppercase;
  }

  .stage-live {
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(240px, 320px);
    gap: clamp(24px, 4vw, 56px);
    align-items: start;
    width: min(1180px, 100%);
  }

  .stage-side {
    display: grid;
    gap: 18px;
    min-width: 0;
  }

  .stage-prize {
    display: grid;
    gap: 6px;
    padding: 16px 18px;
    border: 1px solid color-mix(in srgb, var(--color-gold) 45%, transparent);
  }

  .stage-prize-label {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-widest);
    text-transform: uppercase;
  }

  .stage-prize-name {
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-base);
    letter-spacing: var(--tracking-wide);
    text-transform: uppercase;
    overflow-wrap: anywhere;
  }

  .stage-prize-art {
    width: 22px;
    height: 22px;
    margin-right: 8px;
    image-rendering: pixelated;
    vertical-align: -4px;
  }

  .stage-waiting {
    margin: 10vh 0;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-base);
  }

  .stage-results {
    width: min(880px, 100%);
  }

  .stage-back {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-decoration: none;
    text-transform: uppercase;
    transition: color var(--dur-fast) ease;
  }

  .stage-back:hover {
    color: var(--color-gold);
  }

  @media (max-width: 900px) {
    .stage-live {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
