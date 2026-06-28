<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Placeholder from "$lib/components/Placeholder.svelte";
  import { pageView } from "$lib/site/nav";

  const page = pageView("/services/requests");
</script>

<PageScaffold crumbs={page.crumbs} tabs={page.tabs}>
  {#snippet children()}
    <PageHeader kicker={page.kicker} title={page.title} lead={page.lead} />
    <Placeholder>{page.placeholder}</Placeholder>
  {/snippet}
</PageScaffold>
