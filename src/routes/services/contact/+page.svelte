<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Placeholder from "$lib/components/Placeholder.svelte";
  import { tabsFor } from "$lib/site/nav";
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "Services", to: "/services" }, { label: "Contact" }]} tabs={tabsFor("/services")}>
  {#snippet children()}
    <PageHeader kicker="Services" title="Contact" lead="Reach the Branchmasters directly." />
    <Placeholder>Contact</Placeholder>
  {/snippet}
</PageScaffold>
