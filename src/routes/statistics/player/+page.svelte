<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import SubpageGrid from "$lib/components/SubpageGrid.svelte";
  import { tabsFor } from "$lib/site/nav";
  const tabs = tabsFor("/statistics/player");
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "Statistics", to: "/statistics" }, { label: "Player" }]} {tabs}>
  {#snippet children()}
    <PageHeader kicker="Statistics · Player" title="Player Statistics" lead="Individual member stats: raids, activity, and playercards." />
    <SubpageGrid items={tabs} />
  {/snippet}
</PageScaffold>
