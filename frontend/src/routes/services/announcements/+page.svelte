<script lang="ts">
  import PageHeader from "#lib/components/PageHeader.svelte";
  import PageScaffold from "#lib/components/PageScaffold.svelte";
  import PostHub from "#lib/posts/components/PostHub.svelte";
  import { pageView } from "#lib/site/nav.js";

  let { data } = $props();

  const page = pageView("/services/announcements");
</script>

<svelte:head>
  <title>Announcements - Sequoia</title>
  <meta name="description" content="Announcements from Sequoia." />
</svelte:head>

<PageScaffold crumbs={page.crumbs} tabs={page.tabs} width="xl">
  {#snippet children()}
    <PageHeader kicker={page.kicker} title={page.title} lead={page.lead} />
    <PostHub hub={data.hub} feed="announcements" />
  {/snippet}
</PageScaffold>
