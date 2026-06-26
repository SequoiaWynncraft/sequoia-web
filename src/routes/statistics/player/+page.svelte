<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import SubpageGrid from "$lib/components/SubpageGrid.svelte";
  import { pageView } from "$lib/site/nav";

  const page = pageView("/statistics/player");
</script>

<PageScaffold crumbs={page.crumbs} tabs={page.tabs}>
  {#snippet children()}
    <PageHeader kicker={page.kicker} title={page.title} lead={page.lead} />
    <SubpageGrid items={page.cards} />
  {/snippet}
</PageScaffold>
