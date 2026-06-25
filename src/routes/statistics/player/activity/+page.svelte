<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Placeholder from "$lib/components/Placeholder.svelte";
  import { tabsFor } from "$lib/site/nav";
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "Statistics", to: "/statistics" }, { label: "Player", to: "/statistics/player" }, { label: "Activity" }]} tabs={tabsFor("/statistics/player")}>
  {#snippet children()}
    <PageHeader kicker="Player" title="Activity" lead="Playtime, contributed XP, and session history." />
    <Placeholder>Player Activity</Placeholder>
  {/snippet}
</PageScaffold>
