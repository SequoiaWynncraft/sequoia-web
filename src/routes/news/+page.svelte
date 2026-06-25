<script lang="ts">
  import PageScaffold from "$lib/components/PageScaffold.svelte";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import Placeholder from "$lib/components/Placeholder.svelte";
</script>

<PageScaffold crumbs={[{ label: "Home", to: "/" }, { label: "News" }]}>
  {#snippet children()}
    <PageHeader kicker="News" title="Public Announcements" lead="Latest news and public updates from Sequoia." />
    <Placeholder>News</Placeholder>
  {/snippet}
</PageScaffold>
