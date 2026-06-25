<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import SubpageGrid from "$lib/components/SubpageGrid.svelte";
  import { tabsFor } from "$lib/site/nav";
  const tabs = tabsFor("/statistics/guilds");
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "Statistics", to: "/statistics" }, { label: "Guilds" }]} {tabs}>
  {#snippet children()}
    <PageHeader kicker="Statistics · Guilds" title="Guild Statistics" lead="Guild-wide war, raid, and ranking statistics." />
    <SubpageGrid items={tabs} />
  {/snippet}
</PageScaffold>
