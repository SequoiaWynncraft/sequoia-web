<script lang="ts">
  import PageScaffold from "#lib/components/PageScaffold.svelte";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import Placeholder from "#lib/components/Placeholder.svelte";
  import SubpageGrid from "#lib/components/SubpageGrid.svelte";
  import { pageView } from "#lib/site/nav.js";
  import { DEFAULT_HIDDEN_NAV, visibleCards } from "#lib/site/navPreferences.js";
  import { page as appPage } from "$app/state";

  let {
    path,
    width = "lg",
  }: {
    path: string;
    width?: "md" | "lg" | "xl";
  } = $props();

  const page = $derived(pageView(path));
  const cards = $derived(
    visibleCards(page.cards, appPage.data.navHidden ?? [...DEFAULT_HIDDEN_NAV]),
  );
</script>

<PageScaffold crumbs={page.crumbs} tabs={page.tabs} {width}>
  {#snippet children()}
    <PageHeader kicker={page.kicker} title={page.title} lead={page.lead} />
    {#if cards.length > 0}
      <SubpageGrid items={cards} />
    {:else}
      <Placeholder>{page.placeholder ?? page.title}</Placeholder>
    {/if}
  {/snippet}
</PageScaffold>
