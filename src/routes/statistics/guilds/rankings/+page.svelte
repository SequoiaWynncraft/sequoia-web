<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Placeholder from "$lib/components/Placeholder.svelte";
  import { tabsFor } from "$lib/site/nav";
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "Statistics", to: "/statistics" }, { label: "Guilds", to: "/statistics/guilds" }, { label: "Rankings" }]} tabs={tabsFor("/statistics/guilds")}>
  {#snippet children()}
    <PageHeader kicker="Guilds" title="Rankings" lead="Season standings against rival guilds." />
    <Placeholder>Guild Rankings</Placeholder>
  {/snippet}
</PageScaffold>
