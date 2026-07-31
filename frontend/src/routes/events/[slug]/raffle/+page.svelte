<script lang="ts">
  import { untrack } from "svelte";

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

  // A roll only reaches the wheel while its raffle and slot still exist in
  // the event - a save can remove either, and the feed's copy would
  // otherwise keep replaying configuration that is gone.
  const current = $derived.by(() => {
    const roll = feed?.current ?? null;
    if (!roll) return null;
    const raffle = (data.event.raffles ?? []).find((entry) => entry.id === roll.raffleId);
    return raffle && roll.slot < raffle.winnerCount ? roll : null;
  });

  // One row per declared winner slot: a settled live roll wins over the
  // winner stored in the event JSON (which only refreshes on reload).
  const results = $derived(
    (data.event.raffles ?? []).flatMap((raffle) =>
      Array.from({ length: raffle.winnerCount }, (_unused, slot) => {
        const live = feed?.rolls[`${raffle.id}:${slot}`];
        const winner =
          live && live.state === "settled"
            ? live.winner.username
            : (raffle.winners?.find((entry) => entry.slot === slot)?.username ?? null);
        return { key: `${raffle.id}:${slot}`, prize: raffle.prize, winner };
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
          <RaffleWheel roll={current} />
        {/key}
        <aside class="stage-side" aria-label="This draw">
          {#if current.prize}
            <div class="stage-prize">
              <span class="stage-prize-label">Prize</span>
              <span class="stage-prize-name">{current.prize}</span>
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
        {#each results as row (row.key)}
          <div class="stage-result">
            <span class="stage-result-winner" class:stage-result-unrolled={!row.winner}>
              {row.winner ?? "Not rolled"}
            </span>
            <span class="stage-result-prize">{row.prize}</span>
          </div>
        {/each}
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

  .stage-waiting {
    margin: 10vh 0;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-base);
  }

  .stage-results {
    display: grid;
    gap: 8px;
    width: min(720px, 100%);
  }

  .stage-result {
    display: grid;
    grid-template-columns: minmax(0, 2fr) minmax(0, 3fr);
    gap: 10px;
  }

  .stage-result-winner,
  .stage-result-prize {
    padding: 9px 12px;
    border: 1px solid var(--color-border-subtle);
    background: color-mix(in srgb, var(--color-abyss) 45%, transparent);
    color: var(--text-body);
    font-family: var(--font-data);
    font-size: var(--text-sm);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .stage-result-unrolled {
    color: var(--text-muted);
    font-style: italic;
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
