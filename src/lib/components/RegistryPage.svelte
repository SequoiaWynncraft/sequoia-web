<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Placeholder from "$lib/components/Placeholder.svelte";
  import SubpageGrid from "$lib/components/SubpageGrid.svelte";
  import { pageView } from "$lib/site/nav";

  let {
    path,
    width = "lg",
  }: {
    path: string;
    width?: "md" | "lg" | "xl";
  } = $props();

  const page = $derived(pageView(path));
</script>

<PageScaffold crumbs={page.crumbs} tabs={page.tabs} {width}>
  {#snippet children()}
    <PageHeader kicker={page.kicker} title={page.title} lead={page.lead} />
    {#if page.cards.length > 0}
      <SubpageGrid items={page.cards} />
    {:else}
      <Placeholder>{page.placeholder ?? page.title}</Placeholder>
    {/if}
  {/snippet}
</PageScaffold>
