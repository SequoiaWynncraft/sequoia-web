<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Placeholder from "$lib/components/Placeholder.svelte";
  import { tabsFor } from "$lib/site/nav";
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "Services", to: "/services" }, { label: "Bagshop" }]} tabs={tabsFor("/services")}>
  {#snippet children()}
    <PageHeader kicker="Services" title="Bagshop" lead="Marketplace for crafter bags from raids." />
    <Placeholder>Bagshop</Placeholder>
  {/snippet}
</PageScaffold>
