<script lang="ts">
  import PageHeader from "$lib/components/PageHeader.svelte";
  import PostHub from "$lib/posts/components/PostHub.svelte";

  let { data } = $props();
</script>

<svelte:head>
  <title>News - Sequoia</title>
  <meta name="description" content="News and updates from Sequoia." />
</svelte:head>

<div class="news-page">
  <PageHeader kicker="Sequoia" title="News" />
  <PostHub hub={data.hub} feed="news" />
</div>

<style>
  .news-page {
    width: min(1200px, 100% - 3rem);
    margin: 0 auto;
    padding-bottom: 40px;
  }

  @media (max-width: 700px) {
    .news-page {
      width: min(1200px, 100% - 2rem);
    }
  }
</style>
