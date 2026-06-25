<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import SubpageGrid from "$lib/components/SubpageGrid.svelte";
  import { tabsFor } from "$lib/site/nav";
  const tabs = tabsFor("/services");
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "Services" }]} {tabs}>
  {#snippet children()}
    <PageHeader kicker="Services" title="Community" lead="Sequoia services: bagshop, posts, contact, and requests." />
    <SubpageGrid items={tabs} />
  {/snippet}
</PageScaffold>
