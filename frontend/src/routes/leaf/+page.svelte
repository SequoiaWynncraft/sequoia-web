<script lang="ts">
  import PageHeader from "#lib/components/PageHeader.svelte";
  import PageScaffold from "#lib/components/PageScaffold.svelte";
  import { pageTitle } from "#lib/site/brand.js";
  import { pageView } from "#lib/site/nav.js";
  import type { RatePart } from "#lib/server/leafGuide.js";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();

  const view = pageView("/leaf");
  const GUILD_TOWN_URL = "https://leaf.seqwawa.com/play/town/";
  const QUEST_SWAPS = "Quest swaps";

  const leaf = (amount: number) => amount.toLocaleString("en-US");
  const showsQuestSwaps = $derived(data.rates?.sections.some((section) => section.name === QUEST_SWAPS) ?? false);
</script>

<svelte:head>
  <title>{pageTitle("Leaf")}</title>
  <meta
    name="description"
    content="Leaf is Sequoia's guild currency. Members earn Leaf and XP from raids, wars and quests."
  />
</svelte:head>

<!-- Kept on one line: whitespace between the branches would render as stray spaces. -->
{#snippet rateText(parts: RatePart[])}{#each parts as part, index (index)}{#if part.kind === "break"}<br />{:else if part.kind === "strong"}<strong>{part.text}</strong>{:else}{part.text}{/if}{/each}{/snippet}

<PageScaffold crumbs={view.crumbs} width="md">
  {#snippet children()}
    <PageHeader title={view.title} />

    <div class="leaf-guide">
      <p>
        Leaf is Sequoia's guild currency. Members earn Leaf and XP from raids, wars and quests. XP adds up to
        a Sequoia level.
      </p>

      <h2>Where to see your Leaf</h2>
      <ul>
        <li>
          In the Sequoia mod: run <code>/seq quests</code>, or click your profile card at the foot of the Sequoia
          sidebar. It shows your Leaf, your level and your quests. If it asks you to connect, run
          <code>/seq connect</code>.
        </li>
        <li>
          In Guild Town, the guild's game in the browser:
          <a href={GUILD_TOWN_URL} target="_blank" rel="noreferrer">leaf.seqwawa.com/play/town</a>.
        </li>
      </ul>

      <h2>Rates</h2>
      {#if data.rates}
        {#each data.rates.sections as section, index (index)}
          <h3>{section.name}</h3>
          <p>{@render rateText(section.parts)}</p>
        {/each}
        {#if data.rates.changed}
          <p class="leaf-changed">Last changed <time datetime={data.rates.changed.at}>{data.rates.changed.label}</time></p>
        {/if}
      {:else}
        <p>Leaf's rates can't be shown right now.</p>
      {/if}

      <h2>Spending Leaf</h2>
      <h3>Quest swaps</h3>
      <p>
        Swap a daily or weekly quest you don't want.{#if showsQuestSwaps}{" "}The price is under Quest swaps above.{/if}
      </p>

      <h3>Tome and aspect requests</h3>
      <p>
        Requests in the request channel on Discord stay free for members with at least 40 guild raids in the past
        7 days, or the HQ Team role, and 7 days in the guild.
      </p>
      <p>
        Any member with 7 days in the guild can also buy an extra request with Leaf, on top of a free one, with the request channel's Leaf buttons{#if data.prices}:
          {leaf(data.prices.tome)} Leaf for a tome request, {leaf(data.prices.aspect)} Leaf for an aspect request.{:else}, which show the price.{/if}
        A request paid with Leaf goes ahead of free requests in the queue.
      </p>

      {#if data.prices?.le}
        <h3>LE for Leaf</h3>
        <p>
          Any member with 7 days in the guild can turn Leaf into LE: {leaf(data.prices.le.leafPerLe)} Leaf for 1 LE,
          at least {leaf(data.prices.le.minimum)} LE. Ask with the request channel's LE with Leaf button, or at the
          Treasury in Guild Town. Staff pay it in game, and a denied request gives all its Leaf back.
        </p>
      {/if}

      <h2>Who can use it</h2>
      <p>
        Leaf is for current Sequoia members. Anyone signed in to seqwawa.com can play Guild Town as a guest,
        without Leaf. Guild Town's games pay Coins, not Leaf.
      </p>
    </div>
  {/snippet}
</PageScaffold>

<style>
  .leaf-guide {
    color: var(--text-body);
    font-size: var(--text-base);
    line-height: var(--leading-normal);
    overflow-wrap: anywhere;
    padding-bottom: 2.5rem;
  }

  .leaf-guide p,
  .leaf-guide ul {
    margin: 0 0 14px;
  }

  .leaf-guide h2,
  .leaf-guide h3 {
    font-family: var(--font-display);
    font-weight: var(--weight-regular);
    letter-spacing: var(--tracking-wide);
    line-height: var(--leading-tight);
    text-transform: uppercase;
  }

  .leaf-guide h2 {
    margin: 36px 0 12px;
    color: var(--text-heading);
    font-size: var(--text-lg);
  }

  .leaf-guide h3 {
    margin: 22px 0 8px;
    color: var(--color-gold);
    font-size: var(--text-sm);
  }

  .leaf-guide h2 + h3 {
    margin-top: 0;
  }

  .leaf-guide ul {
    padding-left: 1.4em;
  }

  .leaf-guide li {
    margin: 6px 0;
  }

  .leaf-guide li::marker {
    color: var(--color-gold);
  }

  .leaf-guide a {
    color: var(--color-gold);
    text-underline-offset: 3px;
  }

  .leaf-guide strong {
    color: var(--text-heading);
  }

  .leaf-guide code {
    padding: 1px 5px;
    background: color-mix(in srgb, var(--color-border-subtle) 55%, transparent);
    font-family: var(--font-data);
    font-size: 0.9em;
    white-space: nowrap;
  }

  .leaf-changed {
    color: var(--text-muted);
    font-size: var(--text-sm);
  }
</style>
