<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Placeholder from "$lib/components/Placeholder.svelte";
  import { tabsFor } from "$lib/site/nav";
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "Services", to: "/services" }, { label: "Announcements" }]} tabs={tabsFor("/services")}>
  {#snippet children()}
    <PageHeader kicker="Services" title="Announcements" lead="Guild-internal announcements for members." />
    <Placeholder>Announcements</Placeholder>
  {/snippet}
</PageScaffold>
