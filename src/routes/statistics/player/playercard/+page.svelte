<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Placeholder from "$lib/components/Placeholder.svelte";
  import { tabsFor } from "$lib/site/nav";
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "Statistics", to: "/statistics" }, { label: "Player", to: "/statistics/player" }, { label: "Playercard" }]} tabs={tabsFor("/statistics/player")}>
  {#snippet children()}
    <PageHeader kicker="Player" title="Playercard" lead="A shareable profile summary for any member." />
    <Placeholder>Playercard</Placeholder>
  {/snippet}
</PageScaffold>
