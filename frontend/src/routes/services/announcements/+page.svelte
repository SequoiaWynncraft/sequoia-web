<script lang="ts">
  import { BRAND, pageTitle } from "#lib/site/brand.js";
  import PageHeader from "#lib/components/PageHeader.svelte";
  import PageScaffold from "#lib/components/PageScaffold.svelte";
  import PostHub from "#lib/posts/components/PostHub.svelte";
  import { pageView } from "#lib/site/nav.js";

  let { data } = $props();

  const page = pageView("/services/announcements");
</script>

<svelte:head>
  <title>{pageTitle("Announcements")}</title>
  <meta name="description" content={`Announcements from ${BRAND.name}.`} />
</svelte:head>

<PageScaffold crumbs={page.crumbs} tabs={page.tabs} width="xl">
  {#snippet children()}
    <PageHeader kicker={page.kicker} title={page.title} lead={page.lead} />
    <PostHub hub={data.hub} feed="announcements" />
  {/snippet}
</PageScaffold>
