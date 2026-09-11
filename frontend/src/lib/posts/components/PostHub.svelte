<script lang="ts">
  import SectionLabel from "$lib/design-system/components/SectionLabel.svelte";
  import EventSky from "$lib/events/components/EventSky.svelte";
  import type { PostCard, PostHub } from "$lib/server/postPages";
  import { webAuthStartUrl } from "$lib/site/webAuth";

  import { formatPostDate } from "../format";
  import { POST_FEEDS, postHref, type PostFeed, type PostStatus } from "../types";

  let { hub, feed }: { hub: PostHub; feed: PostFeed } = $props();

  const STATUS_CHIPS: Partial<Record<PostStatus, string>> = {
    draft: "Draft",
    scheduled: "Scheduled",
    expired: "Expired",
  };

  const noun = $derived(POST_FEEDS[feed].label.toLowerCase());
  const shelves = $derived(
    [
      { key: "pinned", label: "Pinned", cards: hub.pinned },
      { key: "latest", label: "Latest", cards: hub.latest },
      // Only managers are ever sent these two, so the shelves double as the cue
      // that the page is showing more than the guild can see.
      { key: "upcoming", label: "Drafts and scheduled", cards: hub.upcoming },
      { key: "expired", label: "Expired", cards: hub.expired },
    ].filter((shelf) => shelf.cards.length > 0),
  );
</script>

{#snippet band(card: PostCard, compact: boolean)}
  <a class="ps-band-link focus-ring" href={postHref(card)}>
    <EventSky theme={card.theme} dim={card.status === "expired"}>
      <div class="ps-band" class:ps-band-compact={compact}>
        <div class="ps-band-main">
          <span class="ps-band-title">
            {#if card.pinned && card.status === "live"}
              <span class="ps-band-pin" aria-hidden="true">✦</span>
            {/if}
            <span class="ps-band-name">{card.title}</span>
          </span>
          <span class="ps-band-summary">{card.summary}</span>
        </div>
        <div class="ps-band-side">
          {#if STATUS_CHIPS[card.status] || card.audience}
            <span class="ps-chips">
              {#if STATUS_CHIPS[card.status]}
                <span class="ps-chip ps-chip-status">{STATUS_CHIPS[card.status]}</span>
              {/if}
              {#if card.audience}
                <span class="ps-chip">{card.audience}</span>
              {/if}
            </span>
          {/if}
          <span class="ps-band-meta">
            <time datetime={card.date}>{formatPostDate(card.date)}</time>
            {#if card.author}<span>· {card.author}</span>{/if}
          </span>
        </div>
      </div>
    </EventSky>
  </a>
{/snippet}

<div class="ps-hub">
  {#if hub.manager}
    <nav class="ps-actions" aria-label="Post management">
      <a class="focus-ring" href="/manage/community/posts?feed={feed}"><span aria-hidden="true">◆</span> Manage</a>
      <a class="focus-ring" href="/manage/community/posts/new?feed={feed}"><span aria-hidden="true">✦</span> New post</a>
    </nav>
  {/if}

  {#if shelves.length === 0}
    <div class="ps-empty">
      <span class="ps-empty-spark" aria-hidden="true">✦</span>
      <p class="ps-empty-title">No {noun} right now</p>
      {#if hub.manager}
        <p class="ps-empty-text">
          <a class="focus-ring" href="/manage/community/posts/new?feed={feed}">Write the first one</a>
        </p>
      {:else if !hub.signedIn}
        <p class="ps-empty-text">
          Some posts are just for the guild.
          <a class="focus-ring" href={webAuthStartUrl()}>Sign in</a> to see them.
        </p>
      {/if}
    </div>
  {/if}

  {#each shelves as shelf (shelf.key)}
    <section class="ps-shelf" aria-label="{shelf.label} {noun}">
      <SectionLabel meta={String(shelf.cards.length)}>
        {#snippet children()}{shelf.label}{/snippet}
      </SectionLabel>
      <div class="ps-stack">
        {#each shelf.cards as card (card.slug)}
          {@render band(card, shelf.key === "expired")}
        {/each}
      </div>
    </section>
  {/each}
</div>

<style>
  .ps-hub {
    position: relative;
  }

  .ps-actions {
    display: flex;
    justify-content: flex-end;
    gap: 18px;
    margin: -8px 0 18px;
  }

  .ps-actions a {
    color: var(--text-muted);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-decoration: none;
    text-transform: uppercase;
    transition: color var(--dur-fast) ease;
  }

  .ps-actions a:hover {
    color: var(--color-gold);
  }

  .ps-shelf {
    margin-bottom: 44px;
  }

  .ps-stack {
    display: grid;
    gap: 12px;
  }

  .ps-band-link {
    display: block;
    text-decoration: none;
  }

  .ps-band-link:hover :global(.ev-sky) {
    border-color: color-mix(in srgb, var(--ev-accent) 45%, var(--color-border-subtle));
  }

  .ps-band {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
    padding: 24px 28px;
  }

  .ps-band-compact {
    padding: 14px 28px;
  }

  .ps-band-main {
    display: grid;
    flex-grow: 1;
    gap: 6px;
    min-width: 0;
  }

  .ps-band-title {
    display: flex;
    align-items: baseline;
    gap: 10px;
    min-width: 0;
  }

  .ps-band-pin {
    flex-shrink: 0;
    color: var(--ev-accent);
    font-size: var(--text-sm);
    text-shadow: 0 0 14px color-mix(in srgb, var(--ev-accent) 60%, transparent);
  }

  .ps-band-name {
    background: linear-gradient(90deg, var(--ev-accent), var(--ev-accent-2));
    -webkit-background-clip: text;
    background-clip: text;
    -webkit-text-fill-color: transparent;
    font-family: var(--font-display);
    font-size: var(--text-xl);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    overflow-wrap: anywhere;
    text-transform: uppercase;
  }

  .ps-band-compact .ps-band-name {
    font-size: var(--text-base);
  }

  .ps-band-summary {
    color: var(--text-body);
    font-size: var(--text-sm);
  }

  .ps-band-compact .ps-band-summary {
    display: none;
  }

  .ps-band-side {
    display: grid;
    flex-shrink: 0;
    justify-items: end;
    gap: 10px;
  }

  .ps-chips {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    gap: 6px;
  }

  .ps-chip {
    padding: 3px 8px 2px;
    border: 1px solid color-mix(in srgb, var(--color-gold) 35%, transparent);
    color: var(--color-gold);
    font-family: var(--font-display);
    font-size: var(--text-2xs);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
    white-space: nowrap;
  }

  .ps-chip-status {
    border-color: var(--color-border-accent);
    color: var(--text-muted);
  }

  .ps-band-meta {
    display: flex;
    gap: 6px;
    color: var(--text-muted);
    font-family: var(--font-data);
    font-size: var(--text-xs);
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
  }

  .ps-empty {
    display: grid;
    justify-items: center;
    gap: 8px;
    margin: 24px auto 48px;
    padding: 44px 24px;
    border: 1px solid var(--color-border-subtle);
    text-align: center;
  }

  .ps-empty-spark {
    color: var(--color-gold);
    font-size: 1.1rem;
  }

  .ps-empty-title {
    margin: 0;
    color: var(--text-heading);
    font-family: var(--font-display);
    font-size: var(--text-sm);
    letter-spacing: var(--tracking-wider);
    text-transform: uppercase;
  }

  .ps-empty-text {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--text-sm);
  }

  .ps-empty-text a {
    color: var(--color-gold);
  }

  @media (max-width: 700px) {
    .ps-band {
      flex-direction: column;
      align-items: stretch;
      gap: 14px;
      padding: 20px 18px;
    }

    .ps-band-side,
    .ps-chips {
      justify-items: start;
      justify-content: flex-start;
    }
  }
</style>
