<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Placeholder from "$lib/components/Placeholder.svelte";
  import { tabsFor } from "$lib/site/nav";
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "Statistics", to: "/statistics" }, { label: "Guilds", to: "/statistics/guilds" }, { label: "War" }]} tabs={tabsFor("/statistics/guilds")}>
  {#snippet children()}
    <PageHeader kicker="Guilds" title="War" lead="Territory wars, win rate, and battle history." />
    <Placeholder>Guild War</Placeholder>
  {/snippet}
</PageScaffold>
