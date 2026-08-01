<script lang="ts">
  import PageHeader from "$lib/components/PageHeader.svelte";
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import EventSky from "$lib/events/components/EventSky.svelte";
  import EventMeta from "$lib/events/components/EventMeta.svelte";
  import GoalMeter from "$lib/events/components/GoalMeter.svelte";
  import type { HubEvent } from "$lib/events/helpers";
  import { raidIconUrl } from "$lib/events/raidIcons";
  import type { EventStatus } from "$lib/events/types";

  let { data } = $props();

  const shelves: { status: EventStatus; label: string; events: HubEvent[] }[] = $derived(
    [
      { status: "live" as const, label: "Live now", events: data.groups.live },
      { status: "upcoming" as const, label: "Upcoming", events: data.groups.upcoming },
      { status: "ended" as const, label: "Past", events: data.groups.past },
    ].filter((shelf) => shelf.events.length > 0),
  );

  function statusOf(shelf: EventStatus, event: HubEvent): EventStatus {
    return shelf === "upcoming" && !event.startsAt ? "tba" : shelf;
  }
</script>

<svelte:head>
  <title>Events - Sequoia</title>
  <meta name="description" content="Sequoia guild events - live, upcoming, and past." />
</svelte:head>

<div class="ev-hub">
  <PageHeader kicker="Sequoia" title="Events" />
  {#if data.manager}
    <a class="ev-manage-link focus-ring" href="/events/manage">◆ Manage</a>
  {/if}

  {#each shelves as shelf (shelf.status)}
    <section class="ev-shelf" aria-label="{shelf.label} events">
      <SectionLabel meta={String(shelf.events.length)}>
        {#snippet children()}{shelf.label}{/snippet}
      </SectionLabel>
      <div class="ev-stack">
        {#each shelf.events as event (event.slug)}
          {@const status = statusOf(shelf.status, event)}
          <a class="ev-band-link focus-ring" href={`/events/${event.slug}`}>
            <EventSky theme={event.theme} dim={status === "ended"}>
              <div class="ev-band ev-band-{status}">
                {#if event.icon}
                  <img class="ev-band-icon" src={raidIconUrl(event.icon.file)} alt="" />
                {/if}
                <div class="ev-band-main">
                  <span class="ev-band-title">
                    <span class="ev-band-name">{event.name}</span>
                    {#if event.draft}
                      <span class="ev-band-draft">Draft</span>
                    {/if}
                  </span>
                  <span class="ev-band-tagline">{event.tagline}</span>
                </div>
                <div class="ev-band-side">
                  <EventMeta {event} {status} align="end" showStatus={false} />
                  {#if status === "live" && event.goal}
                    <div class="ev-band-goal">
                      {#await data.progress}
                        <GoalMeter goal={event.goal} current={null} size="band" />
                      {:then progress}
                        <GoalMeter goal={event.goal} current={progress[event.slug] ?? null} size="band" />
                      {/await}
                    </div>
                  {/if}
                </div>
              </div>
            </EventSky>
          </a>
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .ev-hub {
    position: relative;
    width: min(1200px, 100% - 3rem);
    margin: 0 auto;
    padding-bottom: 40px;
  }

  .ev-manage-link {
    position: absolute;
    top: 14px;
    right: 0;
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-decoration: none;
    text-transform: uppercase;
    transition: color var(--dur-fast) ease;
  }

  .ev-manage-link:hover {
    color: var(--color-gold);
  }

  .ev-shelf {
    margin-bottom: 44px;
  }

  .ev-stack {
    display: grid;
    gap: 12px;
  }

  .ev-band-link {
    display: block;
    text-decoration: none;
  }

  .ev-band-link:hover :global(.ev-sky) {
    border-color: color-mix(in srgb, var(--ev-accent) 45%, var(--color-border-subtle));
  }

  .ev-band {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 26px 28px;
  }

  .ev-band-ended {
    padding: 16px 28px;
  }

  .ev-band-icon {
    flex-shrink: 0;
    width: 36px;
    height: 36px;
    image-rendering: pixelated;
  }

  .ev-band-ended .ev-band-icon {
    width: 28px;
    height: 28px;
  }

  .ev-band-main {
    display: grid;
    gap: 6px;
    min-width: 0;
    /* The icon marks the row; the name keeps the remaining width. */
    flex-grow: 1;
  }

  .ev-band-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }

  /* Only managers are ever sent a draft, so the badge doubles as the cue that
     this shelf is showing more than the guild can see. */
  .ev-band-draft {
    flex-shrink: 0;
    padding: 2px 7px;
    border: 1px solid color-mix(in srgb, var(--color-gold) 45%, transparent);
    border-radius: var(--radius-sm);
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .ev-band-name {
    background: linear-gradient(90deg, var(--ev-accent), var(--ev-accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    text-transform: uppercase;
  }

  .ev-band-ended .ev-band-name {
    font-size: var(--text-base);
  }

  .ev-band-tagline {
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  .ev-band-ended .ev-band-tagline {
    display: none;
  }

  .ev-band-side {
    display: grid;
    justify-items: end;
    gap: 12px;
    flex-shrink: 0;
  }

  .ev-band-goal {
    width: min(300px, 100%);
  }

  @media (max-width: 700px) {
    .ev-hub {
      width: min(1200px, 100% - 2rem);
    }

    .ev-band {
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
      padding: 20px 18px;
    }

    .ev-band-side {
      justify-items: start;
    }

    .ev-band-goal {
      width: 100%;
    }
  }
</style>
